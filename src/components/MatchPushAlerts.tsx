"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getJson, putJson } from "@/lib/apiClient";
import type { Fixture } from "@/lib/fixtures";

const ALERT_KEYS = ["kickoff", "goal", "yellowCard", "redCard", "finished"] as const;
type AlertKey = (typeof ALERT_KEYS)[number];
type AlertSettings = Record<AlertKey, boolean>;

const ALERT_LABELS: Record<AlertKey, { fr: string; en: string }> = {
  kickoff: { fr: "Coup d’envoi", en: "Kick-off" },
  goal: { fr: "But", en: "Goal" },
  yellowCard: { fr: "Carton jaune", en: "Yellow card" },
  redCard: { fr: "Carton rouge", en: "Red card" },
  finished: { fr: "Fin du match", en: "Full time" },
};

const EMPTY_ALERTS: AlertSettings = {
  kickoff: false,
  goal: false,
  yellowCard: false,
  redCard: false,
  finished: false,
};

interface Subscription {
  fixture: Pick<Fixture, "id" | "homeTeam" | "awayTeam">;
  alerts: AlertSettings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSubscriptions(value: unknown): Subscription[] {
  if (!Array.isArray(value)) throw new Error("La liste des alertes reçue est invalide.");
  return value.map(entry => {
    if (!isRecord(entry) || !isRecord(entry.fixture) || !isRecord(entry.alerts)) {
      throw new Error("Une alerte reçue est invalide.");
    }
    const { id, homeTeam, awayTeam } = entry.fixture;
    if (typeof id !== "string" || typeof homeTeam !== "string" || typeof awayTeam !== "string") {
      throw new Error("Les informations d’un match suivi sont invalides.");
    }
    const rawAlerts: Record<string, unknown> = entry.alerts;
    const alerts = Object.fromEntries(
      ALERT_KEYS.map(key => [key, rawAlerts[key] === true])
    ) as AlertSettings;
    return { fixture: { id, homeTeam, awayTeam }, alerts };
  });
}

async function readSubscriptions(response: Response): Promise<Subscription[]> {
  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload)) throw new Error("Le serveur a renvoyé une réponse invalide.");
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Erreur serveur (${response.status}).`);
  }
  return parseSubscriptions(payload.subscriptions);
}

export default function MatchPushAlerts({ fixture }: { fixture: Fixture }) {
  const { user } = useAuth();
  const { text } = useLanguage();
  const isFirebaseUser = user?.id.startsWith("firebase:") === true;
  const [alerts, setAlerts] = useState<AlertSettings>(EMPTY_ALERTS);
  const [savedAlerts, setSavedAlerts] = useState<AlertSettings>(EMPTY_ALERTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isFirebaseUser) return;
    let active = true;
    setLoading(true);
    void getJson("/api/notifications/matches/subscriptions")
      .then(readSubscriptions)
      .then(subscriptions => {
        if (!active) return;
        const current = subscriptions.find(subscription => subscription.fixture.id === fixture.id)?.alerts ?? EMPTY_ALERTS;
        setAlerts(current);
        setSavedAlerts(current);
        setError("");
      })
      .catch(cause => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : text("Impossible de charger les alertes.", "Unable to load alerts."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fixture.id, isFirebaseUser, text]);

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await getJson("/api/notifications/matches/subscriptions");
      const subscriptions = await readSubscriptions(response);
      const otherSubscriptions = subscriptions.filter(subscription => subscription.fixture.id !== fixture.id);
      const hasAlerts = ALERT_KEYS.some(key => alerts[key]);
      const nextSubscriptions = hasAlerts
        ? [...otherSubscriptions, {
          fixture: {
            id: fixture.id,
            homeTeam: fixture.homeTeam,
            awayTeam: fixture.awayTeam,
          },
          alerts,
        }]
        : otherSubscriptions;
      if (nextSubscriptions.length > 30) {
        throw new Error(text(
          "Vous pouvez suivre au maximum 30 matchs à la fois.",
          "You can follow up to 30 matches at a time."
        ));
      }
      const result = await putJson("/api/notifications/matches/subscriptions", {
        subscriptions: nextSubscriptions,
      });
      const payload: unknown = await result.json().catch(() => null);
      if (!result.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : `Erreur serveur (${result.status}).`
        );
      }
      setSavedAlerts(alerts);
      setNotice(hasAlerts
        ? text("Alertes de ce match enregistrées.", "Match alerts saved.")
        : text("Alertes de ce match désactivées.", "Match alerts disabled."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text("Impossible d’enregistrer les alertes.", "Unable to save alerts."));
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = ALERT_KEYS.some(key => alerts[key] !== savedAlerts[key]);

  /*
  return (
    <section className="mt-5 rounded-xl border border-gray-800 bg-gray-900/70 p-4" aria-label={text("Alertes push pour ce match", "Push alerts for this match")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{text("Alertes du match", "Match alerts")}</h2>
          <p className="mt-1 text-xs text-gray-400">
            {text(
              "Recevez des notifications Firebase même lorsque le site est fermé. Activez d’abord les notifications push dans votre profil.",
              "Receive Firebase notifications even when the site is closed. Enable push notifications in your profile first."
            )}
          </p>
        </div>                                            
        <Link href="/profile" className="text-xs font-semibold text-fuchsia-300 hover:text-fuchsia-200">
          {text("Réglages push", "Push settings")} →
        </Link>
      </div>

      {!isFirebaseUser ? (
        <p className="mt-3 text-sm text-amber-300">
          {text("Connectez-vous avec un compte Firebase pour gérer les alertes de match.", "Sign in with a Firebase account to manage match alerts.")}
          {" "}
          <Link href="/login" className="font-semibold underline underline-offset-2">
            {text("Se connecter", "Sign in")}
          </Link>
        </p>
      ) : (
        <>
          <fieldset disabled={loading || saving} className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <legend className="sr-only">{text("Choisir les alertes", "Choose alerts")}</legend>
            {ALERT_KEYS.map(key => (
              <label key={key} className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={alerts[key]}
                  onChange={event => setAlerts(current => ({ ...current, [key]: event.target.checked }))}
                  className="h-4 w-4 accent-fuchsia-500"
                />
                {text(ALERT_LABELS[key].fr, ALERT_LABELS[key].en)}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={() => void save()}
            disabled={loading || saving || !hasUnsavedChanges}
            className="mt-4 rounded-lg bg-fuchsia-700 px-3 py-2 text-xs font-semibold text-white hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? text("Chargement…", "Loading…")
              : saving
                ? text("Enregistrement…", "Saving…")
                : text("Enregistrer les alertes", "Save alerts")}
          </button>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-3 text-xs text-green-300">{notice}</p>}
    </section>
  );
  */

  return null;
}
