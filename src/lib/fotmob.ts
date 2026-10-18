import type { Fixture, FixtureCards, FixtureStanding } from "@/lib/fixtures";
import {
  loadFotMobFixturesByIds as loadCachedFotMobFixturesByIds,
  loadFotMobDailyResponse,
  loadFotMobMatchDetails as loadCachedFotMobMatchDetails,
  loadFotMobStandings as loadCachedFotMobStandings,
  saveFotMobDailyResponse,
  saveFotMobMatchDetails,
  saveFotMobStandings,
} from "@/lib/fotmobCache";

type UnknownRecord = Record<string, unknown>;

export interface HistoricalMatch {
  date: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  score: string;
}

export interface FixtureHistory {
  confrontations: HistoricalMatch[];
  recentMatches: Array<{ team: string; matches: HistoricalMatch[] }>;
}

export interface FotMobPlayer {
  number: number;
  name: string;
  position: string;
  rating?: string;
  imageUrl?: string;
  x?: number;
  y?: number;
}

export interface FotMobUnavailablePlayer {
  name: string;
  type: string;
  expectedReturn?: string;
  imageUrl?: string;
}

export interface FotMobComment {
  minute: string;
  text: string;
  side?: "home" | "away";
}

export interface FotMobRecap {
  title: string;
  description: string;
  summary?: string;
  url?: string;
  articleId?: string;
}

export interface FotMobMomentumPoint {
  minute: number;
  value: number;
}

export interface FotMobDetails {
  fixture: Fixture;
  source: "fotmob" | "cache";
  cachedAt?: string;
  coverageLevel?: string;
  lineupType: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
  homeFormation: string;
  awayFormation: string;
  events: Array<{
    minute: number | string;
    type: string;
    player: string;
    playerImageUrl?: string;
    detail?: string;
    side?: "home" | "away";
    playerIn?: string;
    playerInImageUrl?: string;
    playerOut?: string;
    playerOutImageUrl?: string;
    period?: "halftime" | "fulltime";
  }>;
  standings: FixtureStanding[];
  homeLineup: FotMobPlayer[];
  awayLineup: FotMobPlayer[];
  homeSubstitutes: FotMobPlayer[];
  awaySubstitutes: FotMobPlayer[];
  homeUnavailablePlayers: FotMobUnavailablePlayer[];
  awayUnavailablePlayers: FotMobUnavailablePlayer[];
  comments: FotMobComment[];
  recap?: FotMobRecap;
  momentum: FotMobMomentumPoint[];
  topPlayers: {
    home: Array<{ number?: number; name: string; position: string; rating?: string; imageUrl?: string }>;
    away: Array<{ number?: number; name: string; position: string; rating?: string; imageUrl?: string }>;
  };
  stats: Map<string, { home: string; away: string }>;
  history: FixtureHistory;
  historyMatchIds: string[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function fotMobTeamImageUrl(id: unknown): string | undefined {
  const teamId = text(id);
  return /^\d+$/.test(teamId) && Number(teamId) > 0
    ? `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}_small.png`
    : undefined;
}

function fotMobPlayerImageUrl(id: unknown): string | undefined {
  const playerId = text(id);
  return /^\d+$/.test(playerId) && Number(playerId) > 0
    ? `https://images.fotmob.com/image_resources/playerimages/${playerId}.png`
    : undefined;
}

function isoDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function toScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function scorePair(value: string): [number, number] | null {
  const match = value.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function frenchStatus(status: UnknownRecord): string {
  if (status.cancelled === true) return "Annulé";
  if (status.finished === true) return "Terminé";
  if (status.started === true) return "En direct";
  return "Prévu";
}

function liveDisplay(status: UnknownRecord): string | undefined {
  if (status.started !== true || status.finished === true) return undefined;
  const liveTime = isRecord(status.liveTime) ? status.liveTime : {};
  const halfs = isRecord(status.halfs) ? status.halfs : {};
  const liveKey = `${text(liveTime.shortKey)} ${text(liveTime.longKey)}`.toLowerCase();
  const short = text(liveTime.short).replace(/[\u200e\u200f]/g, "").trim();
  const isHalfTime = liveKey.includes("halftime")
    || short.toUpperCase() === "HT"
    || (Boolean(text(halfs.firstHalfEnded)) && !text(halfs.secondHalfStarted));
  if (isHalfTime) return "Mi-temps";

  const addedTime = Number(liveTime.addedTime);
  const basePeriod = Number(liveTime.basePeriod);
  if (Number.isFinite(addedTime) && addedTime > 0 && Number.isFinite(basePeriod) && basePeriod > 0) {
    return `${basePeriod}'+${addedTime}`;
  }
  return short || text(liveTime.long) || undefined;
}

function mapMatch(match: UnknownRecord, league: string, date: string): Fixture | null {
  if (!isRecord(match.home) || !isRecord(match.away) || !isRecord(match.status)) return null;
  const homeTeam = text(match.home.name);
  const awayTeam = text(match.away.name);
  const id = text(match.id);
  const rawTime = text(match.time);
  const time = rawTime.match(/\b\d{1,2}:\d{2}\b/)?.[0] ?? rawTime;
  if (!id || !homeTeam || !awayTeam) return null;
  const status = match.status;
  const homeScore = toScore(match.home.score);
  const awayScore = toScore(match.away.score);
  const hasStarted = status.started === true || status.finished === true;
  const score = hasStarted
    ? text(status.scoreStr) || (homeScore !== null && awayScore !== null ? `${homeScore} - ${awayScore}` : "")
    : "";
  const statusDisplay = liveDisplay(status);
  return {
    id,
    matchId: id,
    sport: "football",
    date,
    time,
    league,
    homeTeam,
    awayTeam,
    ...(fotMobTeamImageUrl(match.home.id) ? { homeImageUrl: fotMobTeamImageUrl(match.home.id) } : {}),
    ...(fotMobTeamImageUrl(match.away.id) ? { awayImageUrl: fotMobTeamImageUrl(match.away.id) } : {}),
    ...(!hasStarted || homeScore === null ? {} : { homeScore: String(homeScore) }),
    ...(!hasStarted || awayScore === null ? {} : { awayScore: String(awayScore) }),
    ...(score ? { score } : {}),
    status: frenchStatus(status),
    ...(statusDisplay ? { liveDisplay: statusDisplay } : {}),
  };
}

async function fetchFotMob<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "IkProno/1.0 (FotMob data)" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error(`FotMob returned an invalid response (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function fixturesFromFotMobResponse(response: unknown, date: string): Fixture[] {
  const payload = response;
  if (!isRecord(payload) || !Array.isArray(payload.leagues)) {
    throw new Error("FotMob returned an invalid matches response.");
  }
  const fixtures: Fixture[] = [];
  for (const league of payload.leagues) {
    if (!isRecord(league) || typeof league.name !== "string" || !Array.isArray(league.matches)) {
      throw new Error("FotMob returned an invalid league in the matches response.");
    }
    for (const match of league.matches) {
      if (!isRecord(match)) throw new Error(`FotMob returned invalid match data for ${league.name}.`);
      const fixture = mapMatch(match, league.name, date);
      if (!fixture) throw new Error(`FotMob returned invalid match data for ${league.name}.`);
      fixtures.push(fixture);
    }
  }
  return fixtures;
}

export async function loadFotMobDay(date: string): Promise<{
  response: unknown;
  fixtures: Fixture[];
  source: "fotmob" | "cache";
  cachedAt?: string;
}> {
  if (!isIsoDate(date)) throw new Error("A valid date in YYYY-MM-DD format is required.");
  try {
    const payload: unknown = await fetchFotMob(
      `https://www.fotmob.com/api/data/matches?date=${date.replaceAll("-", "")}`
    );
    const fixtures = fixturesFromFotMobResponse(payload, date);
    try {
      await saveFotMobDailyResponse(date, payload, fixtures);
    } catch (cacheError) {
      console.error(`Could not save FotMob matches for ${date} to PostgreSQL cache.`, cacheError);
    }
    return { response: payload, fixtures, source: "fotmob" };
  } catch (apiError) {
    try {
      const cached = await loadFotMobDailyResponse(date);
      if (cached) {
        return {
          response: cached.response,
          fixtures: fixturesFromFotMobResponse(cached.response, date),
          source: "cache",
          cachedAt: cached.cachedAt,
        };
      }
    } catch (cacheError) {
      console.error(`Could not read FotMob matches cache for ${date}.`, cacheError);
      throw new AggregateError(
        [apiError, cacheError],
        "FotMob is unavailable and the PostgreSQL match cache could not be read."
      );
    }
    throw apiError;
  }
}

export async function loadFixturesFromFotMobByDate(date: string): Promise<Fixture[]> {
  return (await loadFotMobDay(date)).fixtures;
}

export async function loadFixturesFromFotMobByDateRange(from: string, to: string): Promise<Fixture[]> {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
    throw new Error("A valid date range is required.");
  }
  const first = new Date(`${from}T00:00:00.000Z`);
  const last = new Date(`${to}T00:00:00.000Z`);
  const dayCount = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  if (dayCount > 31) throw new Error("FotMob date ranges are limited to 31 days.");
  const fixtures: Fixture[] = [];
  for (let offset = 0; offset < dayCount; offset += 4) {
    const dates = Array.from({ length: Math.min(4, dayCount - offset) }, (_, index) =>
      new Date(first.getTime() + (offset + index) * 86_400_000).toISOString().slice(0, 10)
    );
    const dailyFixtures = await Promise.all(dates.map(loadFixturesFromFotMobByDate));
    fixtures.push(...dailyFixtures.flat());
  }
  return fixtures;
}

function mapHistoricalMatch(value: unknown, competition = ""): HistoricalMatch | null {
  if (!isRecord(value) || !isRecord(value.home) || !isRecord(value.away)) return null;
  const status = isRecord(value.status) ? value.status : {};
  const homeTeam = text(value.home.name);
  const awayTeam = text(value.away.name);
  const tooltip = isRecord(value.tooltipText) ? value.tooltipText : {};
  const score = scorePair(text(status.scoreStr) || text(value.score))
    ?? (() => {
      const homeScore = toScore(tooltip.homeScore);
      const awayScore = toScore(tooltip.awayScore);
      return homeScore === null || awayScore === null ? null : [homeScore, awayScore] as [number, number];
    })();
  const finished = status.finished === true || (score !== null && typeof value.resultString === "string");
  if (!finished) return null;
  if (!homeTeam || !awayTeam || !score) return null;
  const time = isRecord(value.time) ? value.time : isRecord(value.date) ? value.date : {};
  const league = isRecord(value.league) ? text(value.league.name) : competition;
  return {
    date: isoDate(time.utcTime),
    competition: league,
    homeTeam,
    awayTeam,
    homeScore: score[0],
    awayScore: score[1],
    score: `${score[0]} - ${score[1]}`,
  };
}

function mapPlayer(value: unknown): FotMobPlayer | null {
  if (!isRecord(value)) return null;
  const player = isRecord(value.name) ? text(value.name.fullName) || text(value.name.firstName) : text(value.name);
  if (!player) return null;
  const position = isRecord(value.position) ? text(value.position.label) : text(value.positionName);
  const performance = isRecord(value.performance) ? value.performance : {};
  const playerImageUrl = typeof value.imageUrl === "string" ? value.imageUrl : fotMobPlayerImageUrl(value.id);
  const layout = isRecord(value.horizontalLayout) ? value.horizontalLayout : {};
  const x = typeof layout.x === "number" && Number.isFinite(layout.x) ? layout.x : undefined;
  const y = typeof layout.y === "number" && Number.isFinite(layout.y) ? layout.y : undefined;
  return {
    number: Number(value.shirtNumber) || 0,
    name: player,
    position,
    ...(performance.rating === undefined ? {} : { rating: text(performance.rating) }),
    ...(playerImageUrl ? { imageUrl: playerImageUrl } : {}),
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
  };
}

function mapTopPlayers(payload: unknown) {
  const facts = isRecord(payload) && isRecord(payload.content) && isRecord(payload.content.matchFacts)
    ? payload.content.matchFacts
    : {};
  const topPlayers = isRecord(facts.topPlayers) ? facts.topPlayers : {};
  const map = (key: "homeTopPlayers" | "awayTopPlayers") => {
    const players = Array.isArray(topPlayers[key]) ? topPlayers[key] : [];
    return players.flatMap(value => {
      if (!isRecord(value)) return [];
      const name = isRecord(value.name)
        ? text(value.name.fullName) || [text(value.name.firstName), text(value.name.lastName)].filter(Boolean).join(" ")
        : text(value.name);
      if (!name) return [];
      const position = isRecord(value.positionLabel) ? text(value.positionLabel.label) : "";
      const playerImageUrl = typeof value.imageUrl === "string" ? value.imageUrl : fotMobPlayerImageUrl(value.playerId);
      return [{
        name,
        position,
        ...(text(value.playerRatingRounded) ? { rating: text(value.playerRatingRounded) } : {}),
        ...(playerImageUrl ? { imageUrl: playerImageUrl } : {}),
      }];
    });
  };
  return { home: map("homeTopPlayers"), away: map("awayTopPlayers") };
}

function mapLineup(payload: unknown, key: "homeTeam" | "awayTeam") {
  const content = isRecord(payload) && isRecord(payload.content) ? payload.content : {};
  const lineup = isRecord(content.lineup) ? content.lineup : {};
  const team = isRecord(lineup[key]) ? lineup[key] : {};
  const map = (key: "starters" | "subs") =>
    (Array.isArray(team[key]) ? team[key] : [])
      .map(mapPlayer)
      .filter((player): player is NonNullable<ReturnType<typeof mapPlayer>> => player !== null);
  const unavailable = (Array.isArray(team.unavailable) ? team.unavailable : [])
    .flatMap(value => {
      if (!isRecord(value)) return [];
      const name = text(value.name);
      if (!name) return [];
      const unavailability = isRecord(value.unavailability) ? value.unavailability : {};
      const imageUrl = fotMobPlayerImageUrl(value.id);
      return [{
        name,
        type: text(unavailability.type),
        ...(text(unavailability.expectedReturn)
          ? { expectedReturn: text(unavailability.expectedReturn) }
          : {}),
        ...(imageUrl ? { imageUrl } : {}),
      }];
    });
  return {
    formation: text(team.formation),
    starters: map("starters"),
    subs: map("subs"),
    unavailable,
  };
}

function mapFotMobComments(events: UnknownRecord[], commentValues: unknown[]): FotMobComment[] {
  const toComment = (event: UnknownRecord): FotMobComment[] => {
    const content = [
      event.text,
      event.textStr,
      event.comment,
      event.commentary,
      event.description,
      event.eventText,
      event.message,
    ].map(text).find(value => value.trim()) ?? "";
    if (!content) return [];
    return [{
      minute: text(event.timeStr) || text(event.time) || text(event.minute),
      text: content.trim(),
      ...(typeof event.isHome === "boolean"
        ? { side: event.isHome ? "home" as const : "away" as const }
        : {}),
    }];
  };
  const typedComments = events.filter(event =>
    text(event.type).toLowerCase().includes("comment")
    || event.commentary === true
    || (typeof event.commentary === "string" && Boolean(event.commentary.trim()))
    || event.isComment === true
  );
  const mapped = [
    ...typedComments.flatMap(toComment),
    ...commentValues.flatMap(value => {
      if (typeof value === "string" && value.trim()) {
        return [{ minute: "", text: value.trim() }];
      }
      return isRecord(value) ? toComment(value) : [];
    }),
  ];
  return Array.from(
    new Map(mapped.map(comment => [`${comment.minute}\0${comment.text}`, comment])).values()
  )
    .sort((a, b) => {
      const minuteA = Number.parseFloat(a.minute);
      const minuteB = Number.parseFloat(b.minute);
      return (Number.isFinite(minuteA) ? minuteA : Number.MAX_SAFE_INTEGER)
        - (Number.isFinite(minuteB) ? minuteB : Number.MAX_SAFE_INTEGER);
    });
}

function mapFotMobRecap(facts: UnknownRecord): FotMobRecap | undefined {
  const reviews = Array.isArray(facts.postReview) ? facts.postReview.filter(isRecord) : [];
  const review = reviews.find(item => text(item.lang).toLowerCase() === "fr")
    ?? reviews.find(item => text(item.lang).toLowerCase().startsWith("en"))
    ?? reviews[0];
  if (!review) return undefined;

  const title = text(review.title).trim();
  const description = text(review.description).trim();
  if (!title && !description) return undefined;

  const url = text(review.shareUrl).trim();
  return {
    title,
    description,
    ...(text(review.id) ? { articleId: text(review.id) } : {}),
    ...(url.startsWith("https://") ? { url } : {}),
  };
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
      if (code.toLowerCase() === "nbsp") return " ";
      if (code.startsWith("#x")) {
        const point = Number.parseInt(code.slice(2), 16);
        return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : entity;
      }
      if (code.startsWith("#")) {
        const point = Number.parseInt(code.slice(1), 10);
        return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : entity;
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[code.toLowerCase()] ?? entity;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadFotMobRecapSummary(details: FotMobDetails, payload: unknown): Promise<void> {
  if (!details.recap?.articleId || !/^[\w-]{1,128}$/.test(details.recap.articleId)) return;
  try {
    const article = await fetchFotMob<unknown>(
      `https://apigw.fotmob.com/searchapi/search?entity=id&term=${encodeURIComponent(details.recap.articleId)}`
    );
    if (!isRecord(article) || typeof article.Summary !== "string") return;
    const summary = htmlToPlainText(article.Summary);
    if (summary) {
      details.recap = {
        ...details.recap,
        title: text(article.Title).trim() || details.recap.title,
        summary,
      };
    }
  } catch (error) {
    const matchId = isRecord(payload) && isRecord(payload.general) ? text(payload.general.matchId) : "unknown";
    console.error(`Could not load FotMob recap article for match ${matchId}.`, error);
  }
}

function mapFotMobMomentum(payload: UnknownRecord, facts: UnknownRecord): FotMobMomentumPoint[] {
  const content = isRecord(payload.content) ? payload.content : {};
  const momentum = isRecord(content.momentum)
    ? content.momentum
    : isRecord(facts.momentum)
      ? facts.momentum
      : {};
  const main = isRecord(momentum.main) ? momentum.main : momentum;
  const points = Array.isArray(main.data) ? main.data : [];
  return points.flatMap(point => {
    if (!isRecord(point) || typeof point.minute !== "number" || typeof point.value !== "number") {
      return [];
    }
    if (!Number.isFinite(point.minute) || point.minute < 0 || !Number.isFinite(point.value)) return [];
    return [{ minute: point.minute, value: Math.max(-100, Math.min(100, point.value)) }];
  }).sort((a, b) => a.minute - b.minute);
}

function parseFotMobDetails(payload: unknown, matchId: string, source: "fotmob" | "cache", cachedAt?: string): FotMobDetails {
  if (!/^\d{1,20}$/.test(matchId)) throw new Error("Provide a valid FotMob match ID.");
  if (!isRecord(payload) || !isRecord(payload.general) || !isRecord(payload.header)) {
    throw new Error("FotMob returned an invalid match details response.");
  }
  const general = payload.general;
  const header = payload.header;
  const content = isRecord(payload.content) ? payload.content : {};
  const facts = isRecord(content.matchFacts) ? content.matchFacts : {};
  const teams = Array.isArray(header.teams) ? header.teams : [];
  const home = teams[0];
  const away = teams[1];
  if (!isRecord(home) || !isRecord(away)) throw new Error("FotMob returned incomplete team data.");
  const status = isRecord(header.status) ? header.status : {};
  const date = isoDate(general.matchTimeUTCDate) || isoDate(general.matchTimeUTC);
  const time = isRecord(status.liveTime) ? text(status.liveTime.short) : "";
  const homeTeam = text(home.name);
  const awayTeam = text(away.name);
  const homeScore = toScore(home.score);
  const awayScore = toScore(away.score);
  const hasStarted = status.started === true || status.finished === true;
  const scoreText = hasStarted ? text(status.scoreStr) : "";
  const statusLabel = frenchStatus(status);
  const statusDisplay = liveDisplay(status);
  const homeTeamImageUrl = typeof home.imageUrl === "string" ? home.imageUrl : fotMobTeamImageUrl(home.id);
  const awayTeamImageUrl = typeof away.imageUrl === "string" ? away.imageUrl : fotMobTeamImageUrl(away.id);
  const fixture: Fixture = {
    id: matchId,
    matchId,
    sport: "football",
    date,
    time: text(general.matchTimeUTC).match(/\b\d{1,2}:\d{2}\b/)?.[0] ?? "",
    league: text(general.leagueName),
    homeTeam,
    awayTeam,
    ...(homeTeamImageUrl ? { homeImageUrl: homeTeamImageUrl } : {}),
    ...(awayTeamImageUrl ? { awayImageUrl: awayTeamImageUrl } : {}),
    ...(!hasStarted || homeScore === null ? {} : { homeScore: String(homeScore) }),
    ...(!hasStarted || awayScore === null ? {} : { awayScore: String(awayScore) }),
    ...(scoreText ? { score: scoreText } : {}),
    status: statusLabel,
    ...(statusDisplay ? { liveDisplay: statusDisplay } : {}),
  };

  const statsPayload = isRecord(content.stats) ? content.stats : {};
  const periods = isRecord(statsPayload.Periods) ? statsPayload.Periods : {};
  const all = isRecord(periods.All) ? periods.All : {};
  const groups = Array.isArray(all.stats) ? all.stats : [];
  const stats = new Map<string, { home: string; away: string }>();
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.stats)) continue;
    for (const stat of group.stats) {
      if (!isRecord(stat) || typeof stat.title !== "string" || !Array.isArray(stat.stats)) continue;
      const values = {
        home: text(stat.stats[0]),
        away: text(stat.stats[1]),
      };
      if (values.home || values.away) stats.set(stat.title.toLocaleLowerCase("en"), values);
    }
  }

  const eventContainer = isRecord(facts.events) ? facts.events : {};
  const rawEvents = Array.isArray(eventContainer.events) ? eventContainer.events : [];
  const liveticker = isRecord(content.liveticker) ? content.liveticker : {};
  const rawComments = [
    ...(Array.isArray(eventContainer.comments) ? eventContainer.comments : []),
    ...(Array.isArray(liveticker.comments) ? liveticker.comments : []),
    ...(Array.isArray(content.comments) ? content.comments : []),
  ];
  const comments = mapFotMobComments(
    rawEvents.filter(isRecord),
    rawComments
  );
  const recap = mapFotMobRecap(facts);
  const momentum = mapFotMobMomentum(payload, facts);
  const events = rawEvents.filter(isRecord).map(event => {
    const player = isRecord(event.player) ? text(event.player.name) : text(event.player);
    const type = text(event.type) || "Event";
    const swap = Array.isArray(event.swap) ? event.swap.filter(isRecord) : [];
    const swapNames = swap.map(entry => text(entry.name)).filter(Boolean);
    const actor = text(event.nameStr) || player || swapNames.join(" → ");
    const card = text(event.card);
    const assist = text(event.assistStr);
    const isSubstitution = type.toLowerCase().includes("substitution");
    const detail = [
      card || "",
      assist ? `Passe décisive : ${assist.replace(/^assist by\s+/i, "")}` : "",
    ].filter(Boolean).join(" ");
    const halfLabel = text(event.halfStrShort).toUpperCase();
    const playerId = isRecord(event.player) ? event.player.id : event.playerId;
    const playerImageUrl = typeof event.profileUrl === "string" && event.profileUrl.startsWith("https://")
      ? event.profileUrl
      : fotMobPlayerImageUrl(playerId);
    const playerInImageUrl = fotMobPlayerImageUrl(swap[1]?.id);
    const playerOutImageUrl = fotMobPlayerImageUrl(swap[0]?.id);
    return {
      minute: text(event.timeStr) || text(event.time),
      type,
      player: type === "Half"
        ? halfLabel === "HT" ? "Mi-temps" : halfLabel === "FT" ? "Fin du match" : actor || type
        : isSubstitution ? swapNames[1] || actor || type : actor || type,
      ...(detail ? { detail } : {}),
      ...(playerImageUrl ? { playerImageUrl } : {}),
      ...(typeof event.isHome === "boolean" ? { side: event.isHome ? "home" as const : "away" as const } : {}),
      ...(isSubstitution && swapNames[1] ? { playerIn: swapNames[1] } : {}),
      ...(isSubstitution && playerInImageUrl ? { playerInImageUrl } : {}),
      ...(isSubstitution && swapNames[0] ? { playerOut: swapNames[0] } : {}),
      ...(isSubstitution && playerOutImageUrl ? { playerOutImageUrl } : {}),
      ...(type === "Half" && halfLabel === "HT" ? { period: "halftime" as const } : {}),
      ...(type === "Half" && halfLabel === "FT" ? { period: "fulltime" as const } : {}),
    };
  });
  const halfs = isRecord(status.halfs) ? status.halfs : {};
  const isHalfTime = status.started === true
    && status.finished !== true
    && Boolean(text(halfs.firstHalfEnded))
    && !text(halfs.secondHalfStarted);
  if (isHalfTime && !events.some(event => event.period === "halftime")) {
    events.push({
      minute: "45",
      type: "Half",
      player: "Mi-temps",
      period: "halftime",
    });
  }
  const h2h = isRecord(content.h2h) && Array.isArray(content.h2h.matches) ? content.h2h.matches : [];
  const confrontations = h2h
    .map(match => mapHistoricalMatch(match))
    .filter((match): match is HistoricalMatch => match !== null);
  const teamForm = Array.isArray(facts.teamForm) ? facts.teamForm : [];
  const recentMatches = teamForm.slice(0, 2).map((rows, index) => {
    const matches = (Array.isArray(rows) ? rows : [])
      .map(match => mapHistoricalMatch(match, ""))
      .filter((match): match is HistoricalMatch => match !== null);
    return {
      team: index === 0 ? homeTeam : awayTeam,
      matches: matches.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
  const historyMatchIds = [
    ...h2h,
    ...teamForm.flatMap(rows => Array.isArray(rows) ? rows : []),
  ].flatMap(match => {
    if (!isRecord(match)) return [];
    const url = text(match.matchUrl) || text(match.linkToMatch);
    const matchId = url.match(/#(\d{1,20})$/)?.[1];
    return matchId ? [matchId] : [];
  }).filter((id, index, all) => all.indexOf(id) === index);
  const homeLineup = mapLineup(payload, "homeTeam");
  const awayLineup = mapLineup(payload, "awayTeam");
  const lineup = isRecord(content.lineup) ? content.lineup : {};
  const topPlayers = mapTopPlayers(payload);
  const cards = {
    home: {
      yellow: Number(stats.get("yellow cards")?.home) || 0,
      red: Math.max(
        Number(stats.get("red cards")?.home) || 0,
        events.filter(event => event.side === "home"
          && event.type.toLowerCase().includes("card")
          && /red/i.test(`${event.type} ${event.detail ?? ""}`)).length
      ),
      corners: Number(stats.get("corners")?.home) || 0,
    },
    away: {
      yellow: Number(stats.get("yellow cards")?.away) || 0,
      red: Math.max(
        Number(stats.get("red cards")?.away) || 0,
        events.filter(event => event.side === "away"
          && event.type.toLowerCase().includes("card")
          && /red/i.test(`${event.type} ${event.detail ?? ""}`)).length
      ),
      corners: Number(stats.get("corners")?.away) || 0,
    },
  } satisfies FixtureCards;
  if (status.started === true && (status.finished === true || status.liveTime)) {
    fixture.matchCards = cards;
    const shots = stats.get("total shots") ?? stats.get("shots");
    const shotsOnTarget = stats.get("shots on target");
    const corners = stats.get("corners");
    const yellowCards = stats.get("yellow cards");
    fixture.liveStatistics = {
      shots: shots ? (Number(shots.home) || 0) + (Number(shots.away) || 0) : null,
      shotsOnTarget: shotsOnTarget ? (Number(shotsOnTarget.home) || 0) + (Number(shotsOnTarget.away) || 0) : null,
      corners: corners ? (Number(corners.home) || 0) + (Number(corners.away) || 0) : null,
      cards: yellowCards ? (Number(yellowCards.home) || 0) + (Number(yellowCards.away) || 0) : null,
    };
  }

  return {
    fixture,
    source,
    ...(cachedAt ? { cachedAt } : {}),
    ...(typeof general.coverageLevel === "string" ? { coverageLevel: general.coverageLevel } : {}),
    lineupType: text(lineup.lineupType),
    ...(homeTeamImageUrl ? { homeImageUrl: homeTeamImageUrl } : {}),
    ...(awayTeamImageUrl ? { awayImageUrl: awayTeamImageUrl } : {}),
    homeFormation: homeLineup.formation,
    awayFormation: awayLineup.formation,
    events,
    standings: [],
    homeLineup: homeLineup.starters,
    awayLineup: awayLineup.starters,
    homeSubstitutes: homeLineup.subs,
    awaySubstitutes: awayLineup.subs,
    homeUnavailablePlayers: homeLineup.unavailable,
    awayUnavailablePlayers: awayLineup.unavailable,
    comments,
    ...(recap ? { recap } : {}),
    momentum,
    topPlayers,
    stats,
    history: { confrontations, recentMatches },
    historyMatchIds,
  };
}

function parseFotMobStandings(xml: string): FixtureStanding[] {
  const decodeXml = (value: string) => value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[code.toLowerCase()] ?? entity;
    }
  );
  const rows: FixtureStanding[] = [];
  const teams = xml.matchAll(/<t\b([^>]*)\/?>/g);
  for (const [index, row] of Array.from(teams).entries()) {
    const attributes = new Map<string, string>();
    for (const [, key, value] of row[1].matchAll(/([a-zA-Z_]+)="([^"]*)"/g)) {
      attributes.set(key, decodeXml(value));
    }
    const team = attributes.get("name");
    const points = Number(attributes.get("p"));
    const won = Number(attributes.get("w"));
    const drawn = Number(attributes.get("d"));
    const lost = Number(attributes.get("l"));
    const goalsFor = Number(attributes.get("g"));
    const goalsAgainst = Number(attributes.get("c"));
    if (
      !team
      || ![points, won, drawn, lost, goalsFor, goalsAgainst].every(Number.isFinite)
    ) continue;
    rows.push({
      position: index + 1,
      team,
      played: won + drawn + lost,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points,
    });
  }
  return rows;
}

async function loadFotMobStandingsFromApi(payload: unknown): Promise<{ leagueId: string; standings: FixtureStanding[] }> {
  const content = isRecord(payload) && isRecord(payload.content) ? payload.content : {};
  const table = isRecord(content.table) ? content.table : {};
  const tableUrl = text(table.url);
  const leagueId = tableUrl.match(/tables\.ext\.(\d+)\.fot\.gz$/)?.[1]
    ?? text(table.leagueId).match(/^\d+$/)?.[0];
  if (!leagueId) throw new Error("FotMob match details do not include a standings table.");

  const response = await fetch(`https://data.fotmob.com/tables.ext.${leagueId}.fot.gz`, {
    headers: { Accept: "text/plain, */*", "User-Agent": "IkProno/1.0 (FotMob data)" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`FotMob standings request failed (HTTP ${response.status}).`);
  }
  const standings = parseFotMobStandings(await response.text());
  if (standings.length === 0) throw new Error("FotMob returned no standings rows.");
  return { leagueId, standings };
}

async function loadFotMobStandings(payload: unknown): Promise<FixtureStanding[]> {
  let leagueId: string | undefined;
  try {
    const result = await loadFotMobStandingsFromApi(payload);
    leagueId = result.leagueId;
    try {
      await saveFotMobStandings(result.leagueId, result.standings);
    } catch (cacheError) {
      console.error(`Could not save FotMob standings for league ${result.leagueId} to PostgreSQL cache.`, cacheError);
    }
    return result.standings;
  } catch (apiError) {
    const content = isRecord(payload) && isRecord(payload.content) ? payload.content : {};
    const table = isRecord(content.table) ? content.table : {};
    const tableUrl = text(table.url);
    leagueId = tableUrl.match(/tables\.ext\.(\d+)\.fot\.gz$/)?.[1]
      ?? text(table.leagueId).match(/^\d+$/)?.[0];
    if (!leagueId) {
      console.error("Could not load FotMob standings.", apiError);
      return [];
    }
    try {
      const cached = await loadCachedFotMobStandings(leagueId);
      if (cached) return cached.standings;
    } catch (cacheError) {
      console.error(`Could not read FotMob standings cache for league ${leagueId}.`, cacheError);
      throw new AggregateError(
        [apiError, cacheError],
        `FotMob standings are unavailable and the PostgreSQL cache for league ${leagueId} could not be read.`
      );
    }
    console.error(`FotMob standings are unavailable for league ${leagueId}; no cached table was found.`, apiError);
    return [];
  }
}

export async function loadFotMobDetails(matchId: string): Promise<FotMobDetails> {
  if (!/^\d{1,20}$/.test(matchId)) throw new Error("Provide a valid FotMob match ID.");
  try {
    const payload: unknown = await fetchFotMob(
      `https://www.fotmob.com/api/data/matchDetails?matchId=${encodeURIComponent(matchId)}`
    );
    const details = parseFotMobDetails(payload, matchId, "fotmob");
    await loadFotMobRecapSummary(details, payload);
    details.standings = await loadFotMobStandings(payload);
    try {
      await saveFotMobMatchDetails(matchId, payload);
    } catch (cacheError) {
      console.error(`Could not save FotMob details for ${matchId} to PostgreSQL cache.`, cacheError);
    }
    return details;
  } catch (apiError) {
    try {
      const cached = await loadCachedFotMobMatchDetails(matchId);
      if (cached) {
        const details = parseFotMobDetails(cached.response, matchId, "cache", cached.cachedAt);
        await loadFotMobRecapSummary(details, cached.response);
        details.standings = await loadFotMobStandings(cached.response);
        return details;
      }
    } catch (cacheError) {
      console.error(`Could not read FotMob details cache for ${matchId}.`, cacheError);
      throw new AggregateError(
        [apiError, cacheError],
        "FotMob is unavailable and the PostgreSQL match-details cache could not be read."
      );
    }
    throw apiError;
  }
}

export async function loadFixturesFromFotMobByIds(ids: string[]): Promise<Fixture[]> {
  const fixtures: Fixture[] = [];
  for (let index = 0; index < ids.length; index += 5) {
    const batch = ids.slice(index, index + 5);
    const results = await Promise.all(batch.map(async id => {
      try {
        return (await loadFotMobDetails(id)).fixture;
      } catch (apiError) {
        console.error(`Could not load current FotMob match ${id}; checking the PostgreSQL fixture cache.`, apiError);
        const cached = await loadCachedFotMobFixturesByIds([id]);
        if (cached.length > 0) return cached[0];
        throw apiError;
      }
    }));
    fixtures.push(...results);
  }
  return fixtures;
}

export function loadLatestFixtureDate(preferredDate?: string): string {
  return isIsoDate(preferredDate ?? "") ? preferredDate! : new Date().toISOString().slice(0, 10);
}
