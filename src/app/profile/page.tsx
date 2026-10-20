"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { readSavedSelections, type SavedSelection } from "@/lib/savedSelections";
import { readFixtureBasket } from "@/lib/fixtureBasket";
import {
  isFixtureFinished,
  parseFixtureScore,
  settleCoupon,
  settleCouponMatch,
  settleCouponPick,
  type CouponOutcome,
} from "@/lib/couponSettlement";
import type { CouponPick, GeneratedCoupon } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";

const clubs = [
  "Real Madrid",
  "FC Barcelona",
  "Paris Saint-Germain",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Arsenal",
  "Chelsea",
  "Bayern Munich",
];

const leagues = [
  "Premier League",
  "Ligue 1",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "UEFA Champions League",
];

type RiskProfile = "prudent" | "balanced" | "bold";
type ProfileTab = "profile" | "coupons" | "basket";

interface UserPreferences {
  favoriteClub: string;
  fanLevel: number;
  riskProfile: RiskProfile;
  leagues: string[];
  matchIds: number[];
}

const defaultPreferences: UserPreferences = {
  favoriteClub: "",
  fanLevel: 7,
  riskProfile: "prudent",
  leagues: [],
  matchIds: [],
};

function readPreferences(userId: string): UserPreferences {
  const stored = localStorage.getItem(`ikprono_profile_${userId}`);
  if (!stored) return defaultPreferences;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return defaultPreferences;
    const candidate = parsed as Partial<UserPreferences>;
    return {
      favoriteClub: typeof candidate.favoriteClub === "string" ? candidate.favoriteClub : "",
      fanLevel: typeof candidate.fanLevel === "number" ? Math.min(10, Math.max(1, candidate.fanLevel)) : 7,
      riskProfile:
        candidate.riskProfile === "prudent" ||
        candidate.riskProfile === "balanced" ||
        candidate.riskProfile === "bold"
          ? candidate.riskProfile
          : "prudent",
      leagues: Array.isArray(candidate.leagues)
        ? candidate.leagues.filter((league): league is string => typeof league === "string" && leagues.includes(league))
        : [],
      matchIds: Array.isArray(candidate.matchIds)
        ? candidate.matchIds.filter((id): id is number => Number.isSafeInteger(id))
        : [],
    };
  } catch (error) {
    console.error("Impossible de lire les préférences du profil.", error);
    return defaultPreferences;
  }
}

export default function ProfilePage() {
  const { user, updateProfile, isLoading, entitlements } = useAuth();
  const { t, text, language } = useLanguage();
  const { addNotification } = useNotifications();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [savedSelections, setSavedSelections] = useState<SavedSelection[]>([]);
  const [basketFixtures, setBasketFixtures] = useState<Fixture[]>([]);
  const [fixtureStatuses, setFixtureStatuses] = useState<Record<string, Fixture>>({});
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [basketError, setBasketError] = useState("");
  const [refreshKey] = useAutoRefresh();

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setPreferences(readPreferences(user.id));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSavedSelections([]);
      setBasketFixtures([]);
      setFixtureStatuses({});
      setActivityLoading(false);
      return;
    }

    let active = true;
    const syncActivity = async () => {
      try {
        if (active) {
          setBasketFixtures(readFixtureBasket());
          setBasketError("");
        }
      } catch (error) {
        if (active) {
          setBasketError(error instanceof Error
            ? error.message
            : text("Impossible de lire le panier.", "Unable to read the basket."));
        }
      }

      let selections: SavedSelection[];
      try {
        selections = readSavedSelections(user.id);
        if (active) setSavedSelections(selections);
      } catch (error) {
        if (active) {
          setActivityError(error instanceof Error
            ? error.message
            : text("Impossible de lire l’historique des coupons.", "Unable to read coupon history."));
          setActivityLoading(false);
        }
        return;
      }

      const fixtureIds = Array.from(new Set(
        selections
          .filter(selection => selection.coupons)
          .flatMap(selection => selection.fixtures.map(fixture => fixture.id))
      ));
      if (fixtureIds.length === 0) {
        if (active) {
          setFixtureStatuses({});
          setActivityError("");
          setActivityLoading(false);
        }
        return;
      }

      try {
        const fixtures: Fixture[] = [];
        for (let start = 0; start < fixtureIds.length; start += 50) {
          const params = new URLSearchParams();
          fixtureIds.slice(start, start + 50).forEach(id => params.append("id", id));
          const response = await fetch(`/api/sports/fixtures/status?${params.toString()}`, {
            cache: "no-store",
          });
          const payload = await response.json() as { fixtures?: Fixture[]; error?: string };
          if (!response.ok || !Array.isArray(payload.fixtures)) {
            throw new Error(payload.error || text("Impossible de vérifier les résultats des matchs.", "Unable to check match results."));
          }
          fixtures.push(...payload.fixtures);
        }
        if (active) {
          setFixtureStatuses(Object.fromEntries(fixtures.map(fixture => [fixture.id, fixture])));
          setActivityError("");
          setActivityLoading(false);
        }
      } catch (error) {
        if (active) {
          setActivityError(error instanceof Error
            ? error.message
            : text("Impossible de vérifier les résultats des matchs.", "Unable to check match results."));
          setActivityLoading(false);
        }
      }
    };

    void syncActivity();
    return () => {
      active = false;
    };
  }, [user, text, refreshKey]);

  const toggleLeague = (league: string) => {
    setPreferences(current => ({
      ...current,
      leagues: current.leagues.includes(league)
        ? current.leagues.filter(item => item !== league)
        : [...current.leagues, league],
    }));
  };

  const outcomeLabel = (outcome: CouponOutcome) => ({
    pending: text("En attente", "Pending"),
    won: text("Validé", "Won"),
    lost: text("Non validé", "Lost"),
    unavailable: text("Résultat indisponible", "Result unavailable"),
  })[outcome];

  const outcomeStyle = (outcome: CouponOutcome) => ({
    pending: "border-amber-700 bg-amber-950/50 text-amber-200",
    won: "border-green-700 bg-green-950/50 text-green-200",
    lost: "border-red-800 bg-red-950/50 text-red-200",
    unavailable: "border-gray-700 bg-gray-800 text-gray-300",
  })[outcome];

  const outcomeIcon = (outcome: CouponOutcome) => ({
    pending: "◷",
    won: "✓",
    lost: "✕",
    unavailable: "?",
  })[outcome];

  const pickLabel = (pick: CouponPick) => {
    if (!pick.selection) return text("Historique insuffisant", "Insufficient history");
    const labels: Record<NonNullable<CouponPick["selection"]>, string> = {
      home: text("Victoire domicile (1)", "Home win (1)"),
      draw: text("Match nul (N)", "Draw (N)"),
      away: text("Victoire extérieur (2)", "Away win (2)"),
      "home-or-draw": text("Domicile ou nul (1X)", "Home or draw (1X)"),
      "away-or-draw": text("Extérieur ou nul (X2)", "Away or draw (X2)"),
      "either-win": text("Victoire d’une équipe (12)", "Either team to win (12)"),
      "over-0.5": text("Plus de 0,5 but", "Over 0.5 goals"),
      "over-1.5": text("Plus de 1,5 buts", "Over 1.5 goals"),
      "over-2.5": text("Plus de 2,5 buts", "Over 2.5 goals"),
      "over-3.5": text("Plus de 3,5 buts", "Over 3.5 goals"),
      "under-0.5": text("Moins de 0,5 but", "Under 0.5 goals"),
      "under-1.5": text("Moins de 1,5 buts", "Under 1.5 goals"),
      "under-2.5": text("Moins de 2,5 buts", "Under 2.5 goals"),
      "under-3.5": text("Moins de 3,5 buts", "Under 3.5 goals"),
      "home-1.5": text("Domicile -1.5", "Home -1.5"),
      "away-1.5": text("Extérieur -1.5", "Away -1.5"),
      "home-2.5": text("Domicile -2.5", "Home -2.5"),
      "away-2.5": text("Extérieur -2.5", "Away -2.5"),
      "home+1.5": text("Domicile +1.5", "Home +1.5"),
      "away+1.5": text("Extérieur +1.5", "Away +1.5"),
      "home-over-1.5": text("Domicile plus de 1,5 but", "Home over 1.5 goals"),
      "away-over-1.5": text("Extérieur plus de 1,5 but", "Away over 1.5 goals"),
      "home-under-1.5": text("Domicile moins de 1,5 but", "Home under 1.5 goals"),
      "away-under-1.5": text("Extérieur moins de 1,5 but", "Away under 1.5 goals"),
      "home-0-1": text("Domicile entre 0 et 1 but", "Home 0 to 1 goals"),
      "home-1-3": text("Domicile entre 1 et 3 buts", "Home 1 to 3 goals"),
      "away-0-1": text("Extérieur entre 0 et 1 but", "Away 0 to 1 goals"),
      "away-1-3": text("Extérieur entre 1 et 3 buts", "Away 1 to 3 goals"),
      scorer: text("Buteur (n'importe quand)", "Anytime scorer"),
      assist: text("Passeur décisif (n'importe quand)", "Anytime assist"),
      "home-scorer": text("Buteur domicile (n'importe quand)", "Home scorer (anytime)"),
      "away-scorer": text("Buteur extérieur (n'importe quand)", "Away scorer (anytime)"),
      "home-assist": text("Passeur décisif domicile (n'importe quand)", "Home assist (anytime)"),
      "away-assist": text("Passeur décisif extérieur (n'importe quand)", "Away assist (anytime)"),
      "over-5.5": text("Plus de 5,5 corners", "Over 5.5 corners"),
      "over-8.5": text("Plus de 8,5 corners", "Over 8.5 corners"),
      "over-10.5": text("Plus de 10,5 corners", "Over 10.5 corners"),
    };
    return labels[pick.selection];
  };

  const couponStatus = (coupon: GeneratedCoupon) =>
    settleCoupon(coupon.matches.map(match =>
      settleCouponMatch(match, fixtureStatuses[match.fixtureId])
    ));

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      updateProfile(name, email);
      localStorage.setItem(`ikprono_profile_${user.id}`, JSON.stringify(preferences));
      addNotification(t("profileSaved"), "success");
    } catch (error) {
      addNotification(error instanceof Error ? error.message : "Impossible de mettre à jour le profil.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen px-4 py-16 text-center text-gray-400">{t("processing")}</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen px-4 py-16">
        <div className="mx-auto max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center">
          <h1 className="text-2xl font-bold text-white">{t("profileTitle")}</h1>
          <p className="mt-3 text-gray-400">{t("login")}</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-fuchsia-700 px-6 py-3 font-semibold text-white">{t("login")}</Link>
        </div>
      </div>
    );
  }

  const riskOptions: { value: RiskProfile; label: string }[] = [
    { value: "prudent", label: t("prudent") },
    { value: "balanced", label: t("balanced") },
    { value: "bold", label: t("bold") },
  ];

  return (
    <div className="min-h-screen px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="12" cy="8" r="4" strokeWidth="1.8" />
              <path d="M4 21a8 8 0 0 1 16 0" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">{t("profileTitle")}</h1>
            <p className="mt-1 text-gray-400">{t("profileDescription")}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2" role="tablist" aria-label={text("Sections du profil", "Profile sections")}>
          {([
            ["profile", text("Profil", "Profile")],
            ["coupons", text("Historique des coupons", "Coupon history")],
            ["basket", text("Mon panier", "My basket")],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${activeTab === tab ? "bg-fuchsia-700 text-white" : "text-gray-300 hover:bg-gray-800"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "profile" && (
        <form onSubmit={save} className="space-y-6" role="tabpanel">
          <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">{t("personalInformation")}</h2>
              <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-200">
                {entitlements.trialActive
                  ? text("Essai gratuit", "Free trial")
                  : entitlements.hasTvAccess || entitlements.hasCombinationAccess
                    ? text("Abonné", "Subscribed")
                    : t("standardStatus")}
              </span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-300">
                {t("fullName")}
                <input required maxLength={80} value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white" />
              </label>
              <label className="block text-sm font-medium text-gray-300">
                {t("emailAddress")}
                <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-white">{text("Mon accès", "My access")}</h2>
              <Link href="/payment" className="text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200">
                {text("Gérer mes offres", "Manage plans")}
              </Link>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
                <span className="font-medium text-gray-200">{text("Offre TV (matchs en direct)", "TV plan (live matches)")}</span>
                <span className={entitlements.hasTvAccess ? "font-semibold text-green-300" : "text-gray-500"}>
                  {entitlements.hasTvAccess ? text("Active", "Active") : text("Inactive", "Inactive")}
                </span>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
                <span className="font-medium text-gray-200">{text("Offre Combinaisons", "Combinations plan")}</span>
                <span className={entitlements.hasCombinationAccess ? "font-semibold text-green-300" : "text-gray-500"}>
                  {entitlements.hasCombinationAccess ? text("Active", "Active") : text("Inactive", "Inactive")}
                </span>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
                <span className="font-medium text-gray-200">{text("Combinaisons restantes aujourd’hui", "Combinations left today")}</span>
                <span className="font-semibold text-white">
                  {entitlements.canGenerate ? `${entitlements.remainingToday}/${entitlements.dailyLimit}` : "0"}
                </span>
              </li>
              {entitlements.trialActive && entitlements.trialEndsAt && (
                <li className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3 text-amber-200">
                  {text(
                    `Essai gratuit jusqu’au ${new Date(entitlements.trialEndsAt).toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB")}.`,
                    `Free trial until ${new Date(entitlements.trialEndsAt).toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB")}.`
                  )}
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
            <h2 className="mb-5 text-xl font-semibold text-white">{t("preferences")}</h2>
            <div className="space-y-6">
              <label className="block text-sm font-medium text-gray-300">
                {t("favoriteClub")}
                <select value={preferences.favoriteClub} onChange={event => setPreferences(current => ({ ...current, favoriteClub: event.target.value }))} className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-white">
                  <option value="">—</option>
                  {clubs.map(club => <option key={club} value={club}>{club}</option>)}
                </select>
              </label>

              <div>
                <div className="mb-2 flex justify-between text-sm font-medium text-gray-300">
                  <label htmlFor="fan-level">{t("fanLevelLabel")}</label>
                  <output>{preferences.fanLevel}/10</output>
                </div>
                <input id="fan-level" type="range" min="1" max="10" value={preferences.fanLevel} onChange={event => setPreferences(current => ({ ...current, fanLevel: Number(event.target.value) }))} className="w-full accent-fuchsia-500" />
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-gray-300">{t("bettorProfile")}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {riskOptions.map(option => (
                    <button type="button" key={option.value} aria-pressed={preferences.riskProfile === option.value} onClick={() => setPreferences(current => ({ ...current, riskProfile: option.value }))} className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${preferences.riskProfile === option.value ? "border-fuchsia-400 bg-fuchsia-500/15 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-gray-300">{t("favoriteLeagues")}</legend>
                <div className="flex flex-wrap gap-2">
                  {leagues.map(league => (
                    <button type="button" key={league} aria-pressed={preferences.leagues.includes(league)} onClick={() => toggleLeague(league)} className={`rounded-full border px-3 py-2 text-sm transition ${preferences.leagues.includes(league) ? "border-fuchsia-400 bg-fuchsia-500/15 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500"}`}>
                      {league}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link href="/dashboard" className="rounded-xl border border-gray-700 px-6 py-3 text-center font-semibold text-gray-300 transition hover:border-gray-500 hover:text-white">{t("cancel")}</Link>
            <button type="submit" disabled={saving} className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-700 px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
              {saving ? t("processing") : t("saveChanges")}
            </button>
          </div>
        </form>
        )}

        {activeTab === "coupons" && (
          <section role="tabpanel" className="space-y-5">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
              <h2 className="text-xl font-semibold text-white">{text("Historique des coupons générés", "Generated coupon history")}</h2>
              <p className="mt-2 text-sm text-gray-400">
                {text(
                  "Les résultats sont vérifiés automatiquement et actualisés chaque minute à partir des scores disponibles.",
                  "Results are checked automatically and refreshed every minute using available scores."
                )}
              </p>
            </div>
            {activityError && (
              <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
                {activityError}
              </p>
            )}
            {activityLoading ? (
              <p role="status" className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-400">
                {text("Chargement de l’historique…", "Loading history…")}
              </p>
            ) : savedSelections.every(selection => !selection.coupons) ? (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center">
                <p className="text-gray-300">{text("Aucun coupon généré pour le moment.", "No coupons generated yet.")}</p>
                <Link href="/basket" className="mt-4 inline-block rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-600">
                  {text("Aller à mes sélections", "Go to my selections")}
                </Link>
              </div>
            ) : (
              [...savedSelections]
                .filter((selection): selection is SavedSelection & { coupons: GeneratedCoupon[] } => Boolean(selection.coupons))
                .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
                .map(selection => (
                  <article key={selection.id} className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-white">
                        {text("Sélection du ", "Selection from ")}
                        {new Date(selection.createdAt).toLocaleDateString(language === "fr" ? "fr-FR" : "en-GB")}
                      </h3>
                      {selection.couponsGeneratedAt && (
                        <span className="text-xs text-gray-500">
                          {text("Coupons générés le ", "Coupons generated on ")}
                          {new Date(selection.couponsGeneratedAt).toLocaleString(language === "fr" ? "fr-FR" : "en-GB")}
                        </span>
                      )}
                    </div>
                    <div className="space-y-4">
                      {selection.coupons.map(coupon => {
                        const result = couponStatus(coupon);
                        return (
                          <section key={coupon.level} className="rounded-xl border border-gray-800 bg-black/30 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h4 className="font-semibold text-white">{coupon.title}</h4>
                                <p className="mt-1 text-xs text-gray-400">{coupon.description}</p>
                              </div>
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${outcomeStyle(result)}`}>
                                <span aria-hidden="true">{outcomeIcon(result)}</span>
                                {outcomeLabel(result)}
                              </span>
                            </div>
                            <ul className="space-y-3">
                              {coupon.matches.map(match => {
                                const fixture = fixtureStatuses[match.fixtureId]
                                  ?? selection.fixtures.find(item => item.id === match.fixtureId);
                                const matchOutcome = settleCouponMatch(match, fixture);
                                const finished = fixture ? isFixtureFinished(fixture) : false;
                                const score = fixture && finished ? parseFixtureScore(fixture) : null;
                                return (
                                  <li key={match.fixtureId} className="rounded-lg border border-gray-800 bg-gray-900/70 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-sm font-medium text-white">{match.homeTeam} — {match.awayTeam}</p>
                                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${outcomeStyle(matchOutcome)}`}>
                                        <span aria-hidden="true">{outcomeIcon(matchOutcome)}</span>
                                        {outcomeLabel(matchOutcome)}
                                      </span>
                                    </div>
                                    {fixture?.score && <p className="mt-1 text-xs text-gray-400">{text("Score final :", "Final score:")} {fixture.score}</p>}
                                    <ul className="mt-3 space-y-2">
                                      {match.picks.map(pick => {
                                        const pickOutcome = score ? settleCouponPick(pick, score) : null;
                                        const pickStatus: CouponOutcome = score
                                          ? pickOutcome === null ? "unavailable" : pickOutcome ? "won" : "lost"
                                          : finished ? "unavailable" : "pending";
                                        return (
                                          <li key={`${pick.market}-${pick.selection}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <span className="text-gray-300">{pickLabel(pick)}</span>
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${outcomeStyle(pickStatus)}`}>
                                              <span aria-hidden="true">{outcomeIcon(pickStatus)}</span>
                                              {outcomeLabel(pickStatus)}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        );
                      })}
                    </div>
                  </article>
                ))
            )}
          </section>
        )}

        {activeTab === "basket" && (
          <section role="tabpanel" className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">{text("Mon panier", "My basket")}</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {text(`${basketFixtures.length} match(s) dans votre panier`, `${basketFixtures.length} fixture(s) in your basket`)}
                </p>
              </div>
              <Link href="/basket" className="rounded-lg bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-600">
                {text("Gérer mon panier", "Manage my basket")}
              </Link>
            </div>
            {basketError && <p role="alert" className="mt-4 text-sm text-amber-200">{basketError}</p>}
            {basketFixtures.length === 0 ? (
              <p className="mt-5 rounded-lg border border-gray-800 bg-black/30 p-4 text-sm text-gray-400">
                {text("Votre panier est vide.", "Your basket is empty.")}
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-gray-800">
                {basketFixtures.map(fixture => (
                  <li key={fixture.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="text-sm text-white">{fixture.homeTeam} — {fixture.awayTeam}</span>
                    <span className="text-xs text-gray-400">{fixture.score || `${fixture.date} · ${fixture.time}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
