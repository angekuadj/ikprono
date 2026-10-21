import type { Fixture } from "@/lib/fixtures";
import type {
  CouponFixturePrediction,
  CouponLevel,
  CouponPick,
  CouponSelection,
  GeneratedCoupon,
  GeneratedScorerCoupon,
  GeneratedStatisticCoupon,
  StatisticMarket,
} from "@/lib/coupons";
import { loadFotMobDetails, type FotMobDetails, type HistoricalMatch } from "@/lib/fotmob";

/* -------------------------------------------------------------------------- */
/*  Constantes                                                                */
/* -------------------------------------------------------------------------- */

const RISK_LEVELS = ["very-safe", "safe", "medium", "bold", "very-risky"] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

const COUPON_LEVELS = ["sure", "medium", "risky"] as const;

const LEVEL_BY_RISK: Record<RiskLevel, CouponLevel> = {
  "very-safe": "sure",
  safe: "sure",
  medium: "medium",
  bold: "risky",
  "very-risky": "risky",
};

const GOAL_LEVEL_BY_RISK: Record<RiskLevel, CouponLevel> = {
  "very-safe": "sure",
  safe: "sure",
  medium: "medium",
  bold: "medium",
  "very-risky": "risky",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  "very-safe": "très prudente",
  safe: "prudente",
  medium: "moyenne",
  bold: "audacieuse",
  "very-risky": "à risque très élevé",
};

const LABELS: Record<StatisticMarket, string> = {
  shots: "tirs totaux",
  cards: "cartons",
  corners: "corners",
  "shots-on-target": "tirs cadrés",
  scorers: "buteurs",
};

const TARGET_RATES: Record<RiskLevel, number> = {
  "very-safe": 80,
  safe: 70,
  medium: 60,
  bold: 50,
  "very-risky": 40,
};

/** Taux visé par niveau de coupon, pour choisir le marché le plus crédible. */
const LEVEL_TARGET_RATES: Record<CouponLevel, number> = {
  sure: 80,
  medium: 60,
  risky: 45,
};

/** Taux minimal requis pour retenir un handicap (marché trop rare en dessous). */
const HANDICAP_MIN_RATES: Record<CouponLevel, number> = {
  sure: 55,
  medium: 45,
  risky: 35,
};

/** Écart toléré autour du taux cible pour une ligne over/under (avec repli si rien ne convient). */
const STAT_RATE_TOLERANCE = 20;

/** Plages autorisées pour les lignes de chaque marché statistique. */
const LINE_RANGES: Partial<Record<StatisticMarket, { min: number; max: number }>> = {
  corners: { min: 6, max: 18 },
  shots: { min: 22, max: 46 },
  "shots-on-target": { min: 5, max: 18 },
  cards: { min: 2.5, max: 9 },
};

/** Marchés réellement calculables par le coupon statistique. */
const SUPPORTED_STATISTIC_MARKETS = new Set<StatisticMarket>(["shots", "shots-on-target", "corners", "cards"]);

const MAX_FIXTURES_ANALYZED = 20;
/** Matchs traités en parallèle (le débit réseau réel est limité séparément). */
const FIXTURE_CONCURRENCY = 5;
/** Requêtes FotMob simultanées maximum, tous niveaux d'imbrication confondus. */
const MAX_CONCURRENT_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_ATTEMPTS = 2;
const HISTORY_MATCHES_TO_LOAD = 5;
const SCORER_HISTORY_MATCHES_TO_LOAD = 2;
/** Nombre minimal d'échantillons exploitables pour fonder une statistique. */
const MIN_STAT_SAMPLES = 3;
const PICKS_PER_MATCH = 2;
const RANDOM_POOL_FACTOR = 2;
const RANDOM_POOL_MARGIN = 3;

/**
 * Seuls ces marchés reposent sur une vraie fréquence historique.
 * Buteur / passeur sont des heuristiques : jamais multipliés dans la probabilité combinée.
 */
const STATISTICAL_MARKETS = new Set<CouponPick["market"]>(["result", "goals", "corners", "handicap"]);

const STRIKER_PATTERN = /\b(forward|striker|attacker|avant-centre|avant|attaquant|buteur|fw|cf|st|forward-center|centre-forward)\b/;
const DEFENSIVE_POSITION_PATTERN = /\b(defender|defense|defence|defenseur|defensive|centre back|center back|full back|fullback|left back|right back|wing back|sweeper|holding midfielder|goalkeeper|keeper|gardien|lateral|arriere|stoppeur)\b|\b(cb|lb|rb|lwb|rwb|dm|cdm|dmc|gk)\b/;
/** Passeurs : milieux et ailiers uniquement. */
const PLAYMAKER_PATTERN = /(midfield|winger|milieu|ailier|offensif)/;

/** Événements à ne pas compter comme but / passe décisive. */
const EXCLUDED_EVENT_PATTERN = /\b(own|csc|missed|miss|rate|manque|cancelled|annule|var)\b|contre son camp/;
const GOAL_EVENT_PATTERN = /goal|\bbut\b/;
const ASSIST_EVENT_PATTERN = /assist|passe dec/;

const RISK_METADATA: Record<RiskLevel, { title: string; description: string }> = {
  "very-safe": {
    title: "Combinaison très prudente",
    description: "Double chance, buts, corners, handicap et buteurs, estimation basée sur l’historique disponible.",
  },
  safe: {
    title: "Combinaison prudente",
    description: "Double chance, buts, corners, handicap et buteurs, selon l'historique disponible.",
  },
  medium: {
    title: "Combinaison moyenne",
    description: "Résultat, buts, corners, handicap et buteurs selon l'historique disponible.",
  },
  bold: {
    title: "Combinaison audacieuse",
    description: "Vainqueur, buts, corners, handicap et buteurs selon l'historique disponible.",
  },
  "very-risky": {
    title: "Combinaison à risque très élevé",
    description: "Vainqueur, buts, corners, handicap et buteurs selon l'historique disponible.",
  },
};

/* -------------------------------------------------------------------------- */
/*  Utilitaires génériques                                                    */
/* -------------------------------------------------------------------------- */

/** Pool de workers : ordre des résultats conservé, pas d'attente du plus lent d'un lot. */
async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  callback: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await callback(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Limiteur de concurrence : le créneau libéré est transmis directement au suivant. */
function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>(resolve => queue.push(resolve));
    } else {
      active++;
    }
    try {
      return await task();
    } finally {
      const nextInQueue = queue.shift();
      if (nextInQueue) nextInQueue();
      else active--;
    }
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} : délai de ${ms} ms dépassé.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Exécute une analyse isolée : une erreur sur un match ne doit pas faire échouer tout le coupon. */
async function tryOrNull<T>(label: string, task: () => Promise<T | null>): Promise<T | null> {
  try {
    return await task();
  } catch (error) {
    console.error(`${label} : analyse impossible.`, error);
    return null;
  }
}

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/**
 * Prend `count` éléments d'une liste DÉJÀ classée.
 * Mode aléatoire : tirage uniquement parmi les meilleurs candidats.
 */
function pickFromRanked<T>(ranked: T[], count: number, random: boolean): T[] {
  if (!random) return ranked.slice(0, count);
  const poolSize = Math.min(ranked.length, Math.max(count * RANDOM_POOL_FACTOR, count + RANDOM_POOL_MARGIN));
  return shuffled(ranked.slice(0, poolSize)).slice(0, count);
}

function percent(hits: number, total: number): number {
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}

/** Produit de taux en % (hypothèse d'indépendance), arrondi à 2 décimales. */
export function combineRates(rates: number[]): number {
  if (rates.length === 0) return 0;
  return Number(rates.reduce((acc, rate) => (acc * rate) / 100, 100).toFixed(2));
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} doit être un entier supérieur ou égal à 1.`);
  }
}

function assertRiskLevel(value: unknown): asserts value is RiskLevel {
  if (!isRiskLevel(value)) throw new Error(`Niveau de risque invalide : ${String(value)}.`);
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && (RISK_LEVELS as readonly string[]).includes(value);
}

/** Écarte les doublons et les rencontres exclues, puis plafonne le volume analysé. */
function selectPool(fixtures: Fixture[], excludeIds: string[] = []): Fixture[] {
  if (!Array.isArray(fixtures)) throw new Error("La liste de rencontres est invalide.");
  const excluded = new Set(excludeIds);
  const seen = new Set<string>();
  const pool: Fixture[] = [];
  for (const fixture of fixtures) {
    if (!fixture || excluded.has(fixture.id) || seen.has(fixture.id)) continue;
    seen.add(fixture.id);
    pool.push(fixture);
    if (pool.length >= MAX_FIXTURES_ANALYZED) break;
  }
  return pool;
}

function isStriker(position: string | null | undefined): boolean {
  return STRIKER_PATTERN.test(normalize(position));
}

function isDefensivePlayer(position: string | null | undefined): boolean {
  const normalizedPosition = normalize(position);
  return normalizedPosition === "d" || DEFENSIVE_POSITION_PATTERN.test(normalizedPosition);
}

function ratingOf(player: { rating?: string | null }): number {
  return Number.parseFloat(player.rating ?? "") || 0;
}

const asSelection = (value: string) => value as CouponSelection;

/** Noms du classement des buteurs appartenant à l'équipe donnée. */
function topScorerNamesFor(details: FotMobDetails, teamName: string): Set<string> {
  const team = normalize(teamName);
  const names = new Set<string>();
  for (const scorer of details.topScorers ?? []) {
    const scorerTeam = (scorer as { team?: string | null }).team;
    if (scorerTeam && normalize(scorerTeam) !== team) continue;
    names.add(normalize(scorer.name));
  }
  return names;
}

/* -------------------------------------------------------------------------- */
/*  Chargement des données (cache, limite de débit, timeout, retry)           */
/* -------------------------------------------------------------------------- */

type DetailsLoader = (id: string) => Promise<FotMobDetails | null>;

/** Durée de vie du cache partagé : une régénération rapprochée n'appelle plus FotMob. */
const DETAILS_TTL_MS = 5 * 60_000;
const DETAILS_CACHE_MAX_ENTRIES = 300;

const detailsCache = new Map<string, { expires: number; promise: Promise<FotMobDetails | null> }>();
/** Limiteur global : plafonne les requêtes simultanées même si plusieurs générations tournent en parallèle. */
const requestLimiter = createLimiter(MAX_CONCURRENT_REQUESTS);

function pruneDetailsCache(now: number): void {
  for (const [key, entry] of detailsCache) {
    if (entry.expires <= now) detailsCache.delete(key);
  }
  while (detailsCache.size > DETAILS_CACHE_MAX_ENTRIES) {
    const oldest = detailsCache.keys().next().value;
    if (oldest === undefined) break;
    detailsCache.delete(oldest);
  }
}

async function fetchDetailsWithRetry(id: string): Promise<FotMobDetails | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const details = await requestLimiter(() =>
        withTimeout(loadFotMobDetails(id), REQUEST_TIMEOUT_MS, `Match ${id}`)
      );
      return details ?? null;
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`Impossible de charger le match ${id}.`, lastError);
  return null;
}

/**
 * Chargeur mémoïsé : cache partagé avec TTL (un match n'est téléchargé qu'une fois
 * toutes les 5 min), requêtes identiques fusionnées, timeout + retry, concurrence bornée.
 * Un échec renvoie null et n'est jamais conservé en cache.
 */
function createDetailsLoader(): DetailsLoader {
  return id => {
    const now = Date.now();
    const hit = detailsCache.get(id);
    if (hit && hit.expires > now) return hit.promise;

    const promise: Promise<FotMobDetails | null> = fetchDetailsWithRetry(id).then(details => {
      if (details === null && detailsCache.get(id)?.promise === promise) detailsCache.delete(id);
      return details;
    });
    detailsCache.set(id, { expires: now + DETAILS_TTL_MS, promise });
    pruneDetailsCache(now);
    return promise;
  };
}

async function loadHistoryDetails(
  details: FotMobDetails,
  load: DetailsLoader,
  currentId?: string
): Promise<FotMobDetails[]> {
  const ids = [...new Set((details.historyMatchIds ?? []).map(String))]
    .filter(id => id && id !== currentId)
    .slice(0, HISTORY_MATCHES_TO_LOAD);
  const loaded = await Promise.all(ids.map(load));
  return loaded.filter((item): item is FotMobDetails => item !== null);
}

/* -------------------------------------------------------------------------- */
/*  Historique                                                                */
/* -------------------------------------------------------------------------- */

function uniqueHistory(details: FotMobDetails): HistoricalMatch[] {
  const all = [
    ...(details.history?.confrontations ?? []),
    ...(details.history?.recentMatches ?? []).flatMap(team => team.matches ?? []),
  ];
  const seen = new Set<string>();
  const result: HistoricalMatch[] = [];
  for (const match of all) {
    if (!match || match.homeScore == null || match.awayScore == null) continue;
    const key = `${match.date}|${normalize(match.homeTeam)}|${normalize(match.awayTeam)}|${match.homeScore}-${match.awayScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

/** Score de la rencontre, ou null si inexploitable. */
function scoreOf(match: HistoricalMatch): { home: number; away: number } | null {
  if (match.homeScore == null || match.awayScore == null) return null;
  return { home: match.homeScore, away: match.awayScore };
}

/** Écart de buts du point de vue de `teamKey` (positif = victoire), ou null si absent du match. */
function marginFor(match: HistoricalMatch, teamKey: string): number | null {
  const score = scoreOf(match);
  if (!score) return null;
  if (normalize(match.homeTeam) === teamKey) return score.home - score.away;
  if (normalize(match.awayTeam) === teamKey) return score.away - score.home;
  return null;
}

/** Buts marqués par `teamKey` dans ce match, ou null si l'équipe n'y a pas joué. */
function goalsScoredBy(match: HistoricalMatch, teamKey: string): number | null {
  const score = scoreOf(match);
  if (!score) return null;
  if (normalize(match.homeTeam) === teamKey) return score.home;
  if (normalize(match.awayTeam) === teamKey) return score.away;
  return null;
}

function outcomeForFixture(match: HistoricalMatch, fixture: Fixture): "home" | "draw" | "away" | null {
  const homeMargin = marginFor(match, normalize(fixture.homeTeam));
  if (homeMargin !== null) return homeMargin === 0 ? "draw" : homeMargin > 0 ? "home" : "away";
  const awayMargin = marginFor(match, normalize(fixture.awayTeam));
  if (awayMargin !== null) return awayMargin === 0 ? "draw" : awayMargin > 0 ? "away" : "home";
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Statistiques de match                                                     */
/* -------------------------------------------------------------------------- */

type RawStat = { home?: unknown; away?: unknown };
const statsIndexCache = new WeakMap<FotMobDetails, Map<string, RawStat>>();

/** Index des statistiques par libellé normalisé (construit une seule fois par match). */
function statsIndex(details: FotMobDetails): Map<string, RawStat> {
  let index = statsIndexCache.get(details);
  if (index) return index;
  index = new Map();
  const stats = details.stats as unknown;
  if (stats instanceof Map) {
    for (const [key, value] of stats as Map<string, RawStat>) {
      if (typeof key === "string") index.set(normalize(key), value);
    }
  }
  statsIndexCache.set(details, index);
  return index;
}

/** Convertit « 5 », « 5.0 », « 5,0 » ou « 5 (3) » en nombre ; null si absent ou illisible. */
function parseStatNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function statTotal(details: FotMobDetails, label: string): number | null {
  const stat = statsIndex(details).get(normalize(label));
  if (!stat) return null;
  const home = parseStatNumber(stat.home);
  const away = parseStatNumber(stat.away);
  return home === null || away === null ? null : home + away;
}

function firstStatTotal(details: FotMobDetails, labels: string[]): number | null {
  for (const label of labels) {
    const total = statTotal(details, label);
    if (total !== null) return total;
  }
  return null;
}

export function statisticTotal(details: FotMobDetails, market: StatisticMarket): number | null {
  switch (market) {
    case "shots":
      return firstStatTotal(details, ["total shots", "shots", "tirs totaux", "tirs"]);
    case "shots-on-target":
      // Ne jamais retomber sur les tirs totaux : deux marchés distincts.
      return firstStatTotal(details, ["shots on target", "tirs cadres"]);
    case "corners":
      return firstStatTotal(details, ["corners", "corner kicks"]);
    case "cards": {
      const yellow = firstStatTotal(details, ["yellow cards", "cartons jaunes"]);
      const red = firstStatTotal(details, ["red cards", "cartons rouges"]) ?? 0;
      return yellow === null ? null : yellow + red;
    }
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Construction des picks                                                    */
/* -------------------------------------------------------------------------- */

function emptyPick(market: CouponPick["market"], team?: "home" | "away"): CouponPick {
  return { market, selection: null, historicalRate: null, sampleSize: 0, ...(team ? { team } : {}) } as CouponPick;
}

function buildResultPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  const results = history
    .map(match => outcomeForFixture(match, fixture))
    .filter((result): result is "home" | "draw" | "away" => result !== null);
  if (results.length < MIN_STAT_SAMPLES) return emptyPick("result");

  const order = ["home", "draw", "away"] as const;
  const counts = {
    home: results.filter(result => result === "home").length,
    draw: results.filter(result => result === "draw").length,
    away: results.filter(result => result === "away").length,
  };

  let selection: NonNullable<CouponPick["selection"]>;
  let hits: number;
  if (level === "sure") {
    // Double chance : on exclut l'issue la moins fréquente.
    const excluded = [...order].sort((first, second) => counts[first] - counts[second])[0];
    const selections = { home: "away-or-draw", draw: "either-win", away: "home-or-draw" } as const;
    selection = selections[excluded];
    hits = results.length - counts[excluded];
  } else {
    const preferred = level === "risky" ? (["home", "away"] as const) : order;
    const selected = [...preferred].sort((first, second) => counts[second] - counts[first])[0];
    selection = selected;
    hits = counts[selected];
  }
  return { market: "result", selection, historicalRate: percent(hits, results.length), sampleSize: results.length };
}

type GoalCandidate = { selection: string; rate: number; sample: number };

/** Retient le candidat dont le taux est le plus proche du niveau visé. */
function bestCandidate(candidates: GoalCandidate[], level: CouponLevel): GoalCandidate | null {
  if (candidates.length === 0) return null;
  const target = LEVEL_TARGET_RATES[level];
  return [...candidates].sort(
    (first, second) =>
      Math.abs(first.rate - target) - Math.abs(second.rate - target) ||
      second.sample - first.sample ||
      second.rate - first.rate
  )[0];
}

/** Buts de la rencontre (total des deux équipes) : plus / moins de 0,5 à 3,5. */
function buildGoalsPick(history: HistoricalMatch[], level: CouponLevel): CouponPick {
  const totals = history
    .map(scoreOf)
    .filter((score): score is { home: number; away: number } => score !== null)
    .map(score => score.home + score.away);
  if (totals.length < MIN_STAT_SAMPLES) return emptyPick("goals");

  const candidates: GoalCandidate[] = [];
  for (const line of [0.5, 1.5, 2.5, 3.5]) {
    for (const direction of ["over", "under"] as const) {
      const hits = totals.filter(total => (direction === "over" ? total > line : total < line)).length;
      candidates.push({ selection: `${direction}-${line}`, rate: percent(hits, totals.length), sample: totals.length });
    }
  }
  const best = bestCandidate(candidates, level);
  if (!best) return emptyPick("goals");
  return { market: "goals", selection: asSelection(best.selection), historicalRate: best.rate, sampleSize: best.sample };
}

/**
 * Buts d'UNE équipe (domicile ou extérieur) : plus / moins de 0,5, 1,5, 2,5
 * et fourchettes « entre 0 et 1 » / « entre 1 et 3 ». Calculé sur les buts marqués
 * par l'équipe de la rencontre, quel que soit son côté dans les matchs passés.
 * Sélections : `home-over-1.5`, `away-under-0.5`, `home-1-3`, etc.
 */
function buildTeamGoalsPick(
  history: HistoricalMatch[],
  fixture: Fixture,
  side: "home" | "away",
  level: CouponLevel
): CouponPick {
  const key = normalize(side === "home" ? fixture.homeTeam : fixture.awayTeam);
  const goals = history
    .map(match => goalsScoredBy(match, key))
    .filter((value): value is number => value !== null);
  if (goals.length < MIN_STAT_SAMPLES) return emptyPick("goals", side);

  const candidates: GoalCandidate[] = [];
  for (const line of [0.5, 1.5, 2.5]) {
    for (const direction of ["over", "under"] as const) {
      const hits = goals.filter(value => (direction === "over" ? value > line : value < line)).length;
      candidates.push({ selection: `${side}-${direction}-${line}`, rate: percent(hits, goals.length), sample: goals.length });
    }
  }
  for (const [from, to] of [[0, 1], [1, 3]] as const) {
    const hits = goals.filter(value => value >= from && value <= to).length;
    candidates.push({ selection: `${side}-${from}-${to}`, rate: percent(hits, goals.length), sample: goals.length });
  }

  const best = bestCandidate(candidates, level);
  if (!best) return emptyPick("goals", side);
  return {
    market: "goals",
    selection: asSelection(best.selection),
    historicalRate: best.rate,
    sampleSize: best.sample,
    team: side,
  } as CouponPick;
}

/** Corners : basé sur les derniers matchs réellement joués (et non sur le match à venir). */
function buildCornersPick(historyDetails: FotMobDetails[], level: CouponLevel): CouponPick {
  const samples = historyDetails
    .map(match => statisticTotal(match, "corners"))
    .filter((value): value is number => value !== null);
  if (samples.length < MIN_STAT_SAMPLES) return emptyPick("corners");

  const lines = { sure: 5.5, medium: 8.5, risky: 10.5 } as const;
  const selections = { sure: "over-5.5", medium: "over-8.5", risky: "over-10.5" } as const;
  const hits = samples.filter(total => total > lines[level]).length;
  return {
    market: "corners",
    selection: selections[level],
    historicalRate: percent(hits, samples.length),
    sampleSize: samples.length,
  };
}

/**
 * Handicap : fréquence historique réelle côté par côté et ligne par ligne,
 * puis retenue du handicap le plus proche du taux visé (au-dessus d'un plancher).
 */
function buildHandicapPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  const target = LEVEL_TARGET_RATES[level];
  const candidates: Array<{ selection: string; rate: number; sample: number }> = [];

  for (const [side, teamName] of [["home", fixture.homeTeam], ["away", fixture.awayTeam]] as const) {
    const key = normalize(teamName);
    const margins = history.map(match => marginFor(match, key)).filter((value): value is number => value !== null);
    if (margins.length < MIN_STAT_SAMPLES) continue;
    for (const line of [1.5, 2.5] as const) {
      // Ligne négative : victoire avec au moins `line` buts d'écart (écart entier ≥ line + 0,5).
      const negativeHits = margins.filter(margin => margin >= line + 0.5).length;
      candidates.push({ selection: `${side}-${line}`, rate: percent(negativeHits, margins.length), sample: margins.length });
      // Ligne positive : l'équipe perd de moins de `line` buts, ou ne perd pas.
      const positiveHits = margins.filter(margin => margin + line > 0).length;
      candidates.push({ selection: `${side}+${line}`, rate: percent(positiveHits, margins.length), sample: margins.length });
    }
  }

  const eligible = candidates.filter(candidate => candidate.rate >= HANDICAP_MIN_RATES[level]);
  if (eligible.length === 0) return emptyPick("handicap");

  const best = [...eligible].sort(
    (first, second) => Math.abs(first.rate - target) - Math.abs(second.rate - target) || second.sample - first.sample
  )[0];
  return { market: "handicap", selection: asSelection(best.selection), historicalRate: best.rate, sampleSize: best.sample };
}

interface RecentPlayers {
  scorers: Set<string>;
  assisters: Set<string>;
}

function extractRecentPlayers(historyDetails: FotMobDetails[]): RecentPlayers {
  const scorers = new Set<string>();
  const assisters = new Set<string>();
  for (const details of historyDetails) {
    for (const event of details.events ?? []) {
      const type = normalize(event.type);
      const player = normalize(event.player);
      if (!player || EXCLUDED_EVENT_PATTERN.test(type)) continue;
      if (GOAL_EVENT_PATTERN.test(type)) scorers.add(player);
      if (ASSIST_EVENT_PATTERN.test(type)) assisters.add(player);
    }
  }
  return { scorers, assisters };
}

/**
 * Buteur / passeur : HEURISTIQUE (nombre de candidats + forme récente).
 * `historicalRate` reste null : ce n'est pas une probabilité.
 * Niveau « sûr » : au moins un candidat doit avoir marqué/passé récemment ou figurer au classement.
 */
function buildPlayerPick(
  kind: "scorer" | "assist",
  details: FotMobDetails,
  level: CouponLevel,
  recentNames: Set<string>,
  team: "home" | "away",
  priorityNames: Set<string> = new Set()
): CouponPick {
  const lineup = (team === "home" ? details.homeLineup : details.awayLineup) ?? [];
  const candidates = lineup
    .filter(player =>
      kind === "scorer" ? isStriker(player.position) : PLAYMAKER_PATTERN.test(normalize(player.position))
    )
    .sort((first, second) => ratingOf(second) - ratingOf(first));

  if (candidates.length === 0) return emptyPick(kind, team);

  const minimumCandidates: Record<CouponLevel, number> = { sure: 2, medium: 3, risky: 4 };
  const insufficient = candidates.length < minimumCandidates[level];
  const hasSignal = candidates.some(player => {
    const name = normalize(player.name);
    return recentNames.has(name) || priorityNames.has(name);
  });
  if (insufficient || (level === "sure" && !hasSignal)) {
    return { ...emptyPick(kind, team), sampleSize: candidates.length };
  }

  return {
    market: kind,
    selection: asSelection(`${team}-${kind}`),
    historicalRate: null,
    sampleSize: candidates.length,
    team,
  } as CouponPick;
}

/** Données d'une rencontre, calculées une seule fois et réutilisées pour tous les niveaux de risque. */
interface FixtureContext {
  fixture: Fixture;
  details: FotMobDetails;
  history: HistoricalMatch[];
  historyDetails: FotMobDetails[];
  recent: RecentPlayers;
  homeTop: Set<string>;
  awayTop: Set<string>;
}

async function buildContext(fixture: Fixture, details: FotMobDetails, load: DetailsLoader): Promise<FixtureContext> {
  const historyDetails = await loadHistoryDetails(details, load, fixture.id);
  return {
    fixture,
    details,
    history: uniqueHistory(details),
    historyDetails,
    recent: extractRecentPlayers(historyDetails),
    homeTop: topScorerNamesFor(details, fixture.homeTeam),
    awayTop: topScorerNamesFor(details, fixture.awayTeam),
  };
}

/** Calcul synchrone et sans réseau : aucun I/O une fois le contexte construit. */
function predictFromContext(context: FixtureContext, riskLevel: RiskLevel): CouponFixturePrediction {
  const { fixture, details, history, historyDetails, recent, homeTop, awayTop } = context;
  const resultLevel = LEVEL_BY_RISK[riskLevel];
  const goalsLevel = GOAL_LEVEL_BY_RISK[riskLevel];

  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    picks: [
      buildResultPick(history, fixture, resultLevel),
      buildGoalsPick(history, goalsLevel),
      buildTeamGoalsPick(history, fixture, "home", goalsLevel),
      buildTeamGoalsPick(history, fixture, "away", goalsLevel),
      buildCornersPick(historyDetails, resultLevel),
      buildHandicapPick(history, fixture, resultLevel),
      buildPlayerPick("scorer", details, resultLevel, recent.scorers, "home", homeTop),
      buildPlayerPick("scorer", details, resultLevel, recent.scorers, "away", awayTop),
      buildPlayerPick("assist", details, resultLevel, recent.assisters, "home"),
      buildPlayerPick("assist", details, resultLevel, recent.assisters, "away"),
    ],
  };
}

async function buildPrediction(
  fixture: Fixture,
  details: FotMobDetails,
  riskLevel: RiskLevel,
  load: DetailsLoader
): Promise<CouponFixturePrediction> {
  return predictFromContext(await buildContext(fixture, details, load), riskLevel);
}

/* -------------------------------------------------------------------------- */
/*  Cohérence entre picks d'un même match                                     */
/* -------------------------------------------------------------------------- */

const WIN_COMPATIBLE_RESULTS: Record<"home" | "away", ReadonlySet<string>> = {
  home: new Set(["home", "home-or-draw", "either-win"]),
  away: new Set(["away", "away-or-draw", "either-win"]),
};
const RESULT_SELECTIONS = new Set(["home", "draw", "away", "home-or-draw", "away-or-draw", "either-win"]);

type Side = "home" | "away";
const NUM = "(\\d+(?:\\.\\d+)?)";

function sideOf(pick: CouponPick): Side | null {
  const team = (pick as { team?: string }).team;
  return team === "home" || team === "away" ? team : null;
}

/** Buts minimum que doit marquer `side` pour que le pick soit possible. */
function minTeamGoals(pick: CouponPick, side: Side): number {
  const selection = String(pick.selection);
  if ((pick.market === "scorer" || pick.market === "assist") && sideOf(pick) === side) return 1;
  if (pick.market === "result") return selection === side ? 1 : 0;
  if (pick.market === "handicap") {
    const negative = selection.match(new RegExp(`^(home|away)-${NUM}$`));
    if (negative && negative[1] === side) return Math.ceil(Number(negative[2]));
  }
  if (pick.market === "goals") {
    const over = selection.match(new RegExp(`^(home|away)-over-${NUM}$`));
    if (over && over[1] === side) return Math.ceil(Number(over[2]));
    const range = selection.match(/^(home|away)-(\d+)-(\d+)$/);
    if (range && range[1] === side) return Number(range[2]);
  }
  return 0;
}

/** Buts maximum que peut marquer `side` pour que le pick soit possible. */
function maxTeamGoals(pick: CouponPick, side: Side): number {
  if (pick.market !== "goals") return Number.POSITIVE_INFINITY;
  const selection = String(pick.selection);
  const under = selection.match(new RegExp(`^(home|away)-under-${NUM}$`));
  if (under && under[1] === side) return Math.ceil(Number(under[2])) - 1;
  const range = selection.match(/^(home|away)-(\d+)-(\d+)$/);
  if (range && range[1] === side) return Number(range[3]);
  return Number.POSITIVE_INFINITY;
}

function minTotalGoals(pick: CouponPick): number {
  if (pick.market !== "goals") return 0;
  const over = String(pick.selection).match(new RegExp(`^over-${NUM}$`));
  return over ? Math.ceil(Number(over[1])) : 0;
}

function maxTotalGoals(pick: CouponPick): number {
  if (pick.market !== "goals") return Number.POSITIVE_INFINITY;
  const under = String(pick.selection).match(new RegExp(`^under-${NUM}$`));
  return under ? Math.ceil(Number(under[1])) - 1 : Number.POSITIVE_INFINITY;
}

/**
 * Empêche d'associer des sélections qui s'excluent : on agrège les bornes de buts
 * (par équipe et au total) des deux picks et on vérifie qu'un score reste possible.
 * Ex. « domicile moins de 0,5 but » + buteur domicile, ou « extérieur gagne de 2 » + « domicile gagne ».
 */
function arePicksCompatible(first: CouponPick, second: CouponPick): boolean {
  const homeMin = Math.max(minTeamGoals(first, "home"), minTeamGoals(second, "home"));
  const awayMin = Math.max(minTeamGoals(first, "away"), minTeamGoals(second, "away"));
  const homeMax = Math.min(maxTeamGoals(first, "home"), maxTeamGoals(second, "home"));
  const awayMax = Math.min(maxTeamGoals(first, "away"), maxTeamGoals(second, "away"));
  if (homeMin > homeMax || awayMin > awayMax) return false;

  const totalMin = Math.max(minTotalGoals(first), minTotalGoals(second), homeMin + awayMin);
  const totalMax = Math.min(maxTotalGoals(first), maxTotalGoals(second), homeMax + awayMax);
  if (totalMin > totalMax) return false;

  for (const [handicap, result] of [[first, second], [second, first]] as const) {
    if (handicap.market !== "handicap" || result.market !== "result") continue;
    const negative = String(handicap.selection).match(/^(home|away)-\d/);
    if (negative && RESULT_SELECTIONS.has(String(result.selection))) {
      if (!WIN_COMPATIBLE_RESULTS[negative[1] as Side].has(String(result.selection))) return false;
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Estimation et sélection                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Taux d'un match (en %), ou null s'il n'a aucun pick statistique.
 * Les picks d'un même match sont corrélés : on retient le MINIMUM (borne prudente).
 */
export function matchRate(picks: CouponPick[]): number | null {
  const rates = picks
    .filter(pick => pick.selection !== null && pick.historicalRate !== null && STATISTICAL_MARKETS.has(pick.market))
    .map(pick => pick.historicalRate as number);
  return rates.length === 0 ? null : Math.min(...rates);
}

/** Estimation indicative : minimum par match, puis produit entre matchs (indépendance supposée). */
export function estimateCombinedRate(matches: CouponFixturePrediction[]): number {
  return combineRates(matches.map(match => matchRate(match.picks)).filter((rate): rate is number => rate !== null));
}

/**
 * Choisit au plus `maxCount` picks non nuls et compatibles entre eux, en garantissant
 * le pick `required` s'il existe et au moins un pick statistique s'il en existe un.
 */
function selectPicks(
  picks: CouponPick[],
  maxCount = PICKS_PER_MATCH,
  required?: CouponPick["market"]
): CouponPick[] {
  const valid = picks.filter(pick => pick.selection !== null);
  const chosen: CouponPick[] = [];
  const tryAdd = (pick: CouponPick | undefined) => {
    if (!pick || chosen.length >= maxCount || chosen.includes(pick)) return;
    if (chosen.every(existing => arePicksCompatible(existing, pick))) chosen.push(pick);
  };

  if (required) tryAdd(valid.find(pick => pick.market === required));
  if (!chosen.some(pick => STATISTICAL_MARKETS.has(pick.market))) {
    for (const pick of shuffled(valid.filter(item => STATISTICAL_MARKETS.has(item.market)))) {
      tryAdd(pick);
      if (chosen.some(item => STATISTICAL_MARKETS.has(item.market))) break;
    }
  }
  for (const pick of shuffled(valid)) tryAdd(pick);
  return chosen;
}

/* -------------------------------------------------------------------------- */
/*  Coupons mixtes                                                            */
/* -------------------------------------------------------------------------- */

export async function generateFotMobCoupons(
  fixtures: Fixture[],
  riskLevel: RiskLevel,
  couponCount: number,
  regenerate = false
): Promise<GeneratedCoupon[]> {
  assertPositiveInteger(couponCount, "couponCount");
  assertRiskLevel(riskLevel);
  const pool = selectPool(fixtures);
  if (pool.length === 0) throw new Error("Aucune rencontre fournie.");

  const load = createDetailsLoader();
  // Détails du match + historique chargés dans le même worker : pas de phase d'attente intermédiaire.
  const contexts = (
    await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
      tryOrNull(`Rencontre ${fixture.id}`, async () => {
        const details = await load(fixture.id);
        return details ? buildContext(fixture, details, load) : null;
      })
    )
  ).filter((context): context is FixtureContext => context !== null);
  if (contexts.length === 0) throw new Error("Impossible de charger les données FotMob des rencontres sélectionnées.");

  const metadata = RISK_METADATA[riskLevel];
  const baseIndex = COUPON_LEVELS.indexOf(LEVEL_BY_RISK[riskLevel]);
  const predictionCache = new Map<RiskLevel, CouponFixturePrediction[]>();

  const predictionsFor = (couponRisk: RiskLevel): CouponFixturePrediction[] => {
    let predictions = predictionCache.get(couponRisk);
    if (!predictions) {
      predictions = contexts.flatMap(context => {
        try {
          return [predictFromContext(context, couponRisk)];
        } catch (error) {
          console.error(`Rencontre ${context.fixture.id} : calcul impossible.`, error);
          return [];
        }
      });
      predictionCache.set(couponRisk, predictions);
    }
    return predictions;
  };

  const coupons: GeneratedCoupon[] = [];
  for (let index = 0; index < couponCount; index++) {
    const level = COUPON_LEVELS[Math.min(baseIndex + (regenerate ? index : 0), COUPON_LEVELS.length - 1)];
    const couponRisk: RiskLevel = level === "sure" ? "safe" : level === "risky" ? "very-risky" : "medium";
    const predictions = predictionsFor(couponRisk);
    const matches = predictions
      .map(prediction => ({ ...prediction, picks: selectPicks(prediction.picks) }))
      .filter(match => match.picks.length > 0);
    if (matches.length === 0) continue;
    coupons.push({
      level,
      title: level === "sure" ? "Coupon sûr" : level === "risky" ? "Coupon risqué" : "Coupon moyen",
      description: metadata.description,
      matches,
      estimatedCombinedRate: estimateCombinedRate(matches),
    });
  }
  if (coupons.length === 0) throw new Error("Historique insuffisant pour générer un coupon.");
  return coupons;
}

/* -------------------------------------------------------------------------- */
/*  Coupons statistiques                                                      */
/* -------------------------------------------------------------------------- */

function chooseStatisticPick(samples: number[], riskLevel: RiskLevel, market: StatisticMarket) {
  if (samples.length < MIN_STAT_SAMPLES) return null;
  const target = TARGET_RATES[riskLevel];
  const maxSample = samples.reduce((max, value) => Math.max(max, value), 0);
  const range = LINE_RANGES[market] ?? { min: 0.5, max: maxSample + 0.5 };

  const candidates: Array<{ selection: "over" | "under"; line: number; rate: number }> = [];
  // Lignes en .5 uniquement (pas de remboursement), bornées à la plage du marché.
  for (let step = 1; step * 0.5 <= range.max; step++) {
    const line = step * 0.5;
    if (line < range.min || line % 1 !== 0.5) continue;
    for (const selection of ["over", "under"] as const) {
      const hits = samples.filter(sample => (selection === "over" ? sample > line : sample < line)).length;
      candidates.push({ selection, line, rate: percent(hits, samples.length) });
    }
  }
  if (candidates.length === 0) return null;

  // On préfère les lignes proches du taux cible ; repli sur toutes si aucune ne convient.
  const near = candidates.filter(candidate => Math.abs(candidate.rate - target) <= STAT_RATE_TOLERANCE);
  const pool = near.length > 0 ? near : candidates;
  pool.sort(
    (first, second) =>
      Math.abs(first.rate - target) - Math.abs(second.rate - target) ||
      second.rate - first.rate ||
      first.line - second.line
  );
  return { ...pool[0], sampleSize: samples.length };
}

export async function generateFotMobStatisticCoupon(
  fixtures: Fixture[],
  riskLevel: RiskLevel,
  market: StatisticMarket,
  count: number,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<GeneratedStatisticCoupon> {
  assertPositiveInteger(count, "count");
  assertRiskLevel(riskLevel);
  if (!SUPPORTED_STATISTIC_MARKETS.has(market)) {
    throw new Error(`Marché statistique non supporté : ${String(market)}.`);
  }

  const load = createDetailsLoader();
  const pool = selectPool(fixtures, excludeFixtureIds);

  const evaluated = await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
    tryOrNull(`Rencontre ${fixture.id}`, async () => {
      const details = await load(fixture.id);
      if (!details) return null;
      const historyDetails = await loadHistoryDetails(details, load, fixture.id);
      const samples = historyDetails
        .map(match => statisticTotal(match, market))
        .filter((value): value is number => value !== null);
      const pick = chooseStatisticPick(samples, riskLevel, market);
      return pick ? { fixture, pick } : null;
    })
  );

  const target = TARGET_RATES[riskLevel];
  const eligible = evaluated
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (first, second) =>
        Math.abs(first.pick.rate - target) - Math.abs(second.pick.rate - target) ||
        second.pick.sampleSize - first.pick.sampleSize
    );

  if (eligible.length === 0) {
    throw new Error(`Aucune statistique historique de ${LABELS[market]} disponible pour ces rencontres.`);
  }
  if (eligible.length < count) {
    throw new Error(
      `Données insuffisantes en ${LABELS[market]} : ${eligible.length} rencontre(s) exploitable(s) pour ${count} demandée(s).`
    );
  }

  const chosen = pickFromRanked(eligible, count, randomSelection);
  const matches = chosen.map(({ fixture, pick }) => ({
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    market,
    selection: pick.selection,
    line: pick.line,
    historicalRate: pick.rate,
    sampleSize: pick.sampleSize,
  }));

  return {
    riskLevel,
    title: `Combinaison ${RISK_LABELS[riskLevel]} — ${LABELS[market]}`,
    description: `Seuils estimés à partir de ${LABELS[market]} historiques disponibles.`,
    matches,
    estimatedCombinedRate: combineRates(matches.map(match => match.historicalRate)),
  };
}

/* -------------------------------------------------------------------------- */
/*  Coupon buteurs                                                            */
/* -------------------------------------------------------------------------- */

type ScorerCandidate = { name: string; position: string; rating?: string; imageUrl?: string; team: string };
type RawPlayer = { name: string; position?: string; rating?: string; imageUrl?: string };

function toScorerSummary(player: ScorerCandidate | undefined) {
  if (!player) return null;
  return {
    name: player.name,
    ...(player.position ? { position: player.position } : {}),
    ...(player.imageUrl ? { imageUrl: player.imageUrl } : {}),
  };
}

/** Fusionne les joueurs par (équipe, nom) en complétant les champs manquants. */
function mergeCandidates(players: ScorerCandidate[]): ScorerCandidate[] {
  const merged = new Map<string, ScorerCandidate>();
  for (const player of players) {
    if (!player?.name) continue;
    const key = `${normalize(player.team)}|${normalize(player.name)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...player, position: player.position ?? "" });
      continue;
    }
    merged.set(key, {
      ...existing,
      position: existing.position || player.position || "",
      rating: existing.rating ?? player.rating,
      imageUrl: existing.imageUrl ?? player.imageUrl,
    });
  }
  return [...merged.values()];
}

async function loadRecentTeamDetails(
  details: FotMobDetails,
  teamName: string,
  load: DetailsLoader
): Promise<FotMobDetails[]> {
  const recentMatches = details.history.recentMatches.find(
    recent => normalize(recent.team) === normalize(teamName)
  )?.matches ?? [];
  const ids = recentMatches
    .filter(match => match.matchId)
    .sort((first, second) => second.date.localeCompare(first.date))
    .slice(0, SCORER_HISTORY_MATCHES_TO_LOAD)
    .flatMap(match => match.matchId ? [match.matchId] : []);
  const loaded = await Promise.all(ids.map(load));
  return loaded.filter((item): item is FotMobDetails => item !== null);
}

function scorerCandidatesFromTeamHistory(
  historyDetails: FotMobDetails[],
  teamName: string
): { players: ScorerCandidate[]; scorers: Set<string> } {
  const players: ScorerCandidate[] = [];
  const scorers = new Set<string>();
  const teamKey = normalize(teamName);
  for (const details of historyDetails) {
    const isHome = normalize(details.fixture.homeTeam) === teamKey;
    const isAway = normalize(details.fixture.awayTeam) === teamKey;
    if (!isHome && !isAway) continue;
    const side = isHome ? "home" : "away";
    const teamLineup = side === "home" ? details.homeLineup : details.awayLineup;
    const teamTopPlayers = side === "home" ? details.topPlayers.home : details.topPlayers.away;
    players.push(
      ...teamLineup.map(player => ({ ...player, team: teamName })),
      ...teamTopPlayers.map(player => ({ ...player, team: teamName }))
    );
    for (const event of details.events) {
      const type = normalize(event.type);
      const player = normalize(event.player);
      if (
        player &&
        event.side === side &&
        GOAL_EVENT_PATTERN.test(type) &&
        !EXCLUDED_EVENT_PATTERN.test(type)
      ) {
        scorers.add(player);
      }
    }
  }
  return { players: mergeCandidates(players), scorers };
}

export async function generateFotMobScorerCoupon(
  fixtures: Fixture[],
  count: number,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<GeneratedScorerCoupon> {
  assertPositiveInteger(count, "count");

  const load = createDetailsLoader();
  const pool = selectPool(fixtures, excludeFixtureIds);

  const evaluated = await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
    tryOrNull(`Rencontre ${fixture.id}`, async () => {
      const details = await load(fixture.id);
      if (!details) return null;

      const withTeam = (players: RawPlayer[] | undefined, team: string): ScorerCandidate[] =>
        (players ?? []).map(player => ({ ...player, position: player.position ?? "", team }));

      const candidates = mergeCandidates([
        ...withTeam(details.homeLineup, fixture.homeTeam),
        ...withTeam(details.awayLineup, fixture.awayTeam),
        ...withTeam(details.topPlayers?.home, fixture.homeTeam),
        ...withTeam(details.topPlayers?.away, fixture.awayTeam),
        ...(details.topScorers ?? []).map(scorer => ({
          name: scorer.name,
          position: scorer.position ?? "",
          rating: String(scorer.goals),
          ...(scorer.imageUrl ? { imageUrl: scorer.imageUrl } : {}),
          team: scorer.team,
        })),
      ]);

      const [homeHistory, awayHistory] = await Promise.all([
        loadRecentTeamDetails(details, fixture.homeTeam, load),
        loadRecentTeamDetails(details, fixture.awayTeam, load),
      ]);

      const pickScorerForTeam = (
        teamName: string,
        teamHistory: FotMobDetails[]
      ): ScorerCandidate | undefined => {
        const teamKey = normalize(teamName);
        const recentCandidates = scorerCandidatesFromTeamHistory(teamHistory, teamName);
        const currentPlayers = candidates.filter(player => normalize(player.team) === teamKey);
        const teamPlayers = mergeCandidates([...currentPlayers, ...recentCandidates.players]);
        const topNames = topScorerNamesFor(details, teamName);
        const isRecent = (player: ScorerCandidate) => recentCandidates.scorers.has(normalize(player.name));
        const isTop = (player: ScorerCandidate) => topNames.has(normalize(player.name));
        const eligiblePlayers = teamPlayers.filter(player => !isDefensivePlayer(player.position));
        const strikers = eligiblePlayers
          .filter(player => isStriker(player.position))
          .sort((first, second) => ratingOf(second) - ratingOf(first));

        // Priorité à l'attaquant ayant marqué lors des deux derniers matchs, puis
        // aux attaquants du classement ou les mieux notés.
        return (
          strikers.find(isRecent) ??
          strikers.find(isTop) ??
          strikers[0] ??
          eligiblePlayers.find(isRecent) ??
          eligiblePlayers.find(isTop)
        );
      };

      const homeScorer = pickScorerForTeam(fixture.homeTeam, homeHistory);
      const awayScorer = pickScorerForTeam(fixture.awayTeam, awayHistory);
      if (!homeScorer && !awayScorer) return null;

      return {
        fixtureId: fixture.id,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        homeScorer: toScorerSummary(homeScorer),
        awayScorer: toScorerSummary(awayScorer),
        lineupType: details.lineupType,
      };
    })
  );

  const eligible = evaluated.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  if (eligible.length === 0) {
    throw new Error(
      "Aucun attaquant exploitable n'a été trouvé pour ces rencontres (compositions, buteurs récents ou classement de la compétition indisponibles)."
    );
  }
  if (eligible.length < count) {
    throw new Error(`Seulement ${eligible.length} rencontre(s) avec un attaquant exploitable ; ${count} demandée(s).`);
  }

  return {
    title: "Combinaison buteurs — buteur à tout moment",
    description: `Un attaquant suggéré par équipe et par rencontre, à partir des compositions disponibles et des buteurs des ${SCORER_HISTORY_MATCHES_TO_LOAD} derniers matchs de chaque équipe, avec le classement des buteurs en complément. Aucune probabilité de but n’est fournie.`,
    matches: pickFromRanked(eligible, count, randomSelection),
  };
}

/* -------------------------------------------------------------------------- */
/*  Suggestions                                                               */
/* -------------------------------------------------------------------------- */

export async function suggestFotMobCoupon(
  fixtures: Fixture[],
  count: number,
  riskLevel: RiskLevel,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<{ coupon: GeneratedCoupon }> {
  assertPositiveInteger(count, "count");
  assertRiskLevel(riskLevel);

  const load = createDetailsLoader();
  const pool = selectPool(fixtures, excludeFixtureIds);

  const candidates = await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
    tryOrNull(`Rencontre ${fixture.id}`, async () => {
      const details = await load(fixture.id);
      if (!details) return null;
      const prediction = await buildPrediction(fixture, details, riskLevel, load);
      // Le pick « result » est obligatoire ; le tirage a lieu AVANT le classement
      // pour que l'estimation et le contenu concordent.
      const picks = selectPicks(prediction.picks, PICKS_PER_MATCH, "result");
      if (!picks.some(pick => pick.market === "result")) return null;
      return { prediction: { ...prediction, picks }, estimate: matchRate(picks) ?? 0 };
    })
  );

  const available = candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((first, second) => second.estimate - first.estimate);

  if (available.length < count) {
    throw new Error(
      `Historique insuffisant : ${available.length} rencontre(s) analysable(s) pour ${count} demandée(s).`
    );
  }

  const matches = pickFromRanked(available, count, randomSelection).map(candidate => candidate.prediction);
  const metadata = RISK_METADATA[riskLevel];

  return {
    coupon: {
      level: LEVEL_BY_RISK[riskLevel],
      title: metadata.title,
      description: metadata.description,
      matches,
      estimatedCombinedRate: estimateCombinedRate(matches),
    },
  };
}

export async function suggestFotMobSafeCoupon(
  fixtures: Fixture[],
  count: number,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<{ coupon: GeneratedCoupon }> {
  return suggestFotMobCoupon(fixtures, count, "very-safe", excludeFixtureIds, randomSelection);
}