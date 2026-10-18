"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FixtureCards from "@/components/FixtureCards";
import FavoriteFixtureButton from "@/components/FavoriteFixtureButton";
import { useLanguage } from "@/context/LanguageContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import {
  readFixtureBasket,
  subscribeToFixtureBasket,
  writeFixtureBasket,
} from "@/lib/fixtureBasket";
import {
  compareFixtureCompetitionDisplays,
  getFixtureCompetitionDisplay,
  isPinnedCompetition,
} from "@/lib/competitionPriority";
import type { Fixture } from "@/lib/fixtures";

interface MatchoraLiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  embedUrl: string;
}

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export default function LiveFixtures() {
  const { language, text } = useLanguage();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCompetitionGroups, setCollapsedCompetitionGroups] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [liveAvailable, setLiveAvailable] = useState(true);
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(null);
  const [refreshKey, refreshNow] = useAutoRefresh();
  const hasLoadedFixtures = useRef(false);
  const [selectedFixtures, setSelectedFixtures] = useState<Set<string>>(() => new Set());
  const [basketCount, setBasketCount] = useState(0);
  const [basketError, setBasketError] = useState("");
  const [matchoraMatches, setMatchoraMatches] = useState<MatchoraLiveMatch[]>([]);
  const [matchoraError, setMatchoraError] = useState("");
  const [selectedMatchoraMatch, setSelectedMatchoraMatch] = useState<MatchoraLiveMatch | null>(null);
  const [visibleLiveIncidents, setVisibleLiveIncidents] = useState<Record<string, {
    key: string;
    incident: NonNullable<Fixture["liveIncident"]>;
  }>>({});
  const handledLiveIncidents = useRef(new Set<string>());
  const liveIncidentTimeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const { fixturesById: refreshedLiveFixtures, error: liveFixturesError } = useFixtureStatuses(
    fixtures.map(fixture => fixture.id)
  );

  useEffect(() => {
    const syncBasket = () => {
      try {
        const basket = readFixtureBasket();
        setBasketCount(basket.length);
        setSelectedFixtures(new Set(basket.map(fixture => fixture.id)));
        setBasketError("");
      } catch (error) {
        setBasketError(error instanceof Error ? error.message : "Impossible de lire le panier.");
      }
    };
    syncBasket();
    return subscribeToFixtureBasket(syncBasket);
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    if (!hasLoadedFixtures.current) setLoading(true);

    fetch(`/api/sports/fixtures/live`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as {
          fixtures?: Fixture[];
          error?: string;
          warning?: string;
          liveAvailable?: boolean;
          cachedAt?: string;
        };
        if (!response.ok && !(response.status === 503 && payload.liveAvailable === false && Array.isArray(payload.fixtures))) {
          throw new Error(payload.error || "Unable to load live fixtures.");
        }
        if (!Array.isArray(payload.fixtures)) {
          throw new Error("The live fixtures service returned an invalid response.");
        }
        setFixtures(payload.fixtures);
        setLiveAvailable(payload.liveAvailable !== false);
        setCacheTimestamp(payload.cachedAt ?? null);
        setLoadError(payload.warning ?? "");
        hasLoadedFixtures.current = true;
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setLiveAvailable(false);
        setLoadError(error instanceof Error ? error.message : "Unable to load live fixtures.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          hasLoadedFixtures.current = true;
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/matchora/live", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as {
          matches?: MatchoraLiveMatch[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.matches)) {
          throw new Error(payload.error || "Impossible de vérifier les matchs disponibles sur Matchora.");
        }
        setMatchoraMatches(payload.matches);
        setMatchoraError("");
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setMatchoraMatches([]);
        setMatchoraError(error instanceof Error
          ? error.message
          : "Impossible de vérifier les matchs disponibles sur Matchora.");
      });

    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedMatchoraMatch) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedMatchoraMatch(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedMatchoraMatch]);

  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const normalizedSearch = searchQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale);
  const visibleFixtures = fixtures.filter(fixture => {
    const teamInitials = [fixture.homeTeam, fixture.awayTeam].map(team =>
      team.split(/[\s-]+/).filter(Boolean).map(word => word[0]).join("")
    );
    return [
      fixture.homeTeam,
      fixture.awayTeam,
      ...teamInitials,
      fixture.league,
      fixture.competition,
      fixture.location,
      fixture.status,
      fixture.score,
    ]
      .filter(Boolean)
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(locale)
      .includes(normalizedSearch);
  });
  const fixturesForDisplay = visibleFixtures.map(fixture => ({
    ...fixture,
    ...refreshedLiveFixtures[fixture.id],
  }));
  useEffect(() => {
    for (const fixture of fixturesForDisplay) {
      const incident = fixture.liveIncident;
      if (!incident) continue;
      const incidentKey = `${fixture.id}:${incident.type}:${incident.minute}:${incident.player ?? ""}`;
      if (handledLiveIncidents.current.has(incidentKey)) continue;
      handledLiveIncidents.current.add(incidentKey);

      const previousTimeout = liveIncidentTimeouts.current.get(fixture.id);
      if (previousTimeout) clearTimeout(previousTimeout);
      setVisibleLiveIncidents(current => ({
        ...current,
        [fixture.id]: { key: incidentKey, incident },
      }));
      liveIncidentTimeouts.current.set(fixture.id, setTimeout(() => {
        setVisibleLiveIncidents(current => {
          if (current[fixture.id]?.key !== incidentKey) return current;
          const next = { ...current };
          delete next[fixture.id];
          return next;
        });
        liveIncidentTimeouts.current.delete(fixture.id);
      }, 5_000));
    }
  }, [fixturesForDisplay]);

  useEffect(() => () => {
    liveIncidentTimeouts.current.forEach(timeout => clearTimeout(timeout));
    liveIncidentTimeouts.current.clear();
  }, []);

  const fixturesByCompetition = new Map<string, {
    display: ReturnType<typeof getFixtureCompetitionDisplay>;
    fixtures: Fixture[];
  }>();
  for (const fixture of fixturesForDisplay) {
    const display = getFixtureCompetitionDisplay(fixture, language);
    const group = fixturesByCompetition.get(display.key) ?? { display, fixtures: [] };
    group.fixtures.push(fixture);
    fixturesByCompetition.set(display.key, group);
  }
  const sortedCompetitions = Array.from(fixturesByCompetition.values()).sort(
    (first, second) => compareFixtureCompetitionDisplays(
      first.display,
      second.display,
      locale
    )
  );

  const toggleFixture = (fixture: Fixture) => {
    try {
      const basket = readFixtureBasket();
      const alreadySelected = basket.some(item => item.id === fixture.id);
      if (alreadySelected) {
        writeFixtureBasket(basket.filter(item => item.id !== fixture.id));
      } else if (basket.length >= 5) {
        alert(text("Le panier est limité à 5 matchs.", "The basket is limited to 5 matches."));
      } else {
        writeFixtureBasket([...basket, fixture]);
      }
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de modifier le panier.", "Unable to update the basket."));
    }
  };

  return (
    <main className="min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            {text("Matchs en direct", "Live Matches")}
          </h1>
          <p className="text-gray-400">
            {text(
              "Tous les matchs actuellement en cours",
              "All matches currently in progress"
            )}
          </p>
          <p className="mt-2 text-xs text-green-400">
            {text("Scores actualisés automatiquement toutes les 30 secondes.", "Scores refresh automatically every 30 seconds.")}
          </p>
        </header>

        <section className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-gray-300">
              {text("Matchs en direct depuis FotMob", "Live matches from FotMob")}
              {fixtures.length > 0 && (
                <span className="ml-2 text-green-400">
                  {text(`${fixturesForDisplay.length}/${fixtures.length} match(s) en direct`, `${visibleFixtures.length}/${fixtures.length} live match(es)`)}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={refreshNow}
              disabled={loading}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-green-600 hover:text-white disabled:cursor-wait disabled:opacity-50"
            >
              {loading ? text("Actualisation…", "Refreshing…") : text("Actualiser", "Refresh")}
            </button>
          </div>
          <label className="mt-4 block">
            <span className="sr-only">{text("Rechercher une équipe ou une compétition", "Search team or competition")}</span>
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder={text("Rechercher une équipe ou une compétition", "Search team or competition")}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-red-500"
            />
          </label>
        </section>

        {liveFixturesError && fixtures.length > 0 && (
          <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
            {text("La mise à jour des cartons des matchs en cours est indisponible.", "Live match card updates are unavailable.")} {liveFixturesError}
          </p>
        )}

        {matchoraError && fixtures.length > 0 && (
          <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
            {text(
              "La disponibilité des lecteurs Matchora n’a pas pu être vérifiée.",
              "Matchora player availability could not be checked."
            )}{" "}
            {matchoraError}
          </p>
        )}

        {(!liveAvailable || loadError) && (
          <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
            {liveAvailable
              ? loadError
              : text(
                "Le flux des matchs en direct est indisponible. Les dernières données enregistrées sont affichées et peuvent être obsolètes. Veuillez réessayer plus tard.",
                "The live match feed is unavailable. The latest cached data is shown and may be outdated. Please try again later."
              )}
            {!liveAvailable && cacheTimestamp && (
              <span className="ml-1">
                {text("Dernière sauvegarde :", "Last saved:")} {new Date(cacheTimestamp).toLocaleString(locale)}
              </span>
            )}
          </p>
        )}

        {loadError && fixtures.length === 0 && liveAvailable ? (
          <p role="alert" className="py-12 text-center text-red-300">{loadError}</p>
        ) : loading ? (
          <p className="py-12 text-center text-gray-400">{text("Chargement des matchs en direct…", "Loading live matches…")}</p>
        ) : fixtures.length === 0 ? (
          <p className="py-12 text-center text-gray-400">{text("Aucun match en direct pour le moment.", "No live matches at the moment.")}</p>
        ) : (
          <>
          {loadError && <p role="alert" className="mb-4 text-sm text-amber-300">{loadError}</p>}
          {fixturesForDisplay.length === 0 ? (
            <p className="py-12 text-center text-gray-400">
              {text("Aucun match ne correspond à cette recherche.", "No matches match this search.")}
            </p>
          ) : (
          <div className="space-y-7">
            {sortedCompetitions.map(({ display, fixtures: competitionFixtures }, index) => {
              const isCollapsed = collapsedCompetitionGroups.has(display.key);
              const contentId = `live-competition-${index}`;
              return (
              <section key={display.key} aria-label={`${display.country}: ${display.competition}`}>
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  aria-controls={contentId}
                  onClick={() => setCollapsedCompetitionGroups(current => {
                    const next = new Set(current);
                    if (next.has(display.key)) next.delete(display.key);
                    else next.add(display.key);
                    return next;
                  })}
                  className="mb-3 flex w-full items-center gap-2 border-b border-red-900/60 bg-gray-900/60 px-3 py-3 text-left text-lg font-bold text-white transition hover:bg-gray-900"
                >
                  <span aria-hidden="true" className="text-xl">{display.flag}</span>
                  <span className="min-w-0 flex-1 truncate">{display.country.toLocaleUpperCase(language === "fr" ? "fr-FR" : "en-GB")}: {display.competition}</span>
                  {isPinnedCompetition(display.competition) && (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                      {text("Épinglée", "Pinned")}
                    </span>
                  )}
                  <span className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs font-medium text-gray-400">
                    {competitionFixtures.length}
                  </span>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-5 w-5 shrink-0 text-red-200 transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`}>
                    <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {!isCollapsed && <div id={contentId} className="grid gap-4 lg:grid-cols-3">
            {competitionFixtures.map(fixture => {
              const incident = visibleLiveIncidents[fixture.id]?.incident;
              const fixtureHome = normalizeTeamName(fixture.homeTeam);
              const fixtureAway = normalizeTeamName(fixture.awayTeam);
              const matchoraMatch = matchoraMatches.find(match =>
                normalizeTeamName(match.homeTeam) === fixtureHome
                && normalizeTeamName(match.awayTeam) === fixtureAway
              );
              return (
              <article key={fixture.id} className="rounded-xl border border-red-900 bg-gray-900 p-3">
                <Link
                  href={`/match/${encodeURIComponent(fixture.id)}`}
                  className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  aria-label={text(
                    `Voir les détails de ${fixture.homeTeam} contre ${fixture.awayTeam}`,
                    `View details for ${fixture.homeTeam} vs ${fixture.awayTeam}`
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase text-red-400">Football</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-white">{fixture.league}</p>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white animate-pulse">
                        {fixture.liveDisplay || fixture.status || "EN LIVE"}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">
                        {fixture.time}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center">
                    <span className="break-words text-left text-sm font-semibold text-white">{fixture.homeTeam}</span>
                    {fixture.score ? (
                      <span className="whitespace-nowrap text-xs font-bold text-white">{fixture.score}</span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-500">vs</span>
                    )}
                    <span className="break-words text-right text-sm font-semibold text-white">{fixture.awayTeam}</span>
                  </div>
                  {incident && (
                    <p
                      role="status"
                      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-red-500/30 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-100"
                    >
                      <span aria-hidden="true">
                        {incident.type === "goal"
                          ? "⚽"
                          : incident.type === "goal-disallowed-offside"
                            ? "📺"
                            : incident.type === "penalty"
                              ? "🥅"
                              : incident.type === "red-card"
                                ? "🟥"
                                : incident.type === "var"
                                  ? "📺"
                                  : "⚡"}
                      </span>
                      <span className="font-bold uppercase tracking-wide">
                        {incident.type === "goal"
                          ? text("But", "Goal")
                          : incident.type === "goal-disallowed-offside"
                            ? text("But annulé · hors-jeu (VAR)", "Goal disallowed · offside (VAR)")
                            : incident.type === "penalty"
                              ? text("Pénalty", "Penalty")
                              : incident.type === "red-card"
                                ? text("Carton rouge", "Red card")
                                : incident.type === "var"
                                  ? text("Vérification VAR", "VAR review")
                                  : text("Grosse occasion", "Big chance")}
                      </span>
                      {incident.minute && <span>{incident.minute}′</span>}
                      {incident.player && <span className="truncate">{incident.player}</span>}
                    </p>
                  )}
                  <FixtureCards
                    cards={fixture.matchCards}
                    homeTeam={fixture.homeTeam}
                    awayTeam={fixture.awayTeam}
                    homeImageUrl={fixture.homeImageUrl}
                    awayImageUrl={fixture.awayImageUrl}
                  />
                  <span className="mt-1 block text-[10px] font-medium text-red-300">{text("Voir les détails →", "View details →")}</span>
                </Link>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {matchoraMatch && (
                    <button
                      type="button"
                      onClick={() => setSelectedMatchoraMatch(matchoraMatch)}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <span aria-hidden="true">▶</span>
                      {text("Regarder", "Watch")}
                    </button>
                  )}
                  <FavoriteFixtureButton fixture={fixture} />
                </div>
              </article>
              );
            })}
                </div>}
              </section>
            );
            })}
          </div>
          )}
          </>
        )}
      </div>
      {selectedMatchoraMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={text("Match en direct sur Matchora", "Live match on Matchora")}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-xl border border-gray-700 bg-gray-950 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-gray-800 px-4 py-3">
              <h2 className="min-w-0 truncate text-sm font-semibold text-white">
                {selectedMatchoraMatch.homeTeam} - {selectedMatchoraMatch.awayTeam}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedMatchoraMatch(null)}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
              >
                {text("Fermer", "Close")}
              </button>
            </div>
            <iframe
              key={selectedMatchoraMatch.id}
              src={selectedMatchoraMatch.embedUrl}
              title={`${selectedMatchoraMatch.homeTeam} - ${selectedMatchoraMatch.awayTeam}`}
              className="aspect-video w-full bg-black"
              allow="autoplay; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <p className="px-4 py-2 text-xs text-gray-500">
              {text("Lecteur fourni par Matchora.", "Player provided by Matchora.")}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
