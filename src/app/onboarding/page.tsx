"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { Fixture, FixtureResponse } from "@/lib/fixtures";

const clubs = [
  { name: "Real Madrid", badge: "RM" },
  { name: "FC Barcelona", badge: "FCB" },
  { name: "Paris Saint-Germain", badge: "PSG" },
  { name: "Liverpool", badge: "LFC" },
  { name: "Manchester City", badge: "MCI" },
  { name: "Manchester United", badge: "MUN" },
  { name: "Arsenal", badge: "ARS" },
  { name: "Chelsea", badge: "CHE" },
  { name: "Bayern Munich", badge: "FCB" },
];
const PAGE_SIZE = 12;
const COUNTRY_PAGE_SIZE = 8;
const POPULAR_FIXTURE_LIMIT = 8;

type RiskProfile = "prudent" | "balanced" | "bold";

/** Compétitions populaires affichées dans l'ordre demandé. */
const POPULAR_COMPETITIONS = [
  { key: "liga", label: "Liga", labelEn: "Liga" },
  { key: "champions", label: "Champions League", labelEn: "Champions League" },
  { key: "europa", label: "Europa League", labelEn: "Europa League" },
] as const;

type PopularCompetitionKey = (typeof POPULAR_COMPETITIONS)[number]["key"];

function normalizeCompetition(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
}

/** Rang d'affichage : 0 = Liga, 1 = Champions League, 2 = Europa League, 3 = autres. */
function popularCompetitionRank(fixture: Fixture): number {
  const league = normalizeCompetition(fixture.league);
  const isLiga = ["laliga", "la liga", "primera division"].some(alias => league.includes(alias))
    && !/apertura|clausura|femenil|liga mx|liga ii/.test(league);
  if (isLiga) return 0;
  if (/(champions league|ligue des champions)/.test(league) && !league.includes("caf")) return 1;
  if (/(europa league|ligue europa)/.test(league)) return 2;
  return POPULAR_COMPETITIONS.length;
}

function popularCompetitionKey(rank: number): PopularCompetitionKey | null {
  return rank < POPULAR_COMPETITIONS.length ? POPULAR_COMPETITIONS[rank].key : null;
}

function normalizeTeamName(value: string): string {
  return normalizeCompetition(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function involvesPopularClub(fixture: Fixture): boolean {
  const home = normalizeTeamName(fixture.homeTeam);
  const away = normalizeTeamName(fixture.awayTeam);
  return clubs.some(club => {
    const name = normalizeTeamName(club.name);
    return home.includes(name) || away.includes(name) || name.includes(home) || name.includes(away);
  });
}

function getLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [favoriteClub, setFavoriteClub] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [competitionSearch, setCompetitionSearch] = useState("");
  const [fanLevel, setFanLevel] = useState(7);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("prudent");
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [countryPage, setCountryPage] = useState(1);
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [matchPage, setMatchPage] = useState(1);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixturesError, setFixturesError] = useState("");
  const [fixturesErrorCode, setFixturesErrorCode] = useState("");
  const [fixturesLoading, setFixturesLoading] = useState(true);
  const [refreshKey] = useAutoRefresh();
  const hasLoadedFixtures = useRef(false);
  const { user, remainingProposals, recordProposals } = useAuth();
  const { t, text } = useLanguage();
  const { addNotification } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const from = getLocalDate();
    const to = new Date(`${from}T00:00:00.000Z`);
    to.setUTCDate(to.getUTCDate() + 6);
    const params = new URLSearchParams({
      from,
      to: to.toISOString().slice(0, 10),
      sport: "all",
    });

    fetch(`/api/sports/fixtures?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as FixtureResponse & { error?: string; code?: string };
        if (!response.ok) {
          const failure = new Error(payload.error || "Unable to load real fixtures.") as Error & { code?: string };
          failure.code = payload.code;
          throw failure;
        }
        if (!Array.isArray(payload.fixtures)) throw new Error("The fixtures service returned an invalid response.");
        setFixtures(payload.fixtures);
        setFixturesErrorCode("");
        const errors = Object.values(payload.errors ?? {});
        setFixturesError(errors.join(" "));
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setFixturesError(error instanceof Error ? error.message : "Unable to load real fixtures.");
        setFixturesErrorCode(error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          hasLoadedFixtures.current = true;
          setFixturesLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshKey]);

  const upcomingFixtures = fixtures.filter(fixture => {
    const status = fixture.status?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR");
    return fixture.date >= getLocalDate() && ["prevu", "scheduled", "reporte", "postponed"].includes(status ?? "");
  });

  const fixturesErrorMessage = fixturesErrorCode === "fixtures_unavailable"
    ? text(
      "Le service de données sportives est momentanément indisponible. Réessayez dans quelques instants.",
      "The sports data service is temporarily unavailable. Please try again shortly."
    )
    : fixturesError;

  /** Rencontres du jour encore jouables, ordonnées Liga → Champions League → Europa League. */
  const today = getLocalDate();
  const popularFixtures = fixtures
    .filter(fixture => {
      if (fixture.date !== today) return false;
      const status = normalizeCompetition(fixture.status ?? "");
      return !/termine|finished|annule|cancelled|abandon/.test(status);
    })
    .sort((first, second) =>
      popularCompetitionRank(first) - popularCompetitionRank(second)
      || Number(involvesPopularClub(second)) - Number(involvesPopularClub(first))
      || `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
    )
    .slice(0, POPULAR_FIXTURE_LIMIT);

  const competitionsByCountry = new Map<string, Map<string, string>>();
  for (const fixture of upcomingFixtures) {
    const country = fixture.location?.trim() || text("Autres pays", "Other countries");
    const competitions = competitionsByCountry.get(country) ?? new Map<string, string>();
    competitions.set(fixture.league, fixture.competition?.trim() || fixture.league);
    competitionsByCountry.set(country, competitions);
  }
  const countryGroups = Array.from(competitionsByCountry, ([country, competitions]) => ({
    country,
    competitions: Array.from(competitions, ([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label)),
  })).sort((first, second) => first.country.localeCompare(second.country));
  const normalizedCompetitionSearch = competitionSearch.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
  const matchingCountryGroups = countryGroups.flatMap(group => {
    if (!normalizedCompetitionSearch) return [group];
    const normalizedCountry = group.country.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
    if (normalizedCountry.includes(normalizedCompetitionSearch)) return [group];
    const competitions = group.competitions.filter(competition =>
      `${competition.value} ${competition.label}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("fr-FR")
        .includes(normalizedCompetitionSearch)
    );
    return competitions.length > 0 ? [{ ...group, competitions }] : [];
  });
  const countryPageCount = Math.max(1, Math.ceil(matchingCountryGroups.length / COUNTRY_PAGE_SIZE));
  const currentCountryPage = Math.min(countryPage, countryPageCount);
  const visibleCountryGroups = matchingCountryGroups.slice(
    (currentCountryPage - 1) * COUNTRY_PAGE_SIZE,
    currentCountryPage * COUNTRY_PAGE_SIZE
  );
  const matchFixtures = selectedLeagues.length > 0
    ? upcomingFixtures.filter(fixture => selectedLeagues.includes(fixture.league))
    : upcomingFixtures;
  const matchPageCount = Math.max(1, Math.ceil(matchFixtures.length / PAGE_SIZE));
  const currentMatchPage = Math.min(matchPage, matchPageCount);
  const visibleFixtures = matchFixtures.slice((currentMatchPage - 1) * PAGE_SIZE, currentMatchPage * PAGE_SIZE);
  const visibleClubs = clubs.filter(club =>
    club.name.toLowerCase().includes(teamSearch.trim().toLowerCase())
  );

  const updateSelectedLeagues = (nextLeagues: string[]) => {
    setSelectedLeagues(nextLeagues);
    setMatchPage(1);
    if (nextLeagues.length > 0) {
      setSelectedMatches(current => current.filter(matchId => {
        const fixture = upcomingFixtures.find(item => item.id === matchId);
        return fixture !== undefined && nextLeagues.includes(fixture.league);
      }));
    }
  };

  const toggleLeague = (league: string) => {
    const nextLeagues = selectedLeagues.includes(league)
      ? selectedLeagues.filter(item => item !== league)
      : [...selectedLeagues, league];
    updateSelectedLeagues(nextLeagues);
  };

  const toggleCountry = (competitions: string[]) => {
    const countrySelected = competitions.every(league => selectedLeagues.includes(league));
    const nextLeagues = countrySelected
      ? selectedLeagues.filter(league => !competitions.includes(league))
      : Array.from(new Set([...selectedLeagues, ...competitions]));
    updateSelectedLeagues(nextLeagues);
  };

  const toggleMatch = (matchId: string) => {
    setSelectedMatches(current => {
      if (current.includes(matchId)) {
        return current.filter(id => id !== matchId);
      }
      if (current.length >= 5) {
        addNotification(t("selectUpTo"), "warning");
        return current;
      }
      return [...current, matchId];
    });
  };

  const continueFrom = (nextStep: number) => {
    if (step === 2 && !favoriteClub) {
      addNotification(t("invalidSelection"), "warning");
      return;
    }
    setStep(nextStep);
  };

  const analyzeSelectedMatches = () => {
    if (selectedMatches.length === 0) {
      addNotification(t("invalidSelection"), "warning");
      return;
    }
    if (remainingProposals <= 0) {
      addNotification(t("quotaTitle"), "warning");
      return;
    }

    const accepted = recordProposals(1);
    if (accepted === 0) {
      addNotification(t("quotaTitle"), "warning");
      return;
    }
    setStep(6);
    addNotification(text("Rencontres enregistrées dans votre sélection.", "Fixtures saved to your selection."), "success");
  };

  const finishOnboarding = () => {
    const profile = {
      favoriteClub,
      fanLevel,
      riskProfile,
      leagues: selectedLeagues,
      matchIds: selectedMatches,
    };
    localStorage.setItem(`ikprono_profile_${user?.id ?? "guest"}`, JSON.stringify(profile));
    router.replace("/dashboard");
  };

  const riskOptions: { id: RiskProfile; label: string; description: string; meter: number }[] = [
    { id: "prudent", label: text("Prudent", "Cautious"), description: text("Favoriser les choix les moins risqués.", "Favor lower-risk selections."), meter: 2 },
    { id: "balanced", label: text("Équilibré", "Balanced"), description: text("Mélanger prudence et potentiel.", "Balance caution with potential."), meter: 3 },
    { id: "bold", label: text("Audacieux", "Bold"), description: text("Accepter plus de risque pour viser des gains plus élevés.", "Accept more risk in pursuit of higher returns."), meter: 5 },
  ];
  const stepLabels = [
    text("Bienvenue", "Welcome"),
    text("Votre équipe", "Your team"),
    text("Votre profil de jeu", "Your playing profile"),
    text("Vos compétitions", "Your competitions"),
    text("Vos rencontres", "Your fixtures"),
    text("Récapitulatif", "Review"),
  ];

  return (
    <div className="min-h-screen bg-black px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-10 flex items-center gap-4">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(current => Math.max(1, current - 1))}
              aria-label={t("back")}
              className="rounded-full p-2 text-gray-400 transition hover:bg-gray-900 hover:text-white"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m15 18-6-6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="truncate text-sm font-semibold text-gray-300">{stepLabels[step - 1]}</span>
              <span className="shrink-0 text-xs font-bold text-gray-500">{step}/6</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-600 transition-all duration-500"
                style={{ width: `${(step / 6) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {step === 1 && (
          <section className="animate-slide-up">
            <p className="mb-4 text-xs font-black tracking-[0.25em] text-red-400">{t("onboardingIntroEyebrow")}</p>
            <h1 className="mb-4 text-4xl font-extrabold leading-tight text-white sm:text-5xl">{t("onboardingIntroTitle")}</h1>
            <p className="mb-7 text-gray-400">{t("onboardingIntroDescription")}</p>
            <p className="mb-4 text-sm text-gray-500">{text("Rencontres réelles à venir, fournies par les services sportifs.", "Upcoming real fixtures from sports data services.")}</p>
            <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950">
              <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                <strong className="tracking-wider text-white">{text("RENCONTRES", "FIXTURES")}</strong>
                <span className="text-xs font-bold tracking-widest text-green-400">{text("RÉELLES", "REAL")}</span>
              </div>
              <div className="space-y-3 p-5">
                {upcomingFixtures.slice(0, 3).map(fixture => (
                  <div key={fixture.id} className="border-b border-gray-800/80 pb-3 text-sm font-semibold text-white last:border-0">
                    {fixture.homeTeam} — {fixture.awayTeam} · {fixture.sport}
                  </div>
                ))}
                {fixturesLoading && <p className="text-sm text-gray-400">{text("Chargement des rencontres…", "Loading fixtures…")}</p>}
                {!fixturesLoading && fixtures.length === 0 && (
                  <p className="text-sm text-gray-400">{fixturesErrorMessage || text("Aucune rencontre à venir cette semaine.", "No upcoming fixtures this week.")}</p>
                )}
                {fixturesErrorMessage && fixtures.length > 0 && <p role="status" className="text-xs text-amber-300">{fixturesErrorMessage}</p>}
              </div>
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950">
              <div className="flex items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
                <strong className="tracking-wider text-white">{text("POPULAIRES DU JOUR", "POPULAR TODAY")}</strong>
                <span className="text-xs font-bold tracking-widest text-amber-400">{text("LIGA · CHAMPIONS · EUROPA", "LIGA · CHAMPIONS · EUROPA")}</span>
              </div>
              <div className="space-y-3 p-5">
                {fixturesLoading && <p className="text-sm text-gray-400">{text("Chargement des rencontres…", "Loading fixtures…")}</p>}
                {!fixturesLoading && popularFixtures.length === 0 && (
                  <p className="text-sm text-gray-400">{text("Aucune rencontre populaire programmée aujourd’hui.", "No popular fixture scheduled today.")}</p>
                )}
                {popularFixtures.map(fixture => {
                  const rank = popularCompetitionRank(fixture);
                  const competition = popularCompetitionKey(rank);
                  return (
                    <div key={fixture.id} className="flex items-start gap-3 border-b border-gray-800/80 pb-3 text-sm last:border-0">
                      <span className="w-12 shrink-0 pt-0.5 text-xs font-bold text-gray-500">{fixture.time}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">{fixture.homeTeam} — {fixture.awayTeam}</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          {fixture.league}{fixture.status ? ` · ${fixture.status}` : ""}
                        </span>
                      </span>
                      {competition && (
                        <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-1 text-[10px] font-black tracking-wider text-amber-300">
                          {text(POPULAR_COMPETITIONS[rank].label, POPULAR_COMPETITIONS[rank].labelEn)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <button type="button" onClick={() => setStep(2)} className="mt-6 w-full rounded-xl bg-gradient-to-r from-red-500 to-red-700 px-6 py-4 font-bold text-white shadow-lg shadow-red-950/40 transition hover:brightness-110">
              {text("Personnaliser mon calendrier", "Personalize my calendar")}
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="animate-slide-up">
            <p className="mb-4 text-xs font-black tracking-[0.25em] text-red-400">{t("personalization")}</p>
            <h1 className="mb-6 text-3xl font-extrabold text-white">{t("favoriteClubTitle")}</h1>
            <label className="mb-6 flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 focus-within:border-red-500/60">
              <span className="text-gray-500">⌕</span>
              <input
                value={teamSearch}
                onChange={event => setTeamSearch(event.target.value)}
                placeholder={t("searchTeam")}
                className="w-full border-0 bg-transparent text-white outline-none placeholder:text-gray-600"
              />
            </label>
            <p className="mb-3 text-xs font-bold tracking-[0.2em] text-gray-600">{t("popular")}</p>
            <div className="grid grid-cols-3 gap-3">
              {visibleClubs.map(club => (
                <button
                  type="button"
                  key={club.name}
                  onClick={() => setFavoriteClub(club.name)}
                  aria-pressed={favoriteClub === club.name}
                  className={`flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border p-3 text-center transition ${
                    favoriteClub === club.name
                      ? "border-red-500 bg-red-950/30 shadow-lg shadow-red-950/20"
                      : "border-gray-800 bg-gray-900/60 hover:border-gray-600"
                  }`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-gray-700 bg-gray-950 text-xs font-black text-gray-200">{club.badge}</span>
                  <span className="text-xs font-semibold text-white">{club.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-7 rounded-xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-white">{t("fanTitle")}</h2>
                  <p className="mt-1 text-sm text-gray-400">{t("fanDescription")}</p>
                </div>
                <output className="text-3xl font-black text-white">{fanLevel}<span className="text-sm text-gray-500">/10</span></output>
              </div>
              <input aria-label={t("fanTitle")} type="range" min="1" max="10" value={fanLevel} onChange={event => setFanLevel(Number(event.target.value))} className="mt-5 w-full accent-red-500" />
              <div className="mt-2 flex justify-between text-xs font-semibold text-gray-500"><span>{t("curious")}</span><span>{t("superFan")}</span></div>
            </div>
            <button type="button" onClick={() => continueFrom(3)} className="mt-8 w-full rounded-xl bg-gradient-to-r from-red-500 to-red-700 px-6 py-4 font-bold text-white">
              {t("continue")}
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="animate-slide-up">
            <p className="mb-4 text-xs font-black tracking-[0.25em] text-red-400">{t("personalization")}</p>
            <h1 className="mb-3 text-3xl font-extrabold text-white">{text("Choisissez votre profil de risque", "Choose your risk profile")}</h1>
            <p className="mb-7 text-gray-400">{text("Choisissez le niveau de risque qui vous correspond.", "Choose the risk level that suits you.")}</p>
            <div className="space-y-3">
              {riskOptions.map(option => (
                <button type="button" key={option.id} onClick={() => setRiskProfile(option.id)} aria-pressed={riskProfile === option.id} className={`flex w-full items-center justify-between rounded-2xl border p-5 text-left transition ${riskProfile === option.id ? "border-red-500 bg-red-950/20 shadow-lg shadow-red-950/20" : "border-gray-800 bg-gray-900/60 hover:border-gray-600"}`}>
                  <span><strong className="block text-lg text-white">{option.label}</strong><span className="mt-1 block text-sm text-gray-500">{option.description}</span></span>
                  <span className="flex items-center gap-3"><span className="flex gap-1">{Array.from({ length: 5 }, (_, index) => <i key={index} className={`h-1.5 w-3 rounded ${index < option.meter ? "bg-red-500" : "bg-gray-800"}`} />)}</span><span className={`grid h-6 w-6 place-items-center rounded-full border ${riskProfile === option.id ? "border-red-500 bg-red-500 text-white" : "border-gray-700 text-transparent"}`}>✓</span></span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setStep(4)} className="mt-8 w-full rounded-xl bg-gradient-to-r from-red-500 to-red-700 px-6 py-4 font-bold text-white">{t("continue")}</button>
          </section>
        )}

        {step === 4 && (
          <section className="animate-slide-up">
            <p className="mb-4 text-xs font-black tracking-[0.25em] text-red-400">{t("personalization")}</p>
            <h1 className="mb-3 text-3xl font-extrabold text-white">{t("leaguesTitle")}</h1>
            <p className="mb-7 text-gray-400">{t("leaguesDescription")}</p>
            <label className="mb-5 block">
              <span className="sr-only">{text("Rechercher un pays ou une compétition", "Search country or competition")}</span>
              <span className="relative block">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" strokeWidth="2" />
                  <path d="m16 16 4 4" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={competitionSearch}
                  onChange={event => {
                    setCompetitionSearch(event.target.value);
                    setCountryPage(1);
                  }}
                  placeholder={text("Rechercher un pays ou une compétition", "Search country or competition")}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-gray-500 focus:border-red-500"
                />
              </span>
            </label>
            <div className="divide-y divide-gray-800">
              {visibleCountryGroups.map(({ country, competitions }) => {
                const competitionValues = competitions.map(competition => competition.value);
                const selectedCount = competitionValues.filter(league => selectedLeagues.includes(league)).length;
                const allSelected = selectedCount === competitionValues.length;
                return (
                  <section key={country} className="py-5 first:pt-0" aria-label={country}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-white">{country}</h2>
                        <p className="mt-1 text-xs text-gray-500">
                          {text(
                            `${competitions.length} compétition(s) · ${selectedCount} sélectionnée(s)`,
                            `${competitions.length} competition(s) · ${selectedCount} selected`
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleCountry(competitionValues)}
                        aria-pressed={allSelected}
                        className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:border-red-500 hover:text-white"
                      >
                        {allSelected ? text("Tout retirer", "Clear country") : text("Tout sélectionner", "Select all")}
                      </button>
                    </div>
                    <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                      {competitions.map(competition => {
                        const isSelected = selectedLeagues.includes(competition.value);
                        return (
                          <button
                            type="button"
                            key={competition.value}
                            onClick={() => toggleLeague(competition.value)}
                            aria-pressed={isSelected}
                            className={`flex min-h-12 items-center justify-between gap-3 border-b px-2 py-3 text-left transition ${
                              isSelected ? "border-red-500/50 text-white" : "border-gray-800 text-gray-300 hover:text-white"
                            }`}
                          >
                            <span className="text-sm font-medium">{competition.label}</span>
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs ${isSelected ? "border-red-500 bg-red-500 text-white" : "border-gray-700 text-transparent"}`}>✓</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              {text("Choix facultatif : si aucune compétition n’est sélectionnée, toutes les rencontres sont proposées.", "Selection is optional: without a selected competition, all fixtures are shown.")}
            </p>
            {countryPageCount > 1 && (
              <nav className="mt-5 flex items-center justify-between text-sm" aria-label={text("Pagination des pays", "Country pagination")}>
                <button type="button" onClick={() => setCountryPage(page => Math.max(1, page - 1))} disabled={currentCountryPage === 1} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 disabled:opacity-40">{text("Précédent", "Previous")}</button>
                <span className="text-gray-500">{text(`Page ${currentCountryPage} sur ${countryPageCount}`, `Page ${currentCountryPage} of ${countryPageCount}`)}</span>
                <button type="button" onClick={() => setCountryPage(page => Math.min(countryPageCount, page + 1))} disabled={currentCountryPage === countryPageCount} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 disabled:opacity-40">{text("Suivant", "Next")}</button>
              </nav>
            )}
            {competitionSearch.trim() && matchingCountryGroups.length === 0 && !fixturesLoading && (
              <p className="rounded-lg border border-gray-800 p-5 text-center text-sm text-gray-400">
                {text("Aucun pays ou compétition ne correspond à cette recherche.", "No country or competition matches this search.")}
              </p>
            )}
            {fixturesErrorMessage && <p role="status" className="mt-4 text-sm text-amber-300">{fixturesErrorMessage}</p>}
            {countryGroups.length === 0 && !fixturesLoading && (
              <p className="mt-4 text-sm text-gray-400">{text("Aucune compétition réelle n’est disponible pour la période sélectionnée. Vous pouvez continuer et réessayer plus tard.", "No real competition is available for this period. You can continue and try again later.")}</p>
            )}
            <button type="button" onClick={() => setStep(5)} className="mt-8 w-full rounded-xl bg-gradient-to-r from-red-500 to-red-700 px-6 py-4 font-bold text-white">{t("continue")}</button>
          </section>
        )}

        {step === 5 && (
          <section className="animate-slide-up">
            <p className="mb-4 text-xs font-black tracking-[0.25em] text-red-400">{t("matchTarget")}</p>
            <h1 className="mb-5 text-3xl font-extrabold text-white">{t("targetMatchTitle")}</h1>
            <div className="mb-4 flex items-center justify-between rounded-full border border-gray-800 bg-gray-900 px-4 py-3 text-sm">
              <span className="font-semibold text-gray-300">{t("upcomingMatches")}</span>
              <span className="text-gray-500">{t("selectUpTo")} · {selectedMatches.length}/5</span>
            </div>
            <div className="space-y-3">
              {visibleFixtures.map(fixture => {
                const isSelected = selectedMatches.includes(fixture.id);
                return (
                  <button type="button" key={fixture.id} onClick={() => toggleMatch(fixture.id)} aria-pressed={isSelected} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${isSelected ? "border-red-500 bg-red-950/20" : "border-gray-800 bg-gray-900/60 hover:border-gray-600"}`}>
                    <span className="w-14 shrink-0 text-xs font-bold text-gray-500">{fixture.time}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">{fixture.homeTeam} — {fixture.awayTeam}</span>
                      <span className="mt-2 block text-xs text-gray-500">{fixture.sport} · {fixture.league} · {fixture.date}</span>
                    </span>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${isSelected ? "border-red-500 bg-red-500 text-white" : "border-gray-700 text-transparent"}`}>✓</span>
                  </button>
                );
              })}
            </div>
            {matchPageCount > 1 && (
              <nav className="mt-5 flex items-center justify-between text-sm" aria-label={text("Pagination des rencontres", "Fixture pagination")}>
                <button type="button" onClick={() => setMatchPage(page => Math.max(1, page - 1))} disabled={currentMatchPage === 1} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 disabled:opacity-40">{text("Précédent", "Previous")}</button>
                <span className="text-gray-500">{text(`Page ${currentMatchPage} sur ${matchPageCount}`, `Page ${currentMatchPage} of ${matchPageCount}`)}</span>
                <button type="button" onClick={() => setMatchPage(page => Math.min(matchPageCount, page + 1))} disabled={currentMatchPage === matchPageCount} className="rounded-lg border border-gray-700 px-3 py-2 text-gray-300 disabled:opacity-40">{text("Suivant", "Next")}</button>
              </nav>
            )}
            {visibleFixtures.length === 0 && <p className="rounded-xl border border-gray-800 p-6 text-center text-sm text-gray-500">{t("invalidSelection")}</p>}
            {fixturesErrorMessage && <p role="status" className="mt-4 text-sm text-amber-300">{fixturesErrorMessage}</p>}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-fuchsia-500/20 bg-fuchsia-950/15 px-4 py-3 text-sm">
              <span className="text-gray-300">{t("freeQuota")}</span><strong className="text-fuchsia-200">{Number.isFinite(remainingProposals) ? `${remainingProposals}/3` : "∞"}</strong>
            </div>
            <button type="button" onClick={analyzeSelectedMatches} disabled={selectedMatches.length === 0} className="mt-5 w-full rounded-xl bg-gradient-to-r from-red-500 to-red-700 px-6 py-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{text("Enregistrer ma sélection", "Save my selection")}</button>
            {selectedMatches.length === 0 && (
              <button type="button" onClick={() => setStep(6)} className="mt-3 w-full rounded-xl border border-gray-700 px-6 py-3 font-semibold text-gray-300">
                {text("Continuer sans rencontre", "Continue without fixtures")}
              </button>
            )}
          </section>
        )}

        {step === 6 && (
          <section className="animate-slide-up">
            <p className="mb-4 text-xs font-black tracking-[0.25em] text-red-400">{text("RÉCAPITULATIF", "REVIEW")}</p>
            <h1 className="mb-3 text-3xl font-extrabold text-white">{text("Votre profil est prêt", "Your profile is ready")}</h1>
            <p className="mb-6 text-gray-400">{text("Vérifiez vos préférences avant d’accéder à votre espace.", "Review your preferences before opening your dashboard.")}</p>
            <section className="mb-5 rounded-2xl border border-gray-800 bg-gray-900/70 p-5" aria-label={text("Résumé du profil", "Profile summary")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><span className="block text-xs text-gray-500">{t("favoriteClubTitle")}</span><strong className="mt-1 block text-white">{favoriteClub}</strong></div>
                <div><span className="block text-xs text-gray-500">{t("fanTitle")}</span><strong className="mt-1 block text-white">{fanLevel}/10</strong></div>
                <div><span className="block text-xs text-gray-500">{text("Profil de risque", "Risk profile")}</span><strong className="mt-1 block text-white">{riskOptions.find(option => option.id === riskProfile)?.label}</strong></div>
                <div><span className="block text-xs text-gray-500">{t("leaguesTitle")}</span><strong className="mt-1 block text-white">{selectedLeagues.length || text("Toutes", "All")}</strong></div>
              </div>
            </section>
            <h2 className="mb-3 text-sm font-semibold text-white">{text("Rencontres choisies", "Selected fixtures")}</h2>
            {selectedMatches.length > 0 ? <div className="space-y-3">
              {fixtures.filter(fixture => selectedMatches.includes(fixture.id)).map(fixture => (
                <div key={fixture.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                  <span className="text-xs font-semibold uppercase text-red-300">{fixture.sport}</span>
                  <strong className="mt-2 block text-sm text-white">{fixture.homeTeam} — {fixture.awayTeam}</strong>
                  <span className="mt-1 block text-xs text-gray-500">{fixture.league} · {fixture.date} · {fixture.time}</span>
                </div>
              ))}
            </div> : <p className="rounded-xl border border-gray-800 p-4 text-sm text-gray-400">{text("Aucune rencontre enregistrée. Vous pourrez en choisir depuis votre calendrier.", "No fixtures saved. You can select matches later from your calendar.")}</p>}
            <p className="mt-6 text-sm text-gray-400">{t("premiumBenefitsDescription")}</p>
            <Link href="/payment" className="mt-3 inline-block text-sm font-semibold text-red-300 hover:text-red-200">{t("viewOffers")} · {t("premiumPrice")}</Link>
            <button type="button" onClick={finishOnboarding} className="mt-6 w-full rounded-xl bg-gradient-to-r from-red-500 to-red-700 px-6 py-4 font-bold text-white">{t("goToDashboard")}</button>
          </section>
        )}
      </div>
    </div>
  );
}
