"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FixtureCards from "@/components/FixtureCards";
import FavoriteFixtureButton from "@/components/FavoriteFixtureButton";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import {
  readFixtureBasket,
  subscribeToFixtureBasket,
  writeFixtureBasket,
} from "@/lib/fixtureBasket";
import type {
  Fixture,
  FixtureResponse,
  FixtureSport,
} from "@/lib/fixtures";

type Period = "day" | "week" | "month";
type SportFilter = "all" | FixtureSport;
type MatchStatusFilter = "all" | "completed" | "upcoming" | "live";
type TimeFilter = "all" | "5min" | "10min" | "30min" | "1h" | "2h";

const PAGE_SIZE = 20;

function getLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPeriodStart(anchor: string, period: Period) {
  const date = new Date(`${anchor}T00:00:00.000Z`);
  if (period === "week") {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  } else if (period === "month") {
    date.setUTCDate(1);
  }
  return date.toISOString().slice(0, 10);
}

function getPeriodDays(start: string, period: Period) {
  if (period === "day") return 1;
  if (period === "week") return 7;
  const date = new Date(`${start}T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

type MatchOutcome = "home" | "draw" | "away";

const FINISHED_STATUSES = ["termine", "finished", "ft", "full time", "aet", "pen"];

function normalizeStatus(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-GB");
}

function toOutcome(home: number, away: number): MatchOutcome {
  return home > away ? "home" : home < away ? "away" : "draw";
}

/**
 * Résultat final d'un match terminé, ou null si le score n'est pas disponible.
 * Permet d'identifier la cote gagnante et les cotes perdantes.
 */
function getFinishedResult(fixture: Fixture): MatchOutcome | null {
  if (!FINISHED_STATUSES.includes(normalizeStatus(fixture.status))) return null;

  const scoreMatch = /^(\d+)\s*-\s*(\d+)$/.exec((fixture.score ?? "").trim());
  if (scoreMatch) {
    return toOutcome(Number(scoreMatch[1]), Number(scoreMatch[2]));
  }

  const home = Number(fixture.homeScore);
  const away = Number(fixture.awayScore);
  if (
    fixture.homeScore !== undefined &&
    fixture.awayScore !== undefined &&
    fixture.homeScore !== "" &&
    fixture.awayScore !== "" &&
    !Number.isNaN(home) &&
    !Number.isNaN(away)
  ) {
    return toOutcome(home, away);
  }

  return null;
}

export default function FixtureSchedule({
  pageTitle,
  groupByLocation = false,
  predictionTools = false,
  showOdds = false,
}: {
  pageTitle?: string;
  groupByLocation?: boolean;
  predictionTools?: boolean;
  showOdds?: boolean;
}) {
  const { language, text } = useLanguage();
  const { addNotification } = useNotifications();
  const [period, setPeriod] = useState<Period>("day");
  const [anchorDate, setAnchorDate] = useState("");
  const manualDateSelection = useRef(false);
  const [dateInitialized, setDateInitialized] = useState(false);
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [competitionFilter, setCompetitionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [matchStatusFilter, setMatchStatusFilter] = useState<MatchStatusFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFixtures, setSelectedFixtures] = useState<Set<string>>(() => new Set());
  const [basketCount, setBasketCount] = useState(0);
  const [basketError, setBasketError] = useState("");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [errors, setErrors] = useState<FixtureResponse["errors"]>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, refreshNow] = useAutoRefresh();
  const hasLoadedFixtures = useRef(false);

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

    const params = new URLSearchParams({ preferredDate: getLocalDate() });
    fetch(`/api/sports/fixtures/latest-date?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as { date?: string | null; error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load the latest fixture date.");
        }
        if (!manualDateSelection.current) {
          setAnchorDate(payload.date ?? getLocalDate());
        }
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load the latest fixture date.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDateInitialized(true);
      });

    return () => controller.abort();
  }, []);

  const periodStart = anchorDate ? getPeriodStart(anchorDate, period) : "";
  const periodDays = periodStart ? getPeriodDays(periodStart, period) : 0;

  useEffect(() => {
    if (!periodStart || periodDays < 1) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      from: periodStart,
      to: shiftDate(periodStart, periodDays - 1),
      sport: sportFilter,
    });
    if (!hasLoadedFixtures.current) setLoading(true);

    fetch(`/api/sports/fixtures?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as FixtureResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load fixtures.");
        }
        if (!Array.isArray(payload.fixtures)) {
          throw new Error("The fixtures service returned an invalid response.");
        }
        setFixtures(payload.fixtures);
        setErrors(payload.errors ?? {});
        setLoadError("");
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load fixtures.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          hasLoadedFixtures.current = true;
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [periodStart, periodDays, sportFilter, refreshKey]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase(language === "fr" ? "fr-FR" : "en-GB");
  const filteredFixtures = fixtures.filter(fixture => {
    if (groupByLocation && locationFilter && fixture.location !== locationFilter) return false;
    if (groupByLocation && competitionFilter && fixture.competition !== competitionFilter) return false;

    if (predictionTools) {
      const status = fixture.status?.trim().toLocaleLowerCase("fr-FR") ?? "";
      const isCompleted = status === "terminé";
      const isLive = status === "en live" || status === "mi-temps";
      const isUpcoming = status === "prévu" || status === "reporté";
      if (matchStatusFilter === "completed" && !isCompleted) return false;
      if (matchStatusFilter === "upcoming" && !isUpcoming) return false;
      if (matchStatusFilter === "live" && !isLive) return false;

      // Time filter for upcoming matches
      if (timeFilter !== "all" && isUpcoming) {
        const [hours, minutes] = fixture.time.split(":").map(Number);
        const fixtureDate = new Date(`${fixture.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
        const now = new Date();
        const timeDiff = fixtureDate.getTime() - now.getTime();
        const timeDiffMinutes = timeDiff / (1000 * 60);

        const filterMinutes: Record<TimeFilter, number> = {
          all: 0,
          "5min": 5,
          "10min": 10,
          "30min": 30,
          "1h": 60,
          "2h": 120,
        };

        if (timeDiffMinutes < 0 || timeDiffMinutes > filterMinutes[timeFilter]) return false;
      } else if (timeFilter !== "all" && !isUpcoming) {
        return false;
      }

      if (normalizedSearch) {
        const searchableText = [
          fixture.location,
          fixture.competition,
          fixture.league,
          fixture.homeTeam,
          fixture.awayTeam,
          fixture.status,
          fixture.date,
        ].join(" ").toLocaleLowerCase(language === "fr" ? "fr-FR" : "en-GB");
        if (!searchableText.includes(normalizedSearch)) return false;
      }
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredFixtures.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const shouldPaginate = predictionTools || groupByLocation;
  const visibleFixtures = shouldPaginate
    ? filteredFixtures.slice((safeCurrentPage - 1) * PAGE_SIZE, safeCurrentPage * PAGE_SIZE)
    : filteredFixtures;
  const startedFixtureIds = visibleFixtures
    .filter(fixture => fixture.status === "En direct" || fixture.status === "Terminé")
    .map(fixture => fixture.id);
  const { fixturesById: refreshedLiveFixtures, error: fixtureDetailsError } = useFixtureStatuses(startedFixtureIds);
  const fixturesForDisplay = visibleFixtures.map(fixture => ({
    ...fixture,
    ...refreshedLiveFixtures[fixture.id],
  }));
  const locations = Array.from(new Set(fixtures.map(fixture => fixture.location).filter((value): value is string => Boolean(value))))
    .sort((first, second) => first.localeCompare(second, language === "fr" ? "fr" : "en"));
  const competitions = Array.from(new Set(
    fixtures
      .filter(fixture => !locationFilter || fixture.location === locationFilter)
      .map(fixture => fixture.competition)
      .filter((value): value is string => Boolean(value))
  )).sort((first, second) => first.localeCompare(second, language === "fr" ? "fr" : "en"));
  const fixturesByLocation = new Map<string, Map<string, Fixture[]>>();
  for (const fixture of fixturesForDisplay) {
    const location = fixture.location || text("Lieu non précisé", "Location unspecified");
    const competition = fixture.competition || fixture.league;
    let competitions = fixturesByLocation.get(location);
    if (!competitions) {
      competitions = new Map();
      fixturesByLocation.set(location, competitions);
    }
    const competitionFixtures = competitions.get(competition) ?? [];
    competitionFixtures.push(fixture);
    competitions.set(competition, competitionFixtures);
  }
  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const firstDate = periodStart ? new Date(`${periodStart}T12:00:00.000Z`) : null;
  const lastDate = periodStart && periodDays > 0
    ? new Date(`${shiftDate(periodStart, periodDays - 1)}T12:00:00.000Z`)
    : null;
  const periodLabel = !firstDate || !lastDate
    ? ""
    : period === "day"
      ? firstDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : period === "week"
        ? `${firstDate.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${lastDate.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`
        : firstDate.toLocaleDateString(locale, { month: "long", year: "numeric" });

  const sportLabels: Record<SportFilter, string> = {
    all: text("Tous les sports", "All sports"),
    football: "Football",
    basketball: "Basketball",
    tennis: "Tennis",
  };
  const availableSports: SportFilter[] = ["all", "football"];
  const periodLabels: Record<Period, string> = {
    day: text("Jour", "Day"),
    week: text("Semaine", "Week"),
    month: text("Mois", "Month"),
  };
  const matchStatusLabels: Record<MatchStatusFilter, string> = {
    all: text("Tous les matchs", "All matches"),
    completed: text("Terminés", "Completed"),
    upcoming: text("À venir", "Upcoming"),
    live: text("En cours", "In progress"),
  };
  const timeFilterLabels: Record<TimeFilter, string> = {
    all: text("Tous", "All"),
    "5min": "5 min",
    "10min": "10 min",
    "30min": "30 min",
    "1h": "1 H",
    "2h": "2 H",
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, matchStatusFilter, timeFilter, period, periodStart, periodDays, sportFilter, locationFilter, competitionFilter, refreshKey]);

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  const movePeriod = (direction: -1 | 1) => {
    manualDateSelection.current = true;
    if (period === "day") {
      setAnchorDate(shiftDate(anchorDate, direction));
    } else if (period === "week") {
      setAnchorDate(shiftDate(getPeriodStart(anchorDate, period), direction * 7));
    } else {
      const month = new Date(`${getPeriodStart(anchorDate, period)}T00:00:00.000Z`);
      month.setUTCMonth(month.getUTCMonth() + direction);
      setAnchorDate(month.toISOString().slice(0, 10));
    }
  };

  const toggleFixture = (fixture: Fixture) => {
    try {
      const basket = readFixtureBasket();
      const alreadySelected = basket.some(item => item.id === fixture.id);
      if (alreadySelected) {
        writeFixtureBasket(basket.filter(item => item.id !== fixture.id));
      } else if (basket.length >= 20) {
        addNotification(text("Le panier est limité à 20 matchs.", "The basket is limited to 20 matches."), "warning");
      } else {
        writeFixtureBasket([...basket, fixture]);
        addNotification(text("Match ajouté au panier.", "Fixture added to basket."), "success");
      }
    } catch (error) {
      setBasketError(error instanceof Error ? error.message : text("Impossible de modifier le panier.", "Unable to update the basket."));
    }
  };

  const showBasket = predictionTools || groupByLocation;
  const renderFixture = (fixture: Fixture) => {
    const outcome = getFinishedResult(fixture);
    const odds = fixture.odds;
    const winningOdd = outcome === null || !odds
      ? undefined
      : outcome === "home"
        ? odds.homeWin
        : outcome === "draw"
          ? odds.draw
          : odds.awayWin;
    // La distinction gagnante/perdante n'a de sens que si la cote gagnante est connue.
    const result = outcome !== null && winningOdd !== undefined && winningOdd > 0 ? outcome : null;
    const hasOddsRow = Boolean(
      showOdds && odds && odds.homeWin > 0 && odds.awayWin > 0
    );
    const nameColor = (outcome: MatchOutcome) => {
      if (result === outcome) return "text-green-400";
      if (result === "home" || result === "away") return "text-gray-400";
      return "text-white";
    };
    return (
      <article key={fixture.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
        <Link
          href={`/match/${encodeURIComponent(fixture.id)}`}
          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          aria-label={text(
            `Voir les détails de ${fixture.homeTeam} contre ${fixture.awayTeam}`,
            `View details for ${fixture.homeTeam} vs ${fixture.awayTeam}`
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-green-400">{sportLabels[fixture.sport]}</p>
              {!groupByLocation && <p className="mt-0.5 truncate text-xs font-semibold text-white">{fixture.league}</p>}
              {period !== "day" && (
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {new Date(`${fixture.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {fixture.status && (
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  fixture.status === "en live" ? "bg-red-600 text-white" :
                  fixture.status === "terminé" ? "bg-gray-600 text-white" :
                  "bg-gray-800 text-gray-300"
                }`}>
                  {fixture.liveDisplay || fixture.status}
                </span>
              )}
              <span className="whitespace-nowrap rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-300">
                {fixture.time}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center">
            <span className={`break-words text-left text-sm font-semibold ${nameColor("home")}`}>
              {fixture.homeTeam}{result === "home" ? " ✓" : ""}
            </span>
            {fixture.score ? (
              <span className="whitespace-nowrap text-xs font-bold text-white">{fixture.score}</span>
            ) : (
              <span className="text-xs font-semibold text-gray-500">vs</span>
            )}
            <span className={`break-words text-right text-sm font-semibold ${nameColor("away")}`}>
              {fixture.awayTeam}{result === "away" ? " ✓" : ""}
            </span>
          </div>
          <FixtureCards
            cards={fixture.matchCards}
            homeTeam={fixture.homeTeam}
            awayTeam={fixture.awayTeam}
            homeImageUrl={fixture.homeImageUrl}
            awayImageUrl={fixture.awayImageUrl}
          />
          {hasOddsRow && fixture.odds && (
            <div
              className="mt-2 grid grid-cols-3 gap-1.5"
              role="group"
              aria-label={text("Cotes des équipes", "Team odds")}
            >
              {([
                { outcome: "home" as MatchOutcome, label: "1", value: fixture.odds.homeWin, team: fixture.homeTeam },
                { outcome: "draw" as MatchOutcome, label: text("Nul", "Draw"), value: fixture.odds.draw, team: text("Match nul", "Draw") },
                { outcome: "away" as MatchOutcome, label: "2", value: fixture.odds.awayWin, team: fixture.awayTeam },
              ]).map(cell => {
                const isWinner = result !== null && result === cell.outcome;
                const isLoser = result !== null && result !== cell.outcome;
                const value = cell.value > 0 ? cell.value.toFixed(2) : "—";
                const statusLabel = isWinner
                  ? text("Cote gagnante", "Winning odd")
                  : isLoser
                    ? text("Cote perdante", "Losing odd")
                    : text("Cote", "Odds");
                return (
                  <span
                    key={cell.outcome}
                    title={`${statusLabel} — ${cell.team} : ${value}`}
                    className={`rounded-md px-1 py-1 text-center ${
                      isWinner ? "bg-green-950 ring-1 ring-green-500" : "bg-gray-800"
                    }`}
                  >
                    <span
                      className={`block text-[9px] font-semibold uppercase ${
                        isWinner ? "text-green-400" : isLoser ? "text-red-400" : "text-gray-400"
                      }`}
                    >
                      {cell.label}{isWinner ? " ✓" : isLoser ? " ✗" : ""}
                    </span>
                    <span
                      className={`block text-xs font-bold ${
                        isWinner
                          ? "text-green-300"
                          : isLoser
                            ? "text-red-400"
                            : cell.outcome === "draw"
                              ? "text-yellow-400"
                              : "text-green-400"
                      }`}
                    >
                      {value}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          {hasOddsRow && result !== null && (
            <p className="mt-1 text-[9px] text-gray-500">
              ✓ {text("cote gagnante", "winning odd")} · ✗ {text("cote perdante", "losing odd")}
            </p>
          )}
          <span className="mt-1 block text-[10px] font-medium text-green-400">{text("Voir les détails →", "View details →")}</span>
        </Link>
        <button
          type="button"
          onClick={() => toggleFixture(fixture)}
          aria-pressed={selectedFixtures.has(fixture.id)}
          className={`mt-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${selectedFixtures.has(fixture.id) ? "border-green-600 bg-green-950/50 text-green-300" : "border-gray-700 text-gray-300 hover:border-green-700 hover:text-white"}`}
        >
          {selectedFixtures.has(fixture.id)
            ? text("Retirer du panier", "Remove from basket")
            : text("Ajouter au panier", "Add to basket")}
        </button>
        <div className="mt-2">
          <FavoriteFixtureButton fixture={fixture} />
        </div>
      </article>
    );
  };

  return (
    <main className="min-h-screen bg-black px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            {pageTitle ?? text("Rencontres", "Fixtures")}
          </h1>
          <p className="text-gray-400">
            {text(
              "Choisissez un sport, puis filtrez par pays, championnat, équipe et période.",
              "Choose a sport, then filter by country, competition, team, and date."
            )}
          </p>
          <p className="mt-2 text-xs text-green-400">
            {text("Rencontres, scores et statuts actualisés automatiquement toutes les 30 secondes.", "Fixtures, scores, and statuses refresh automatically every 30 seconds.")}
          </p>
        </header>

        <div className="mb-6 flex flex-wrap gap-2" aria-label={text("Période", "Period")}>
          {(Object.keys(periodLabels) as Period[]).map(value => (
            <button
              key={value}
              type="button"
              onClick={() => {
                manualDateSelection.current = true;
                setPeriod(value);
              }}
              aria-pressed={period === value}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${period === value ? "bg-green-600 text-white" : "border border-gray-700 bg-gray-900 text-gray-300"}`}
            >
              {periodLabels[value]}
            </button>
          ))}
        </div>

        <section className="mb-6 flex flex-col gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => movePeriod(-1)}
              aria-label={text("Période précédente", "Previous period")}
              className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-800"
            >
              ←
            </button>
            <h2 className="min-w-0 text-center font-semibold capitalize text-white">{periodLabel || "…"}</h2>
            <button
              type="button"
              onClick={() => movePeriod(1)}
              aria-label={text("Période suivante", "Next period")}
              className="rounded-lg border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-800"
            >
              →
            </button>
          </div>
          {period === "day" && (
            <label className="text-sm text-gray-300">
              {text("Choisir une date", "Choose a date")}
              <input
                type="date"
                value={anchorDate}
                onChange={event => {
                  manualDateSelection.current = true;
                  setAnchorDate(event.target.value);
                }}
                className="ml-3 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
              />
            </label>
          )}
          <button
            type="button"
            onClick={refreshNow}
            disabled={loading}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-green-600 hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? text("Actualisation…", "Refreshing…") : text("Actualiser les rencontres", "Refresh fixtures")}
          </button>
        </section>

        <div className="mb-4 flex flex-wrap gap-2" aria-label={text("Filtrer par sport", "Filter by sport")}>
          {availableSports.map(sport => (
            <button
              key={sport}
              type="button"
              onClick={() => {
                setSportFilter(sport);
              }}
              aria-pressed={sportFilter === sport}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${sportFilter === sport ? "bg-green-600 text-white" : "border border-gray-700 bg-gray-900 text-gray-300"}`}
            >
              {sportLabels[sport]}
            </button>
          ))}
        </div>

        {groupByLocation && (
          <section className="mb-5 grid gap-3 sm:grid-cols-2" aria-label={text("Filtres par lieu et compétition", "Location and competition filters")}>
            <label className="text-sm text-gray-300">
              {text("Lieu", "Location")}
              <select
                value={locationFilter}
                onChange={event => {
                  setLocationFilter(event.target.value);
                  setCompetitionFilter("");
                }}
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
              >
                <option value="">{text("Tous les lieux", "All locations")}</option>
                {locations.map(location => <option key={location} value={location}>{location}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-300">
              {text("Compétition", "Competition")}
              <select
                value={competitionFilter}
                onChange={event => setCompetitionFilter(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
              >
                <option value="">{text("Toutes les compétitions", "All competitions")}</option>
                {competitions.map(competition => <option key={competition} value={competition}>{competition}</option>)}
              </select>
            </label>
          </section>
        )}

        {shouldPaginate && (
          <section className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="text-sm text-gray-300">
              {text("Rechercher un match", "Search fixtures")}
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder={text("Équipe, lieu, compétition ou date…", "Team, location, competition, or date…")}
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white placeholder:text-gray-500"
              />
            </label>
            <label className="text-sm text-gray-300">
              {text("Statut des matchs", "Match status")}
              <select
                value={matchStatusFilter}
                onChange={event => setMatchStatusFilter(event.target.value as MatchStatusFilter)}
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
              >
                {(Object.keys(matchStatusLabels) as MatchStatusFilter[]).map(status => (
                  <option key={status} value={status}>{matchStatusLabels[status]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-300">
              {text("Temps avant début", "Time until start")}
              <select
                value={timeFilter}
                onChange={event => setTimeFilter(event.target.value as TimeFilter)}
                className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
              >
                {(Object.keys(timeFilterLabels) as TimeFilter[]).map(time => (
                  <option key={time} value={time}>{timeFilterLabels[time]}</option>
                ))}
              </select>
            </label>
          </section>
        )}

        <p className="mb-5 text-sm text-gray-500">
          {text("Rencontres chargées depuis la base de données.", "Fixtures loaded from the database.")}
          {predictionTools && (
            <span className="ml-2 text-gray-400">
              {text(`${filteredFixtures.length} match(s) trouvé(s)`, `${filteredFixtures.length} match(es) found`)}
            </span>
          )}
          {selectedFixtures.size > 0 && (
            <span className="ml-2 text-green-400">
              {text(`${selectedFixtures.size} sélectionnée(s)`, `${selectedFixtures.size} selected`)}
            </span>
          )}
        </p>

        {Object.entries(errors ?? {}).length > 0 && (
          <div role="status" className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">
            {Object.entries(errors ?? {}).map(([sport, message]) => (
              <p key={sport}>{sport}: {message}</p>
            ))}
          </div>
        )}
        {basketError && <p role="alert" className="mb-4 text-sm text-red-300">{basketError}</p>}
        {fixtureDetailsError && startedFixtureIds.length > 0 && (
          <p role="status" className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
            {text("La mise à jour des cartons des matchs commencés est indisponible.", "Card updates for started matches are unavailable.")} {fixtureDetailsError}
          </p>
        )}

        {loadError && fixtures.length === 0 ? (
          <p role="alert" className="py-12 text-center text-red-300">{loadError}</p>
        ) : loading || !dateInitialized || !anchorDate ? (
          <p className="py-12 text-center text-gray-400">{text("Chargement des rencontres réelles…", "Loading real fixtures…")}</p>
        ) : (
          <>
          {loadError && <p role="alert" className="mb-4 text-sm text-amber-300">{loadError}</p>}
          {filteredFixtures.length === 0 ? (
            <p className="py-12 text-center text-gray-400">{text("Aucune rencontre réelle pour cette période.", "No real fixtures for this period.")}</p>
          ) : (
          groupByLocation ? (
            <div className="space-y-8">
              {Array.from(fixturesByLocation, ([location, competitions]) => (
                <section key={location} aria-label={location}>
                  <h2 className="mb-4 border-b border-gray-800 pb-2 text-xl font-bold text-white">{location}</h2>
                  <div className="space-y-6 pl-3">
                    {Array.from(competitions, ([competition, competitionFixtures]) => (
                      <section key={competition}>
                        <h3 className="mb-3 text-base font-semibold text-green-400">{competition}</h3>
                        <div className="grid gap-4 lg:grid-cols-3">
                          {competitionFixtures.map(renderFixture)}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                {fixturesForDisplay.map(renderFixture)}
              </div>
            </>
          )
          )}
          </>
        )}
        {!loadError && !loading && dateInitialized && anchorDate && filteredFixtures.length > 0 && shouldPaginate && totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-4" aria-label={text("Pagination des matchs", "Fixture pagination")}>
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
              disabled={safeCurrentPage === 1}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text("Précédent", "Previous")}
            </button>
            <span className="text-sm text-gray-300">
              {text(`Page ${safeCurrentPage} sur ${totalPages}`, `Page ${safeCurrentPage} of ${totalPages}`)}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
              disabled={safeCurrentPage === totalPages}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {text("Suivant", "Next")}
            </button>
          </nav>
        )}
        {showBasket && basketCount > 0 && (
          <aside className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl rounded-xl border border-green-600/70 bg-gray-950/95 p-4 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-white">
                  {text(`${basketCount} match(s) dans le panier`, `${basketCount} fixture(s) in basket`)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {text("Maximum 20 matchs par sélection", "Up to 20 fixtures per selection")}
                </p>
              </div>
              <Link
                href="/basket"
                className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-green-500"
              >
                {text("Voir le panier", "View basket")} →
              </Link>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
