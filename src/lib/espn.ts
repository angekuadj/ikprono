import type { Fixture, FixtureStanding } from "@/lib/fixtures";
import {
  loadEspnCachedFixturesByIds,
  loadEspnDailyResponse,
  loadEspnLiveFixtures,
  loadEspnMatchDetails,
  saveEspnDailyResponse,
  saveEspnLiveFixtures,
  saveEspnMatchDetails,
} from "@/lib/espnCache";

type UnknownRecord = Record<string, unknown>;

const ESPN_API_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball";
const ESPN_FIXTURE_PREFIX = "espn";

/** Championnats de basket exposés par l'API ESPN. */
export const ESPN_BASKETBALL_LEAGUES = [
  "nba",
  "wnba",
  "mens-college-basketball",
  "womens-college-basketball",
  "euroleague",
] as const;

export type EspnBasketballLeague = (typeof ESPN_BASKETBALL_LEAGUES)[number];

export const ESPN_BASKETBALL_LEAGUE_LABELS: Record<EspnBasketballLeague, string> = {
  nba: "NBA",
  wnba: "WNBA",
  "mens-college-basketball": "NCAA Men's Basketball",
  "womens-college-basketball": "NCAA Women's Basketball",
  euroleague: "EuroLeague",
};

export const ESPN_BASKETBALL_LEAGUE_LOCATIONS: Record<EspnBasketballLeague, string> = {
  nba: "United States",
  wnba: "United States",
  "mens-college-basketball": "United States",
  "womens-college-basketball": "United States",
  euroleague: "Europe",
};

/** Codes pays associés aux championnats ESPN, pour l'affichage du drapeau. */
export const ESPN_BASKETBALL_LEAGUE_COUNTRY_CODES: Record<EspnBasketballLeague, string> = {
  nba: "USA",
  wnba: "USA",
  "mens-college-basketball": "USA",
  "womens-college-basketball": "USA",
  euroleague: "EUR",
};

/**
 * Mois (1-12) pendant lesquels chaque championnat dispute des matchs.
 * Évite de marteler l'API avec des requêtes vouées à ne rien renvoyer.
 */
const ESPN_BASKETBALL_ACTIVE_MONTHS: Record<EspnBasketballLeague, readonly number[]> = {
  nba: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  wnba: [5, 6, 7, 8, 9, 10],
  "mens-college-basketball": [11, 12, 1, 2, 3, 4],
  "womens-college-basketball": [11, 12, 1, 2, 3, 4],
  euroleague: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
};

/** Durée maximale d'une plage de dates pour le basket (au-delà : trop de requêtes). */
export const ESPN_BASKETBALL_MAX_RANGE_DAYS = 31;

export interface EspnPlayerStat {
  name: string;
  shortName?: string;
  number?: string;
  position?: string;
  imageUrl?: string;
  starter: boolean;
  didNotPlay: boolean;
  stats: Record<string, string>;
}

export interface EspnPlay {
  id: string;
  minute: string;
  period: string;
  clock: string;
  text: string;
  type: string;
  side?: "home" | "away";
  homeScore?: number;
  awayScore?: number;
  scoringPlay: boolean;
  threePointShot: boolean;
}

export interface EspnInjury {
  name: string;
  status?: string;
  date?: string;
  type?: string;
  imageUrl?: string;
}

export interface EspnTeamStat {
  key: string;
  label: string;
  home: string;
  away: string;
}

export interface EspnPlayerStatKey {
  key: string;
  label: string;
}

export interface EspnPeriodScore {
  period: number;
  label: string;
  home: number | null;
  away: number | null;
}

export interface EspnBasketballSummary {
  fixture: Fixture;
  source: "espn" | "cache";
  cachedAt?: string;
  /** Statistiques d'équipe, indexées par identifiant ESPN (ex. "assists"). */
  stats: EspnTeamStat[];
  playerStats: { home: EspnPlayerStat[]; away: EspnPlayerStat[] };
  playerStatKeys: EspnPlayerStatKey[];
  plays: EspnPlay[];
  standings: FixtureStanding[];
  injuries: { home: EspnInjury[]; away: EspnInjury[] };
  venue?: string;
  attendance?: number;
  officials: string[];
  /** Forme récente (série V/D) lue dans les bilans des concurrents. */
  records: { home?: string; away?: string };
  periodScores: EspnPeriodScore[];
}

/**
 * Erreur levée quand aucune donnée ESPN n'est disponible, ni en direct ni en cache.
 * Le code permet aux routes API de renvoyer un libellé traduit côté client.
 */
export class EspnDataUnavailableError extends Error {
  readonly code = "fixtures_unavailable";

  constructor(message = "The sports data service is temporarily unavailable.") {
    super(message);
    this.name = "EspnDataUnavailableError";
  }
}

// ---------------------------------------------------------------------------
// Utilitaires de lecture
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isEspnBasketballLeague(value: string): value is EspnBasketballLeague {
  return (ESPN_BASKETBALL_LEAGUES as readonly string[]).includes(value);
}

/**
 * Identifiant de rencontre ESPN : `espn-<ligue>-<eventId>`.
 * Le préfixe évite toute collision avec les identifiants FotMob du football.
 */
export function buildEspnFixtureId(league: string, eventId: string): string {
  return `${ESPN_FIXTURE_PREFIX}-${league}-${eventId}`;
}

export function parseEspnFixtureId(value: string): {
  league: EspnBasketballLeague;
  eventId: string;
} | null {
  if (!value.startsWith(`${ESPN_FIXTURE_PREFIX}-`)) return null;
  const rest = value.slice(ESPN_FIXTURE_PREFIX.length + 1);
  const separator = rest.lastIndexOf("-");
  if (separator <= 0) return null;
  const league = rest.slice(0, separator);
  const eventId = rest.slice(separator + 1);
  if (!isEspnBasketballLeague(league) || !/^\d{1,20}$/.test(eventId)) return null;
  return { league, eventId };
}

export function isEspnFixtureId(value: string): boolean {
  return parseEspnFixtureId(value) !== null;
}

// ---------------------------------------------------------------------------
// Requêtes HTTP
// ---------------------------------------------------------------------------

const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAYS_MS = [500, 1_500];

type EspnFetchOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error; retryable: boolean };

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function isRetryableStatus(status: number): boolean {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function attemptEspnRequest<T>(url: string): Promise<EspnFetchOutcome<T>> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "IkProno/1.0 (ESPN basketball data)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: new Error(`The sports data service returned an invalid response (HTTP ${response.status}).`),
        retryable: isRetryableStatus(response.status),
      };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, error: new Error("The sports data service returned a non-JSON response."), retryable: true };
    }
    return { ok: true, value: await response.json() as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error("The sports data request failed."),
      retryable: true,
    };
  }
}

/** Appel direct à l'API ESPN avec plusieurs tentatives avant d'abandonner. */
async function fetchEspn<T>(url: string): Promise<T> {
  let lastError: Error = new Error("The sports data request failed.");
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await wait(FETCH_RETRY_DELAYS_MS[attempt - 2] ?? 1_500);
    const outcome = await attemptEspnRequest<T>(url);
    if (outcome.ok) return outcome.value;
    lastError = outcome.error;
    if (!outcome.retryable) break;
    console.error(`ESPN request attempt ${attempt}/${FETCH_ATTEMPTS} failed for ${url}.`, outcome.error.message);
  }
  throw lastError;
}

function espnScoreboardUrl(league: EspnBasketballLeague, date?: string): string {
  const url = new URL(`${ESPN_API_BASE}/${league}/scoreboard`);
  if (date) url.searchParams.set("dates", date.replaceAll("-", ""));
  url.searchParams.set("limit", "300");
  url.searchParams.set("lang", "en");
  url.searchParams.set("region", "us");
  // Les championnats universitaires sont répartis en conférences : il faut toutes les demander.
  if (league === "mens-college-basketball" || league === "womens-college-basketball") {
    url.searchParams.set("groups", "50");
  }
  return url.toString();
}

function espnEventUrl(league: EspnBasketballLeague, eventId: string): string {
  const url = new URL(`${ESPN_API_BASE}/${league}/scoreboard/${encodeURIComponent(eventId)}`);
  url.searchParams.set("lang", "en");
  url.searchParams.set("region", "us");
  return url.toString();
}

function espnSummaryUrl(league: EspnBasketballLeague, eventId: string): string {
  const url = new URL(`${ESPN_API_BASE}/${league}/summary`);
  url.searchParams.set("event", eventId);
  url.searchParams.set("lang", "en");
  url.searchParams.set("region", "us");
  return url.toString();
}

// ---------------------------------------------------------------------------
// Conversion des statuts
// ---------------------------------------------------------------------------

function espnStatusType(status: UnknownRecord): UnknownRecord {
  return isRecord(status.type) ? status.type : {};
}

/** Libellé français du statut, aligné sur les valeurs attendues par l'interface. */
export function espnStatusLabel(status: UnknownRecord): string {
  const type = espnStatusType(status);
  const name = text(type.name).toUpperCase();
  const state = text(type.state).toLowerCase();
  if (name.includes("POSTPONED")) return "Reporté";
  if (name.includes("CANCEL")) return "Annulé";
  if (name.includes("SUSPENDED")) return "Suspendu";
  if (name.includes("HALFTIME")) return "Mi-temps";
  if (state === "in") return "En direct";
  if (state === "post") return "Terminé";
  return "Prévu";
}

function espnPeriodLabel(period: number): string {
  switch (period) {
    case 1: return "1er quart";
    case 2: return "2e quart";
    case 3: return "3e quart";
    case 4: return "4e quart";
    default: return period > 4 ? "Prolongation" : "";
  }
}

/** Détail court affiché dans le badge de statut (ex. « 3:28 · 2e quart »). */
export function espnLiveDisplay(status: UnknownRecord): string | undefined {
  const type = espnStatusType(status);
  const name = text(type.name).toUpperCase();
  const state = text(type.state).toLowerCase();
  if (name.includes("POSTPONED")) return "Reporté";
  if (name.includes("CANCEL")) return "Annulé";
  if (state === "pre") return undefined;
  if (state === "post") {
    return text(type.shortDetail) || text(type.detail) || undefined;
  }
  if (name.includes("HALFTIME")) return "Mi-temps";
  const clock = text(status.displayClock);
  const periodLabel = espnPeriodLabel(Number(status.period));
  if (clock && periodLabel) return `${clock} · ${periodLabel}`;
  return periodLabel || clock || text(type.shortDetail) || undefined;
}

function espnTeamLogo(team: UnknownRecord): string | undefined {
  const logos = records(team.logos);
  const preferred = logos.find(logo =>
    Array.isArray(logo.rel) && logo.rel.includes("full")
  ) ?? logos[0];
  const href = preferred ? text(preferred.href) : "";
  if (href) return href;
  const fallback = text(team.logo);
  return fallback || undefined;
}

function espnTeamName(competitor: UnknownRecord): string {
  const team = isRecord(competitor.team) ? competitor.team : {};
  return text(team.displayName) || text(team.shortDisplayName) || text(team.name);
}

function espnCompetitorScore(competitor: UnknownRecord): number | null {
  return numberValue(competitor.score);
}

function espnRecordsSummary(competitor: UnknownRecord): string | undefined {
  const entries = records(competitor.records);
  const overall = entries.find(entry => text(entry.name).toLowerCase() === "overall") ?? entries[0];
  const summary = overall ? text(overall.summary) : "";
  return summary && summary !== "0-0" ? summary : undefined;
}

function mapEspnPeriodScoresFromCompetitors(competitors: UnknownRecord[]): EspnPeriodScore[] {
  const home = competitors.find(entry => text(entry.homeAway).toLowerCase() === "home");
  const away = competitors.find(entry => text(entry.homeAway).toLowerCase() === "away");
  if (!home || !away) return [];

  const periods = new Map<number, EspnPeriodScore>();
  const upsert = (competitor: UnknownRecord, side: "home" | "away") => {
    records(competitor.linescores).forEach((line, index) => {
      const periodNumber = Number(line.period) || Number(line.sequence) || index + 1;
      if (periodNumber <= 0) return;
      const existing = periods.get(periodNumber) ?? {
        period: periodNumber,
        label: espnPeriodLabel(periodNumber) || `P${periodNumber}`,
        home: null,
        away: null,
      };
      existing[side] = numberValue(line.value ?? line.displayValue ?? line.score);
      periods.set(periodNumber, existing);
    });
  };

  upsert(home, "home");
  upsert(away, "away");
  return Array.from(periods.values()).sort((first, second) => first.period - second.period);
}

/** Construit la rencontre à partir d'un événement ESPN (`scoreboard` ou `summary`). */
function mapEspnEvent(
  event: UnknownRecord,
  league: EspnBasketballLeague
): Fixture | null {
  const competition = records(event.competitions)[0]
    ?? records(isRecord(event.header) ? event.header.competitions : undefined)[0];
  if (!competition) return null;

  const competitors = records(competition.competitors);
  const home = competitors.find(entry => text(entry.homeAway).toLowerCase() === "home");
  const away = competitors.find(entry => text(entry.homeAway).toLowerCase() === "away");
  if (!home || !away) return null;

  const eventId = text(event.id) || text(isRecord(event.header) ? event.header.id : undefined);
  if (!/^\d{1,20}$/.test(eventId)) return null;

  const status = isRecord(competition.status) ? competition.status : {};
  const statusType = espnStatusType(status);
  const state = text(statusType.state).toLowerCase();
  const hasStarted = state === "in" || state === "post";
  const liveDisplay = espnLiveDisplay(status);

  const rawDate = text(competition.date) || text(event.date);
  const start = new Date(rawDate);
  const local = Number.isNaN(start.getTime())
    ? { date: "", time: "" }
    : (() => {
      const shifted = new Date(start.getTime() - start.getTimezoneOffset() * 60_000);
      return { date: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) };
    })();

  const homeScore = espnCompetitorScore(home);
  const awayScore = espnCompetitorScore(away);
  const scored = hasStarted && homeScore !== null && awayScore !== null;
  const homeImageUrl = espnTeamLogo(isRecord(home.team) ? home.team : {});
  const awayImageUrl = espnTeamLogo(isRecord(away.team) ? away.team : {});
  const label = ESPN_BASKETBALL_LEAGUE_LABELS[league];

  return {
    id: buildEspnFixtureId(league, eventId),
    sport: "basketball",
    date: local.date,
    time: local.time,
    league: label,
    competition: label,
    location: ESPN_BASKETBALL_LEAGUE_LOCATIONS[league],
    countryCode: ESPN_BASKETBALL_LEAGUE_COUNTRY_CODES[league],
    homeTeam: espnTeamName(home),
    awayTeam: espnTeamName(away),
    ...(homeImageUrl ? { homeImageUrl } : {}),
    ...(awayImageUrl ? { awayImageUrl } : {}),
    ...(scored && homeScore !== null ? { homeScore: String(homeScore) } : {}),
    ...(scored && awayScore !== null ? { awayScore: String(awayScore) } : {}),
    ...(scored ? { score: `${homeScore} - ${awayScore}` } : {}),
    status: espnStatusLabel(status),
    ...(liveDisplay ? { liveDisplay } : {}),
  };
}

function fixturesFromEspnResponse(payload: unknown, league: EspnBasketballLeague): Fixture[] {
  if (!isRecord(payload)) return [];
  const events = records(payload.events);
  // Certaines réponses (scoreboard d'un événement précis) ne renvoient qu'un objet unique.
  return events
    .map(event => mapEspnEvent(event, league))
    .filter((mapped): mapped is Fixture => mapped !== null);
}

// ---------------------------------------------------------------------------
// Chargement des rencontres
// ---------------------------------------------------------------------------

/** Vrai si la ligue a des chances de jouer à cette date. */
function isLeagueActiveOn(league: EspnBasketballLeague, date: string): boolean {
  const month = Number(date.slice(5, 7));
  return ESPN_BASKETBALL_ACTIVE_MONTHS[league].includes(month);
}

async function loadEspnLeagueDay(
  league: EspnBasketballLeague,
  date: string
): Promise<{ fixtures: Fixture[]; source: "espn" | "cache"; cachedAt?: string }> {
  const cacheKey = `${league}:${date}`;
  try {
    const payload: unknown = await fetchEspn(espnScoreboardUrl(league, date));
    const fixtures = fixturesFromEspnResponse(payload, league);
    try {
      await saveEspnDailyResponse(cacheKey, payload, fixtures);
    } catch (cacheError) {
      console.error(`Could not save the ESPN matches for ${cacheKey} to the PostgreSQL cache.`, cacheError);
    }
    return { fixtures, source: "espn" };
  } catch (apiError) {
    try {
      const cached = await loadEspnDailyResponse(cacheKey);
      if (cached) {
        return {
          fixtures: fixturesFromEspnResponse(cached.response, league),
          source: "cache",
          cachedAt: cached.cachedAt,
        };
      }
    } catch (cacheError) {
      console.error(`Could not read the ESPN cache for ${cacheKey}.`, cacheError);
    }
    throw apiError;
  }
}

/** Rencontres d'une journée, tous championnats ESPN confondus. */
export async function loadEspnBasketballFixtures(
  from: string,
  to: string
): Promise<Fixture[]> {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
    throw new Error("Provide a valid date range in YYYY-MM-DD format.");
  }
  const first = new Date(`${from}T00:00:00.000Z`);
  const last = new Date(`${to}T00:00:00.000Z`);
  const dayCount = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  if (dayCount > ESPN_BASKETBALL_MAX_RANGE_DAYS) {
    throw new Error(`Date ranges are limited to ${ESPN_BASKETBALL_MAX_RANGE_DAYS} days.`);
  }

  const dates = Array.from({ length: dayCount }, (_, offset) =>
    new Date(first.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  );

  const fixtures: Fixture[] = [];
  let unavailableCount = 0;
  let lastError: unknown;

  for (const date of dates) {
    const leagues = ESPN_BASKETBALL_LEAGUES.filter(league => isLeagueActiveOn(league, date));
    const results = await Promise.allSettled(leagues.map(league => loadEspnLeagueDay(league, date)));
    for (const result of results) {
      if (result.status === "rejected") {
        unavailableCount += 1;
        lastError = result.reason;
        continue;
      }
      fixtures.push(...result.value.fixtures);
    }
  }

  if (fixtures.length === 0 && unavailableCount > 0) {
    console.error("No ESPN basketball fixtures available.", lastError);
    throw new EspnDataUnavailableError();
  }

  const byId = new Map<string, Fixture>();
  for (const fixture of fixtures) byId.set(fixture.id, fixture);

  return Array.from(byId.values()).sort((first, second) =>
    `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
  );
}

/** Rencontres actuellement en direct, tous championnats ESPN confondus. */
export async function loadEspnBasketballLiveFixtures(): Promise<{
  fixtures: Fixture[];
  source: "espn" | "cache";
  cachedAt?: string;
}> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fixtures = (await loadEspnBasketballFixtures(today, today))
      .filter(fixture => fixture.status === "En direct");
    try {
      await saveEspnLiveFixtures(fixtures);
    } catch (cacheError) {
      console.error("Could not save the live ESPN fixtures to the PostgreSQL cache.", cacheError);
    }
    return { fixtures, source: "espn" };
  } catch (apiError) {
    try {
      const cached = await loadEspnLiveFixtures();
      if (cached) return { fixtures: cached.fixtures, source: "cache", cachedAt: cached.cachedAt };
    } catch (cacheError) {
      console.error("Could not read the live ESPN cache.", cacheError);
    }
    console.error("No live ESPN fixtures available from the API or the cache.", apiError);
    throw new EspnDataUnavailableError();
  }
}

/** Rencontres rafraîchies par identifiant (`espn-<ligue>-<eventId>`). */
export async function loadEspnBasketballFixturesByIds(ids: string[]): Promise<Fixture[]> {
  const targets = new Map<string, { league: EspnBasketballLeague; eventId: string }>();
  for (const id of ids) {
    const parsed = parseEspnFixtureId(id);
    if (parsed) targets.set(id, parsed);
  }
  if (targets.size === 0) return [];

  const byId = new Map<string, Fixture>();
  const byLeague = new Map<EspnBasketballLeague, string[]>();
  for (const [id, target] of targets) {
    byLeague.set(target.league, [...(byLeague.get(target.league) ?? []), id]);
  }

  for (const [league, leagueIds] of byLeague) {
    // Les rencontres d'une même journée sont toutes renvoyées par un seul appel scoreboard.
    const dates = new Set(
      leagueIds.flatMap(id => {
        const target = targets.get(id);
        return target ? [new Date().toISOString().slice(0, 10)] : [];
      })
    );
    let refreshed = false;
    for (const date of [...dates, undefined]) {
      try {
        const payload: unknown = await fetchEspn(espnScoreboardUrl(league, date));
        for (const fixture of fixturesFromEspnResponse(payload, league)) {
          if (targets.has(fixture.id)) {
            byId.set(fixture.id, fixture);
            refreshed = true;
          }
        }
        if (refreshed) break;
      } catch (apiError) {
        console.error(`Could not refresh the ESPN fixtures for ${league}.`, apiError);
      }
    }
  }

  const missing = ids.filter(id => !byId.has(id));
  if (missing.length > 0) {
    try {
      for (const fixture of await loadEspnCachedFixturesByIds(missing)) {
        byId.set(fixture.id, fixture);
      }
    } catch (cacheError) {
      console.error("Could not read the ESPN fixture cache.", cacheError);
    }
  }

  return ids.flatMap(id => {
    const fixture = byId.get(id);
    return fixture ? [fixture] : [];
  });
}

// ---------------------------------------------------------------------------
// Détail d'une rencontre
// ---------------------------------------------------------------------------

function mapEspnTeamStats(boxscore: UnknownRecord): EspnTeamStat[] {
  const teams = records(boxscore.teams);
  const home = teams.find(entry => text(entry.homeAway).toLowerCase() === "home");
  const away = teams.find(entry => text(entry.homeAway).toLowerCase() === "away");
  if (!home || !away) return [];

  const awayStats = new Map(
    records(away.statistics).map(stat => [text(stat.name), stat])
  );
  return records(home.statistics).map(stat => {
    const key = text(stat.name);
    const counterpart = awayStats.get(key);
    return {
      key,
      label: text(stat.label) || text(stat.abbreviation) || key,
      home: text(stat.displayValue),
      away: counterpart ? text(counterpart.displayValue) : "",
    };
  }).filter(stat => stat.home !== "" || stat.away !== "");
}

function mapEspnPlayerStats(
  boxscore: UnknownRecord,
  homeTeamId: string,
  awayTeamId: string
): { home: EspnPlayerStat[]; away: EspnPlayerStat[]; keys: EspnPlayerStatKey[] } {
  const teamBlocks = records(boxscore.players);
  // Les blocs joueurs sont identifiés par leur équipe (`team.id`) et non par `homeAway`.
  const blockTeamId = (block: UnknownRecord) => text(isRecord(block.team) ? block.team.id : undefined);
  const homeBlock = teamBlocks.find(entry => blockTeamId(entry) === homeTeamId)
    ?? teamBlocks.find(entry => text(entry.homeAway).toLowerCase() === "home");
  const awayBlock = teamBlocks.find(entry => blockTeamId(entry) === awayTeamId)
    ?? teamBlocks.find(entry => text(entry.homeAway).toLowerCase() === "away"
      && !(homeBlock && blockTeamId(entry) === blockTeamId(homeBlock)));
  if (!homeBlock && !awayBlock) return { home: [], away: [], keys: [] };

  const reference = records((homeBlock ?? awayBlock)?.statistics)[0];
  const names = Array.isArray(reference?.names) ? reference.names.map(text) : [];
  const rawKeys = reference ? records(reference.keys).map(key => text(key)) : [];
  const statKeys = rawKeys.length > 0 ? rawKeys : names;
  const keys: EspnPlayerStatKey[] = statKeys.map((key, index) => ({
    key,
    label: names[index] ?? key,
  }));

  const mapSide = (block: UnknownRecord | undefined): EspnPlayerStat[] => {
    const stats = records(block?.statistics)[0];
    if (!stats) return [];
    return records(stats.athletes).map(entry => {
      const athlete = isRecord(entry.athlete) ? entry.athlete : {};
      const headshot = isRecord(athlete.headshot) ? athlete.headshot : {};
      const position = isRecord(athlete.position) ? athlete.position : {};
      const values = Array.isArray(entry.stats) ? entry.stats.map(text) : [];
      const map: Record<string, string> = {};
      statKeys.forEach((key, index) => { map[key] = values[index] ?? ""; });
      return {
        name: text(athlete.displayName) || text(athlete.fullName) || text(athlete.shortName),
        ...(text(athlete.shortName) ? { shortName: text(athlete.shortName) } : {}),
        ...(text(athlete.jersey) ? { number: text(athlete.jersey) } : {}),
        ...(text(position.abbreviation) ? { position: text(position.abbreviation) } : {}),
        ...(text(headshot.href) ? { imageUrl: text(headshot.href) } : {}),
        starter: entry.starter === true,
        didNotPlay: entry.didNotPlay === true,
        stats: map,
      };
    }).filter(player => player.name.length > 0);
  };

  return { home: mapSide(homeBlock), away: mapSide(awayBlock), keys };
}

function mapEspnPlays(
  payload: UnknownRecord,
  homeTeamId: string,
  awayTeamId: string
): EspnPlay[] {
  return records(payload.plays).map(play => {
    const type = isRecord(play.type) ? play.type : {};
    const period = isRecord(play.period) ? play.period : {};
    const clock = isRecord(play.clock) ? play.clock : {};
    const teamId = isRecord(play.team) ? text(play.team.id) : "";
    const typeText = text(type.text);
    const homeScore = numberValue(play.homeScore);
    const awayScore = numberValue(play.awayScore);

    return {
      id: text(play.id) || text(play.sequenceNumber),
      minute: text(period.number),
      period: text(period.displayValue) || espnPeriodLabel(Number(period.number)),
      clock: text(clock.displayValue),
      text: text(play.text),
      type: typeText,
      ...(teamId === homeTeamId ? { side: "home" as const }
        : teamId === awayTeamId ? { side: "away" as const } : {}),
      ...(homeScore === null ? {} : { homeScore }),
      ...(awayScore === null ? {} : { awayScore }),
      scoringPlay: play.scoringPlay === true,
      threePointShot: /three point|3-pt|3pt/i.test(typeText),
    };
  }).filter(play => play.text.length > 0 || play.type.length > 0);
}

function mapEspnStandings(value: unknown): FixtureStanding[] {
  if (!isRecord(value)) return [];
  const entries = records(value.groups).flatMap(group =>
    records(isRecord(group.standings) ? group.standings.entries : undefined)
  );
  return entries.map(entry => {
    const stats = new Map(records(entry.stats).map(stat => [text(stat.name), stat]));
    const statValue = (name: string): number => {
      const stat = stats.get(name);
      return stat ? numberValue(stat.value) ?? numberValue(stat.displayValue) ?? 0 : 0;
    };
    const teamName = text(entry.team) || (isRecord(entry.team) ? text(entry.team.displayName) : "");
    const played = statValue("gamesPlayed") || statValue("wins") + statValue("losses");
    const streakStat = stats.get("streak");
    const streakText = streakStat ? text(streakStat.displayValue) : "";
    const streakMatch = /^([WL])(\d+)$/i.exec(streakText);
    const winPercentStat = stats.get("winPercent") ?? stats.get("winPercentage");
    return {
      position: statValue("rank") || statValue("playoffSeed"),
      team: teamName,
      played,
      won: statValue("wins"),
      drawn: 0,
      lost: statValue("losses"),
      goalsFor: statValue("pointsFor"),
      goalsAgainst: statValue("pointsAgainst"),
      goalDifference: statValue("pointDifferential"),
      points: statValue("wins") * 2,
      ...(winPercentStat
        ? { winPercentage: numberValue(winPercentStat.value) ?? undefined }
        : {}),
      ...(stats.has("gamesBehind")
        ? { gamesBehind: numberValue(stats.get("gamesBehind")?.value) ?? undefined }
        : {}),
      ...(streakMatch
        ? { streak: (streakMatch[1].toUpperCase() === "W" ? 1 : -1) * Number(streakMatch[2]) }
        : {}),
    };
  }).filter(standing => standing.team.length > 0);
}

function mapEspnInjuries(
  payload: UnknownRecord,
  homeTeamId: string,
  awayTeamId: string
): { home: EspnInjury[]; away: EspnInjury[] } {
  const result = { home: [] as EspnInjury[], away: [] as EspnInjury[] };
  const injuries = records(payload.injuries);
  for (const block of injuries) {
    const teamId = isRecord(block.team) ? text(block.team.id) : "";
    if (teamId !== homeTeamId && teamId !== awayTeamId) continue;
    const side = teamId === homeTeamId ? "home" : "away";
    for (const item of records(block.injuries)) {
      const athlete = isRecord(item.athlete) ? item.athlete : {};
      const status = text(item.status);
      result[side].push({
        name: text(athlete.displayName) || text(athlete.fullName),
        ...(status ? { status } : {}),
        ...(text(item.date) ? { date: text(item.date) } : {}),
        ...(text(item.type) ? { type: text(item.type) } : {}),
        ...(text(isRecord(athlete.headshot) ? athlete.headshot.href : undefined)
          ? { imageUrl: text(isRecord(athlete.headshot) ? athlete.headshot.href : undefined) }
          : {}),
      });
    }
  }
  return result;
}

/** Analyse la réponse « summary » d'une rencontre ESPN. */
export function parseEspnSummary(
  payload: unknown,
  league: EspnBasketballLeague,
  source: "espn" | "cache",
  cachedAt?: string
): EspnBasketballSummary {
  if (!isRecord(payload)) {
    throw new Error("The sports data service returned an invalid match details response.");
  }
  const header = isRecord(payload.header) ? payload.header : {};
  const competitions = records(header.competitions);
  const competition = competitions[0];
  if (!competition) {
    throw new Error("The sports data service returned incomplete match details.");
  }

  const competitors = records(competition.competitors);
  const home = competitors.find(entry => text(entry.homeAway).toLowerCase() === "home");
  const away = competitors.find(entry => text(entry.homeAway).toLowerCase() === "away");
  if (!home || !away) {
    throw new Error("The sports data service returned incomplete team data.");
  }

  const fixture = mapEspnEvent(
    { id: text(header.id) || text(competition.id), date: text(competition.date) || text(header.date), competitions },
    league
  );
  if (!fixture) {
    throw new Error("The sports data service returned incomplete match details.");
  }

  const homeTeamId = text(isRecord(home.team) ? home.team.id : undefined);
  const awayTeamId = text(isRecord(away.team) ? away.team.id : undefined);
  const boxscore = isRecord(payload.boxscore) ? payload.boxscore : {};
  const gameInfo = isRecord(payload.gameInfo) ? payload.gameInfo : {};
  const venue = isRecord(gameInfo.venue) ? gameInfo.venue : {};
  const attendance = numberValue(competition.attendance ?? gameInfo.attendance);
  const officials = records(gameInfo.officials)
    .map(official => text(official.displayName) || text(official.fullName))
    .filter(Boolean);

  const playerStats = mapEspnPlayerStats(boxscore, homeTeamId, awayTeamId);

  return {
    fixture,
    source,
    ...(cachedAt ? { cachedAt } : {}),
    stats: mapEspnTeamStats(boxscore),
    playerStats: { home: playerStats.home, away: playerStats.away },
    playerStatKeys: playerStats.keys,
    plays: mapEspnPlays(payload, homeTeamId, awayTeamId),
    standings: mapEspnStandings(payload.standings),
    injuries: mapEspnInjuries(payload, homeTeamId, awayTeamId),
    ...(text(venue.fullName) ? { venue: text(venue.fullName) } : {}),
    ...(attendance === null ? {} : { attendance }),
    officials,
    records: {
      ...(espnRecordsSummary(home) ? { home: espnRecordsSummary(home) } : {}),
      ...(espnRecordsSummary(away) ? { away: espnRecordsSummary(away) } : {}),
    },
    periodScores: mapEspnPeriodScoresFromCompetitors(competitors),
  };
}

/**
 * Résumé complet d'une rencontre de basket (statistiques, compositions, plays).
 * Bascule sur le cache PostgreSQL si l'API ESPN est injoignable.
 */
export async function loadEspnBasketballSummary(
  fixtureId: string
): Promise<EspnBasketballSummary> {
  const target = parseEspnFixtureId(fixtureId);
  if (!target) throw new Error("Provide a valid basketball fixture ID.");

  try {
    const payload: unknown = await fetchEspn(espnSummaryUrl(target.league, target.eventId));
    const summary = parseEspnSummary(payload, target.league, "espn");
    try {
      await saveEspnMatchDetails(fixtureId, payload);
    } catch (cacheError) {
      console.error(`Could not save the ESPN details for ${fixtureId} to the PostgreSQL cache.`, cacheError);
    }
    return summary;
  } catch (apiError) {
    try {
      const cached = await loadEspnMatchDetails(fixtureId);
      if (cached) {
        return parseEspnSummary(cached.response, target.league, "cache", cached.cachedAt);
      }
    } catch (cacheError) {
      console.error(`Could not read the ESPN details cache for ${fixtureId}.`, cacheError);
    }
    console.error(`No match details available for ${fixtureId} from the API or the cache.`, apiError);
    throw new EspnDataUnavailableError();
  }
}

/** Titre d'une rencontre ESPN, utile pour les replis d'événement unique. */
export async function loadEspnBasketballFixtureById(eventId: string): Promise<Fixture | null> {
  const parsed = parseEspnFixtureId(eventId);
  if (!parsed) return null;
  const payload: unknown = await fetchEspn(espnEventUrl(parsed.league, parsed.eventId));
  const fixtures = fixturesFromEspnResponse(payload, parsed.league);
  return fixtures.find(fixture => fixture.id === eventId) ?? fixtures[0] ?? null;
}
