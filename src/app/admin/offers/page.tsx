"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminSection from "@/components/AdminSection";
import { getJson, postJson } from "@/lib/apiClient";
import { readAdminOfferLogs, writeAdminOfferLogs, type AdminOfferLog } from "@/lib/adminOffers";
import type { SubscriptionOffer } from "@/lib/subscription";
import { useLanguage } from "@/context/LanguageContext";
import { generateUUID } from "@/lib/uuid";

interface AdminAccount {
  accountKey: string;
  uid: string;
  email: string;
  name: string;
  role: "user" | "admin";
  plan: "standard" | "premium";
  createdAt: string | null;
  trialActive: boolean;
  trialEndsAt: string | null;
  offers: SubscriptionOffer[];
  hasTvAccess: boolean;
  hasCombinationAccess: boolean;
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
}

const OFFERS: { id: SubscriptionOffer; fr: string; en: string }[] = [
  { id: "tv", fr: "TV", en: "TV" },
  { id: "combinations", fr: "Combinaisons", en: "Combinations" },
  { id: "pack", fr: "Pack", en: "Pack" },
];

export default function AdminOffersPage() {
  const { language, text } = useLanguage();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logs, setLogs] = useState<AdminOfferLog[]>([]);
  const [serverEnforced, setServerEnforced] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getJson("/api/admin/offers");
      if (response.status === 503) {
        setServerEnforced(false);
        setAccounts([]);
        return;
      }
      if (response.status === 404) {
        throw new Error(text(
          "Accès refusé : cette page est réservée aux administrateurs.",
          "Access denied: this page is for administrators only."
        ));
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || text("Impossible de charger les comptes.", "Unable to load accounts."));
      }
      const payload = (await response.json()) as { accounts?: AdminAccount[]; serverEnforced?: boolean };
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      setServerEnforced(payload.serverEnforced === true);
    } catch (loadError) {
      setError(loadError instanceof Error
        ? loadError.message
        : text("Impossible de charger les comptes.", "Unable to load accounts."));
    } finally {
      setLoading(false);
    }
  }, [text]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    try {
      setLogs(readAdminOfferLogs().slice().reverse().slice(0, 20));
    } catch {
      setLogs([]);
    }
  }, []);

  const visibleAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter(account =>
      account.email.toLowerCase().includes(query) ||
      account.name.toLowerCase().includes(query) ||
      account.uid.toLowerCase().includes(query)
    );
  }, [accounts, search]);

  const setAccountOffer = async (account: AdminAccount, offer: SubscriptionOffer) => {
    const enabled = !account.offers.includes(offer);
    const label = OFFERS.find(item => item.id === offer);
    if (!enabled && !window.confirm(text(
      `Retirer l’offre ${label?.fr ?? offer} de ${account.email || account.uid} ?`,
      `Remove the ${label?.en ?? offer} plan from ${account.email || account.uid}?`
    ))) {
      return;
    }

    setBusyKey(`${account.accountKey}:${offer}`);
    setError("");
    setNotice("");
    try {
      const response = await postJson("/api/admin/offers", {
        accountKey: account.accountKey,
        offer,
        enabled,
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || text("Impossible de modifier l’offre.", "Unable to update the plan."));
      }
      setNotice(text(
        enabled
          ? `Offre ${label?.fr ?? offer} activée pour ${account.email || account.uid}.`
          : `Offre ${label?.fr ?? offer} retirée pour ${account.email || account.uid}.`,
        enabled
          ? `${label?.en ?? offer} plan enabled for ${account.email || account.uid}.`
          : `${label?.en ?? offer} plan removed from ${account.email || account.uid}.`
      ));
      const log: AdminOfferLog = {
        id: generateUUID(),
        accountKey: account.accountKey,
        userEmail: account.email || account.uid,
        offer,
        action: enabled ? "grant" : "revoke",
        createdAt: new Date().toISOString(),
      };
      const updatedLogs = [...readAdminOfferLogs(), log];
      writeAdminOfferLogs(updatedLogs);
      setLogs(updatedLogs.slice().reverse().slice(0, 20));
      await loadAccounts();
    } catch (saveError) {
      setError(saveError instanceof Error
        ? saveError.message
        : text("Impossible de modifier l’offre.", "Unable to update the plan."));
    } finally {
      setBusyKey("");
    }
  };

  const numberFormat = new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US");
  const dateFormat = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(language === "fr" ? "fr-FR" : "en-US") : "—";

  return (
    <AdminSection
      title={text("Offres et abonnements", "Plans and subscriptions")}
      description={text(
        "Attribuez ou retirez une offre à un compte. Les droits affichés proviennent du serveur (Firestore) : ils font foi pour le quota et l’accès TV.",
        "Grant or remove a plan for an account. The access shown comes from the server (Firestore) and is authoritative for quotas and TV access."
      )}
    >
      {!serverEnforced && !loading && !error && (
        <p className="admin-note mb-6 rounded-2xl p-5 text-sm leading-6 text-violet-100">
          {text(
            "Firebase Admin n’est pas configuré sur ce serveur : la liste des comptes ne peut pas être lue. Configurez un compte de service (variable GOOGLE_APPLICATION_CREDENTIALS ou équivalent) pour activer la gestion des offres depuis cette page.",
            "Firebase Admin is not configured on this server, so the account list cannot be read. Set up a service account (GOOGLE_APPLICATION_CREDENTIALS or equivalent) to enable plan management from this page."
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-6 rounded-lg border border-green-800 bg-green-950/40 p-3 text-sm text-green-200">
          {notice}
        </p>
      )}

      <section className="admin-panel animate-slide-up overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{text("Comptes et droits", "Accounts and access")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {numberFormat.format(accounts.length)} {text("compte(s) lu(s) depuis le serveur", "account(s) read from the server")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              aria-label={text("Rechercher un compte", "Search for an account")}
              placeholder={text("Nom, e-mail ou identifiant", "Name, email or ID")}
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="admin-input w-full rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 sm:max-w-xs"
            />
            <button
              type="button"
              onClick={() => void loadAccounts()}
              disabled={loading}
              className="rounded-full border border-fuchsia-400/30 px-4 py-2.5 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/10 disabled:opacity-50"
            >
              {loading ? text("Chargement…", "Loading…") : text("Actualiser", "Refresh")}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="admin-table-head">
              <tr>
                {[
                  text("Compte", "Account"),
                  text("Rôle", "Role"),
                  text("Essai", "Trial"),
                  text("Quota du jour", "Daily quota"),
                  text("Offres", "Plans"),
                ].map(label => (
                  <th key={label} className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-fuchsia-100/70">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {visibleAccounts.map(account => (
                <tr key={account.accountKey} className="admin-table-row border-t border-white/[0.05] align-top">
                  <td className="px-5 py-4 text-sm">
                    <p className="font-medium text-white">{account.name || "—"}</p>
                    <p className="mt-0.5 text-slate-300">{account.email || "—"}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{account.uid}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {text("Inscription", "Registration")}: {dateFormat(account.createdAt)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                    <span className="rounded-full border border-violet-300/15 bg-violet-400/10 px-2.5 py-1 text-xs text-violet-200">
                      {account.role === "admin" ? text("Administrateur", "Administrator") : text("Utilisateur", "User")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                    {account.trialActive
                      ? text(`Actif jusqu’au ${dateFormat(account.trialEndsAt)}`, `Active until ${dateFormat(account.trialEndsAt)}`)
                      : text("Terminé", "Ended")}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-300">
                    {Number.isFinite(account.remainingToday)
                      ? `${numberFormat.format(account.usedToday)} / ${numberFormat.format(account.dailyLimit)}`
                      : text("Illimité", "Unlimited")}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {account.hasCombinationAccess ? text("Accès combinaisons", "Combinations access") : text("Sans accès combinaisons", "No combinations access")}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {account.role === "admin" ? (
                      <p className="text-xs text-violet-200">
                        {text("Accès complet (rôle administrateur)", "Full access (administrator role)")}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {OFFERS.map(offer => {
                          const active = account.offers.includes(offer.id);
                          const busy = busyKey === `${account.accountKey}:${offer.id}`;
                          return (
                            <button
                              key={offer.id}
                              type="button"
                              onClick={() => void setAccountOffer(account, offer.id)}
                              disabled={busy || busyKey !== ""}
                              aria-pressed={active}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                                active
                                  ? "border-green-600 bg-green-950/50 text-green-200 hover:bg-green-900/50"
                                  : "border-gray-700 text-slate-300 hover:border-fuchsia-400/40 hover:text-white"
                              }`}
                            >
                              {busy
                                ? text("…", "…")
                                : `${text(offer.fr, offer.en)}${active ? ` · ${text("actif", "on")}` : ""}`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      {text("TV", "TV")}: {account.hasTvAccess ? text("accessible", "available") : text("non incluse", "not included")}
                    </p>
                  </td>
                </tr>
              ))}
              {visibleAccounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                    {loading
                      ? text("Chargement des comptes…", "Loading accounts…")
                      : text("Aucun compte ne correspond à cette recherche.", "No account matches this search.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="admin-note border-t border-white/[0.06] px-5 py-4 text-xs text-violet-100">
          {text(
            "Cliquez sur une offre pour l’attribuer ou la retirer. L’action est vérifiée côté serveur (rôle admin) puis écrite dans Firestore : elle est donc effective pour tous les appareils du compte.",
            "Click a plan to grant or remove it. The action is verified server-side (admin role) and written to Firestore, so it applies to every device of the account."
          )}
        </p>
      </section>

      {logs.length > 0 && (
        <section className="admin-panel animate-slide-up mt-6 overflow-hidden rounded-2xl">
          <div className="border-b border-white/[0.06] p-5">
            <h2 className="text-lg font-semibold text-white">{text("Actions récentes", "Recent actions")}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {text(
                "Journal local à ce navigateur : trace des modifications effectuées depuis cet appareil.",
                "Log stored in this browser: a trace of changes made from this device."
              )}
            </p>
          </div>
          <ul className="divide-y divide-gray-800">
            {logs.map(log => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-slate-300">{log.userEmail}</span>
                <span className="text-slate-400">
                  {OFFERS.find(offer => offer.id === log.offer)?.fr ?? log.offer}
                  {" · "}
                  {log.action === "grant" ? text("attribuée", "granted") : text("retirée", "removed")}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(log.createdAt).toLocaleString(language === "fr" ? "fr-FR" : "en-US")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminSection>
  );
}
