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
  "very-safe": 82,
  safe: 72,
  medium: 62,
  bold: 52,
  "very-risky": 42,
};

/** Taux visé par niveau de coupon, pour choisir le marché / la ligne la plus crédible. */
const LEVEL_TARGET_RATES: Record<CouponLevel, number> = { sure: 82, medium: 62, risky: 47 };

/** Taux minimal requis pour retenir un handicap (marché trop rare en dessous). */
const HANDICAP_MIN_RATES: Record<CouponLevel, number> = { sure: 58, medium: 48, risky: 38 };

/** Écart toléré autour du taux cible pour une ligne over/under (avec repli si rien ne convient). */
const STAT_RATE_TOLERANCE = 18;

/** Plages autorisées pour les lignes de chaque marché statistique. */
const LINE_RANGES: Partial<Record<StatisticMarket, { min: number; max: number }>> = {
  corners: { min: 6, max: 18 },
  shots: { min: 22, max: 46 },
  "shots-on-target": { min: 5, max: 18 },
  cards: { min: 2.5, max: 9 },
};

/** Valeurs plausibles maximales par match : au-delà, la donnée est considérée comme corrompue. */
const STAT_PLAUSIBLE_MAX: Record<Exclude<StatisticMarket, "scorers">, number> = {
  shots: 100,
  "shots-on-target": 50,
  corners: 40,
  cards: 20,
};

/** Marchés réellement calculables par le coupon statistique. */
const SUPPORTED_STATISTIC_MARKETS = new Set<StatisticMarket>(["shots", "shots-on-target", "corners", "cards"]);

/** Lignes proposées (élargies) pour les marchés de combinaison. */
const GOAL_LINES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;
const TEAM_GOAL_LINES = [0.5, 1.5, 2.5] as const;
const CORNER_LINES = [5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5] as const;
const HANDICAP_LINES = [0.5, 1.5, 2.5] as const;
/** « Les deux équipes marquent » est encodé comme sélection du marché « goals » (btts-yes / btts-no). */
const ENABLE_BTTS = true;

const MAX_FIXTURES_ANALYZED = 20;
const FIXTURE_CONCURRENCY = 5;
const MAX_CONCURRENT_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const HISTORY_MATCHES_TO_LOAD = 7;
const SCORER_HISTORY_MATCHES_TO_LOAD = 3;
const MIN_STAT_SAMPLES = 4;
const DEFAULT_PICKS_PER_MATCH = 2;
const MAX_PICKS_PER_MATCH = 4;
const RANDOM_POOL_FACTOR = 2;
const RANDOM_POOL_MARGIN = 3;

/** Pondération : un match plus ancien pèse DECAY fois moins que le suivant. */
const RECENCY_DECAY = 0.90;
/** Lissage bayésien : ramène les petits échantillons (3/3 = 100 %) vers 50 %. */
const PRIOR_RATE = 50;
const PRIOR_STRENGTH = 3;
/** Bruit ajouté au classement des picks en mode aléatoire / régénération. */
const RANDOM_JITTER = 8;
/** Pénalité pour un 2e pick du même marché dans un match (favorise la diversité). */
const SAME_MARKET_PENALTY = 10;
/** Qualité de base des picks heuristiques (buteur / passeur), sans taux historique. */
const HEURISTIC_QUALITY = 40;
/** Scores énumérés (0..N buts par équipe) pour tester la compatibilité de deux sélections. */
const MAX_SCORE_ENUM = 8;

/**
 * Seuls ces marchés reposent sur une vraie fréquence historique.
 * Buteur / passeur sont des heuristiques : jamais multipliés dans la probabilité combinée.
 */
const STATISTICAL_MARKETS = new Set<CouponPick["market"]>(["result", "goals", "corners", "handicap"]);

const STRIKER_PATTERN = /\b(forward|striker|attacker|avant-centre|avant|attaquant|buteur|fw|cf|st|forward-center|centre-forward)\b/;
const DEFENSIVE_POSITION_PATTERN = /\b(defender|defense|defence|defenseur|defensive|centre back|center back|full back|fullback|left back|right back|wing back|sweeper|holding midfielder|goalkeeper|keeper|gardien|lateral|arriere|stoppeur)\b|\b(cb|lb|rb|lwb|rwb|dm|cdm|dmc|gk)\b/;
const PLAYMAKER_PATTERN = /(midfield|winger|milieu|ailier|offensif)/;

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

/** Options facultatives (toutes les signatures historiques restent valides). */
export interface CouponOptions {
  /** Nombre maximal de picks par match (1 à 4, défaut 2). */
  picksPerMatch?: number;
  /** Limite le nombre de matchs par coupon en gardant les plus probables. */
  matchesPerCoupon?: number;
  /** Budget global en ms : passé ce délai, plus aucune nouvelle requête n'est lancée. */
  timeBudgetMs?: number;
  /** Force le mode aléatoire (tirage parmi les meilleurs candidats). */
  randomSelection?: boolean;
}

interface ResolvedOptions {
  picksPerMatch: number;
  matchesPerCoupon?: number;
  deadline?: number;
  random: boolean;
}

function resolveOptions(options: CouponOptions = {}, random = false): ResolvedOptions {
  const picks = options.picksPerMatch ?? DEFAULT_PICKS_PER_MATCH;
  if (!Number.isInteger(picks) || picks < 1 || picks > MAX_PICKS_PER_MATCH) {
    throw new Error(`picksPerMatch doit être un entier entre 1 et ${MAX_PICKS_PER_MATCH}.`);
  }
  if (options.matchesPerCoupon !== undefined) assertPositiveInteger(options.matchesPerCoupon, "matchesPerCoupon");
  if (options.timeBudgetMs !== undefined && !(options.timeBudgetMs > 0)) {
    throw new Error("timeBudgetMs doit être un nombre strictement positif.");
  }
  return {
    picksPerMatch: picks,
    matchesPerCoupon: options.matchesPerCoupon,
    deadline: options.timeBudgetMs !== undefined ? Date.now() + options.timeBudgetMs : undefined,
    random: random || options.randomSelection === true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Utilitaires génériques                                                    */
/* -------------------------------------------------------------------------- */

type Side = "home" | "away";
type Score = { home: number; away: number };
type ScoreTest = (home: number, away: number) => boolean;
type Weighted<T> = { value: T; weight: number };

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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

/** Prend `count` éléments d'une liste DÉJÀ classée ; en mode aléatoire, tirage parmi les meilleurs. */
function pickFromRanked<T>(ranked: T[], count: number, random: boolean): T[] {
  if (!random) return ranked.slice(0, count);
  const poolSize = Math.min(ranked.length, Math.max(count * RANDOM_POOL_FACTOR, count + RANDOM_POOL_MARGIN));
  return shuffled(ranked.slice(0, poolSize)).slice(0, count);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percent(hits: number, total: number): number {
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}

/** Lissage bayésien d'un taux (%) : fiabilise les petits échantillons. */
function shrink(rate: number, sample: number): number {
  if (sample <= 0) return PRIOR_RATE;
  return (rate * sample + PRIOR_RATE * PRIOR_STRENGTH) / (sample + PRIOR_STRENGTH);
}

/** Produit de taux en % (hypothèse d'indépendance), arrondi à 2 décimales. */
export function combineRates(rates: number[]): number {
  const valid = rates.filter(rate => Number.isFinite(rate));
  if (valid.length === 0) return 0;
  return Number(valid.reduce((acc, rate) => (acc * clamp(rate, 0, 100)) / 100, 100).toFixed(2));
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

/** Écarte les entrées invalides, les doublons et les rencontres exclues, puis plafonne le volume. */
function selectPool(fixtures: Fixture[], excludeIds: string[] = []): Fixture[] {
  if (!Array.isArray(fixtures)) throw new Error("La liste de rencontres est invalide.");
  const excluded = new Set(excludeIds.map(String));
  const seen = new Set<string>();
  const pool: Fixture[] = [];
  for (const fixture of fixtures) {
    if (!fixture || fixture.id == null || !fixture.homeTeam || !fixture.awayTeam) continue;
    const id = String(fixture.id);
    if (excluded.has(id) || seen.has(id)) continue;
    seen.add(id);
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
/*  Chargement des données (cache, limite de débit, timeout, retry + backoff) */
/* -------------------------------------------------------------------------- */

type DetailsLoader = (id: string) => Promise<FotMobDetails | null>;

const DETAILS_TTL_MS = 5 * 60_000;
const DETAILS_CACHE_MAX_ENTRIES = 300;

const detailsCache = new Map<string, { expires: number; promise: Promise<FotMobDetails | null> }>();
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

async function fetchDetailsWithRetry(id: string, deadline?: number): Promise<FotMobDetails | null> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    if (deadline !== undefined && Date.now() > deadline) return null;
    try {
      const details = await requestLimiter(() =>
        withTimeout(loadFotMobDetails(id), REQUEST_TIMEOUT_MS, `Match ${id}`)
      );
      return details ?? null;
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) {
        // Backoff exponentiel avec gigue : évite de marteler FotMob en cas de limitation de débit.
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 150);
      }
    }
  }
  console.error(`Impossible de charger le match ${id}.`, lastError);
  return null;
}

/**
 * Chargeur mémoïsé : cache partagé avec TTL, requêtes identiques fusionnées,
 * timeout + retry, concurrence bornée, budget de temps facultatif.
 * Un échec renvoie null et n'est jamais conservé en cache.
 */
function createDetailsLoader(deadline?: number): DetailsLoader {
  return rawId => {
    const id = String(rawId);
    const now = Date.now();
    const hit = detailsCache.get(id);
    if (hit && hit.expires > now) return hit.promise;

    const promise: Promise<FotMobDetails | null> = fetchDetailsWithRetry(id, deadline).then(details => {
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
  const loaded = await Promise.all(ids.map(id => load(id).catch(() => null)));
  return loaded.filter((item): item is FotMobDetails => item !== null);
}

/* -------------------------------------------------------------------------- */
/*  Historique                                                                */
/* -------------------------------------------------------------------------- */

function timeOf(date: string | null | undefined): number {
  const time = Date.parse(date ?? "");
  return Number.isNaN(time) ? 0 : time;
}

/** Historique dédoublonné, du plus récent au plus ancien. */
function uniqueHistory(details: FotMobDetails): HistoricalMatch[] {
  const all = [
    ...(details.history?.confrontations ?? []),
    ...(details.history?.recentMatches ?? []).flatMap(team => team.matches ?? []),
  ];
  const seen = new Set<string>();
  const result: HistoricalMatch[] = [];
  for (const match of all) {
    if (!match || match.homeScore == null || match.awayScore == null) continue;
    if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) continue;
    const key = `${match.date}|${normalize(match.homeTeam)}|${normalize(match.awayTeam)}|${match.homeScore}-${match.awayScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result.sort((first, second) => timeOf(second.date) - timeOf(first.date));
}

function scoreOf(match: HistoricalMatch): Score | null {
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

/**
 * Score du match ramené au point de vue de la rencontre à venir (domicile / extérieur de `fixture`).
 * Dans un match où seule une des deux équipes joue, l'adversaire occupe l'autre côté.
 */
function orientedScore(match: HistoricalMatch, fixture: Fixture): Score | null {
  const score = scoreOf(match);
  if (!score) return null;
  const homeKey = normalize(fixture.homeTeam);
  const awayKey = normalize(fixture.awayTeam);
  const matchHome = normalize(match.homeTeam);
  const matchAway = normalize(match.awayTeam);
  if (matchHome === homeKey) return { home: score.home, away: score.away };
  if (matchAway === homeKey) return { home: score.away, away: score.home };
  if (matchHome === awayKey) return { home: score.away, away: score.home };
  if (matchAway === awayKey) return { home: score.home, away: score.away };
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Évaluation statistique (pondération récente + lissage)                    */
/* -------------------------------------------------------------------------- */

/** Pondère par ancienneté : l'élément d'indice 0 est le plus récent. */
function weighted<T>(values: T[]): Weighted<T>[] {
  return values.map((value, index) => ({ value, weight: RECENCY_DECAY ** index }));
}

interface Evaluation {
  hits: number;
  total: number;
  /** Fréquence brute (%), celle affichée à l'utilisateur. */
  rate: number;
  /** Taux pondéré par la récence puis lissé : sert au classement des candidats. */
  score: number;
}

function evaluate<T>(items: Weighted<T>[], test: (value: T) => boolean): Evaluation {
  let hits = 0;
  let hitWeight = 0;
  let totalWeight = 0;
  for (const { value, weight } of items) {
    totalWeight += weight;
    if (test(value)) {
      hits++;
      hitWeight += weight;
    }
  }
  const total = items.length;
  const weightedRate = totalWeight === 0 ? 0 : (hitWeight / totalWeight) * 100;
  return { hits, total, rate: percent(hits, total), score: shrink(weightedRate, total) };
}

interface Candidate {
  selection: string;
  rate: number;
  score: number;
  sample: number;
}

const toCandidate = (selection: string, evaluation: Evaluation): Candidate => ({
  selection,
  rate: evaluation.rate,
  score: evaluation.score,
  sample: evaluation.total,
});

/** Candidat dont le score lissé est le plus proche du taux visé. */
function bestCandidate(candidates: Candidate[], target: number): Candidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (first, second) =>
      Math.abs(first.score - target) - Math.abs(second.score - target) ||
      second.sample - first.sample ||
      second.rate - first.rate
  )[0];
}

/** Candidat au score lissé le plus élevé. */
function topCandidate(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((first, second) => second.score - first.score || second.sample - first.sample)[0];
}

/* -------------------------------------------------------------------------- */
/*  Statistiques de match                                                     */
/* -------------------------------------------------------------------------- */

type RawStat = { home?: unknown; away?: unknown };
const statsIndexCache = new WeakMap<FotMobDetails, Map<string, RawStat>>();

function toRawStat(value: unknown): RawStat | null {
  if (Array.isArray(value) && value.length >= 2) return { home: value[0], away: value[1] };
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("home" in record || "away" in record) return { home: record.home, away: record.away };
    if (Array.isArray(record.stats) && record.stats.length >= 2) return { home: record.stats[0], away: record.stats[1] };
  }
  return null;
}

/** Index des statistiques par libellé normalisé : accepte Map, objet simple ou tableau de lignes. */
function buildStatsIndex(stats: unknown): Map<string, RawStat> {
  const index = new Map<string, RawStat>();
  const add = (key: unknown, value: unknown) => {
    if (typeof key !== "string") return;
    const raw = toRawStat(value);
    if (raw) index.set(normalize(key), raw);
  };
  if (stats instanceof Map) {
    for (const [key, value] of stats as Map<unknown, unknown>) add(key, value);
  } else if (Array.isArray(stats)) {
    for (const item of stats) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      add(row.label ?? row.title ?? row.name ?? row.key, item);
    }
  } else if (stats && typeof stats === "object") {
    for (const [key, value] of Object.entries(stats as Record<string, unknown>)) add(key, value);
  }
  return index;
}

function statsIndex(details: FotMobDetails): Map<string, RawStat> {
  let index = statsIndexCache.get(details);
  if (!index) {
    index = buildStatsIndex(details.stats as unknown);
    statsIndexCache.set(details, index);
  }
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
  if (home === null || away === null || home < 0 || away < 0) return null;
  return home + away;
}

function firstStatTotal(details: FotMobDetails, labels: string[]): number | null {
  for (const label of labels) {
    const total = statTotal(details, label);
    if (total !== null) return total;
  }
  return null;
}

export function statisticTotal(details: FotMobDetails, market: StatisticMarket): number | null {
  let total: number | null;
  switch (market) {
    case "shots":
      total = firstStatTotal(details, ["total shots", "shots", "tirs totaux", "tirs"]);
      break;
    case "shots-on-target":
      // Ne jamais retomber sur les tirs totaux : deux marchés distincts.
      total = firstStatTotal(details, ["shots on target", "tirs cadres"]);
      break;
    case "corners":
      total = firstStatTotal(details, ["corners", "corner kicks"]);
      break;
    case "cards": {
      const yellow = firstStatTotal(details, ["yellow cards", "cartons jaunes"]);
      const red = firstStatTotal(details, ["red cards", "cartons rouges"]) ?? 0;
      total = yellow === null ? null : yellow + red;
      break;
    }
    default:
      return null;
  }
  if (total === null) return null;
  // Valeur aberrante (donnée corrompue) : écartée plutôt que de fausser la ligne.
  return total > STAT_PLAUSIBLE_MAX[market as Exclude<StatisticMarket, "scorers">] ? null : total;
}

/* -------------------------------------------------------------------------- */
/*  Sélections → prédicats sur le score (source unique de vérité)             */
/* -------------------------------------------------------------------------- */

const NUMBER = "(\\d+(?:\\.\\d+)?)";
const RE_TOTAL_LINE = new RegExp(`^(over|under)-${NUMBER}$`);
const RE_TEAM_LINE = new RegExp(`^(home|away)-(over|under)-${NUMBER}$`);
const RE_TEAM_RANGE = /^(home|away)-(\d+)-(\d+)$/;
const RE_HANDICAP = new RegExp(`^(home|away)([+-])${NUMBER}$`);

const RESULT_TESTS = new Map<string, ScoreTest>([
  ["home", (h, a) => h > a],
  ["draw", (h, a) => h === a],
  ["away", (h, a) => a > h],
  ["home-or-draw", (h, a) => h >= a],
  ["away-or-draw", (h, a) => a >= h],
  ["either-win", (h, a) => h !== a],
]);

const teamGoals = (side: Side, h: number, a: number) => (side === "home" ? h : a);

/**
 * Traduit une sélection en prédicat sur le score (domicile, extérieur).
 * Renvoie null pour les marchés sans lien avec le score (corners).
 * Utilisé à la fois pour calculer les taux, vérifier la compatibilité et estimer la probabilité jointe.
 */
function scoreTest(market: CouponPick["market"], selection: string): ScoreTest | null {
  switch (market) {
    case "result":
      return RESULT_TESTS.get(selection) ?? null;
    case "goals": {
      if (selection === "btts-yes") return (h, a) => h > 0 && a > 0;
      if (selection === "btts-no") return (h, a) => h === 0 || a === 0;
      const total = selection.match(RE_TOTAL_LINE);
      if (total) {
        const line = Number(total[2]);
        return total[1] === "over" ? (h, a) => h + a > line : (h, a) => h + a < line;
      }
      const teamLine = selection.match(RE_TEAM_LINE);
      if (teamLine) {
        const side = teamLine[1] as Side;
        const line = Number(teamLine[3]);
        return teamLine[2] === "over"
          ? (h, a) => teamGoals(side, h, a) > line
          : (h, a) => teamGoals(side, h, a) < line;
      }
      const range = selection.match(RE_TEAM_RANGE);
      if (range) {
        const side = range[1] as Side;
        const from = Number(range[2]);
        const to = Number(range[3]);
        return (h, a) => teamGoals(side, h, a) >= from && teamGoals(side, h, a) <= to;
      }
      return null;
    }
    case "handicap": {
      const parsed = selection.match(RE_HANDICAP);
      if (!parsed) return null;
      const side = parsed[1] as Side;
      const line = (parsed[2] === "-" ? -1 : 1) * Number(parsed[3]);
      return (h, a) => (side === "home" ? h - a : a - h) + line > 0;
    }
    case "scorer":
    case "assist": {
      if (selection.startsWith("home")) return h => h >= 1;
      if (selection.startsWith("away")) return (_h, a) => a >= 1;
      return null;
    }
    default:
      return null;
  }
}

function testOf(pick: CouponPick): ScoreTest | null {
  return pick.selection === null ? null : scoreTest(pick.market, String(pick.selection));
}

/** Équipe `side` ayant marqué `goals` buts, représentée comme un score (l'autre côté à 0). */
const sideScore = (side: Side, goals: number): Score => (side === "home" ? { home: goals, away: 0 } : { home: 0, away: goals });

/** Écart `margin` du point de vue de `side`, représenté comme un score équivalent. */
const sideMargin = (side: Side, margin: number): Score => {
  const win = Math.max(margin, 0);
  const loss = Math.max(-margin, 0);
  return side === "home" ? { home: win, away: loss } : { home: loss, away: win };
};

function candidatesFor(market: CouponPick["market"], selections: string[], items: Weighted<Score>[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const selection of selections) {
    const test = scoreTest(market, selection);
    if (!test) continue;
    candidates.push(toCandidate(selection, evaluate(items, score => test(score.home, score.away))));
  }
  return candidates;
}

function toPick(market: CouponPick["market"], candidate: Candidate | null, team?: Side): CouponPick {
  if (!candidate) return emptyPick(market, team);
  return {
    market,
    selection: asSelection(candidate.selection),
    historicalRate: candidate.rate,
    sampleSize: candidate.sample,
    ...(team ? { team } : {}),
  } as CouponPick;
}

function emptyPick(market: CouponPick["market"], team?: Side): CouponPick {
  return { market, selection: null, historicalRate: null, sampleSize: 0, ...(team ? { team } : {}) } as CouponPick;
}

/* -------------------------------------------------------------------------- */
/*  Construction des picks                                                    */
/* -------------------------------------------------------------------------- */

const RESULT_SELECTIONS_BY_LEVEL: Record<CouponLevel, string[]> = {
  sure: ["home-or-draw", "away-or-draw", "either-win"],
  medium: ["home", "draw", "away"],
  risky: ["home", "away"],
};

function buildResultPick(samples: Weighted<Score>[], level: CouponLevel): CouponPick {
  if (samples.length < MIN_STAT_SAMPLES) return emptyPick("result");
  return toPick("result", topCandidate(candidatesFor("result", RESULT_SELECTIONS_BY_LEVEL[level], samples)));
}

/** Buts de la rencontre (total) : plus / moins de 0,5 à 4,5. */
function buildGoalsPick(samples: Weighted<Score>[], level: CouponLevel): CouponPick {
  if (samples.length < MIN_STAT_SAMPLES) return emptyPick("goals");
  const selections = GOAL_LINES.flatMap(line => [`over-${line}`, `under-${line}`]);
  return toPick("goals", bestCandidate(candidatesFor("goals", selections, samples), LEVEL_TARGET_RATES[level]));
}

/** Les deux équipes marquent (oui / non). */
function buildBttsPick(samples: Weighted<Score>[], level: CouponLevel): CouponPick {
  if (!ENABLE_BTTS || samples.length < MIN_STAT_SAMPLES) return emptyPick("goals");
  return toPick("goals", bestCandidate(candidatesFor("goals", ["btts-yes", "btts-no"], samples), LEVEL_TARGET_RATES[level]));
}

/**
 * Buts d'UNE équipe : plus / moins de 0,5, 1,5, 2,5 et fourchettes « 0-1 » / « 1-3 ».
 * Sélections : `home-over-1.5`, `away-under-0.5`, `home-1-3`, etc.
 */
function buildTeamGoalsPick(history: HistoricalMatch[], fixture: Fixture, side: Side, level: CouponLevel): CouponPick {
  const key = normalize(side === "home" ? fixture.homeTeam : fixture.awayTeam);
  const goals = history.map(match => goalsScoredBy(match, key)).filter((value): value is number => value !== null);
  if (goals.length < MIN_STAT_SAMPLES) return emptyPick("goals", side);

  const items = weighted(goals.map(value => sideScore(side, value)));
  const selections = [
    ...TEAM_GOAL_LINES.flatMap(line => [`${side}-over-${line}`, `${side}-under-${line}`]),
    `${side}-0-1`,
    `${side}-1-3`,
  ];
  return toPick("goals", bestCandidate(candidatesFor("goals", selections, items), LEVEL_TARGET_RATES[level]), side);
}

/** Corners : lignes over / under élargies, choisies selon le taux visé, sur les derniers matchs réellement joués. */
function buildCornersPick(historyDetails: FotMobDetails[], level: CouponLevel): CouponPick {
  const totals = historyDetails
    .map(match => statisticTotal(match, "corners"))
    .filter((value): value is number => value !== null);
  if (totals.length < MIN_STAT_SAMPLES) return emptyPick("corners");

  const items = weighted(totals);
  const candidates: Candidate[] = [];
  for (const line of CORNER_LINES) {
    candidates.push(toCandidate(`over-${line}`, evaluate(items, total => total > line)));
    candidates.push(toCandidate(`under-${line}`, evaluate(items, total => total < line)));
  }
  return toPick("corners", bestCandidate(candidates, LEVEL_TARGET_RATES[level]));
}

/** Handicap : fréquence historique par côté et par ligne (±0,5 / ±1,5 / ±2,5), au-dessus d'un plancher. */
function buildHandicapPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  const candidates: Candidate[] = [];
  for (const [side, teamName] of [["home", fixture.homeTeam], ["away", fixture.awayTeam]] as const) {
    const key = normalize(teamName);
    const margins = history.map(match => marginFor(match, key)).filter((value): value is number => value !== null);
    if (margins.length < MIN_STAT_SAMPLES) continue;
    const items = weighted(margins.map(margin => sideMargin(side, margin)));
    const selections = HANDICAP_LINES.flatMap(line => [`${side}-${line}`, `${side}+${line}`]);
    candidates.push(...candidatesFor("handicap", selections, items));
  }
  const eligible = candidates.filter(candidate => candidate.rate >= HANDICAP_MIN_RATES[level]);
  return toPick("handicap", bestCandidate(eligible, LEVEL_TARGET_RATES[level]));
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
 */
function buildPlayerPick(
  kind: "scorer" | "assist",
  details: FotMobDetails,
  level: CouponLevel,
  recentNames: Set<string>,
  team: Side,
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
  /** Scores ramenés au point de vue de la rencontre, du plus récent au plus ancien. */
  scoreSamples: Weighted<Score>[];
  recent: RecentPlayers;
  homeTop: Set<string>;
  awayTop: Set<string>;
}

async function buildContext(fixture: Fixture, details: FotMobDetails, load: DetailsLoader): Promise<FixtureContext> {
  const historyDetails = await loadHistoryDetails(details, load, String(fixture.id));
  const history = uniqueHistory(details);
  const scores = history.map(match => orientedScore(match, fixture)).filter((score): score is Score => score !== null);
  return {
    fixture,
    details,
    history,
    historyDetails,
    scoreSamples: weighted(scores),
    recent: extractRecentPlayers(historyDetails),
    homeTop: topScorerNamesFor(details, fixture.homeTeam),
    awayTop: topScorerNamesFor(details, fixture.awayTeam),
  };
}

const contextByPrediction = new WeakMap<CouponFixturePrediction, FixtureContext>();
const jointRateByMatch = new WeakMap<CouponFixturePrediction, number | null>();

/** Calcul synchrone et sans réseau : aucun I/O une fois le contexte construit. */
function predictFromContext(context: FixtureContext, riskLevel: RiskLevel): CouponFixturePrediction {
  const { fixture, details, history, historyDetails, scoreSamples, recent, homeTop, awayTop } = context;
  const resultLevel = LEVEL_BY_RISK[riskLevel];
  const goalsLevel = GOAL_LEVEL_BY_RISK[riskLevel];

  const prediction: CouponFixturePrediction = {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    picks: [
      buildResultPick(scoreSamples, resultLevel),
      buildGoalsPick(scoreSamples, goalsLevel),
      buildBttsPick(scoreSamples, goalsLevel),
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
  contextByPrediction.set(prediction, context);
  return prediction;
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

/**
 * Deux sélections (ou plus) sont compatibles s'il existe au moins UN score (0..N - 0..N)
 * qui les satisfait toutes. Couvre tous les marchés (résultat, buts, BTTS, handicaps,
 * buteurs) sans règles écrites à la main, y compris les handicaps positifs.
 */
function isFeasible(picks: CouponPick[]): boolean {
  const tests = picks.map(testOf).filter((test): test is ScoreTest => test !== null);
  if (tests.length < 2) return true;
  for (let home = 0; home <= MAX_SCORE_ENUM; home++) {
    for (let away = 0; away <= MAX_SCORE_ENUM; away++) {
      if (tests.every(test => test(home, away))) return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Estimation et sélection                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Probabilité jointe (en %) des picks statistiques d'un match.
 * - picks liés au score : fréquence réelle des matchs passés où TOUS les picks sont réalisés
 *   (corrélation prise en compte), bornée par le plus faible taux individuel ;
 *   sans échantillon suffisant, repli sur le produit des taux ;
 * - corners : indépendants du score, multipliés.
 * Buteur / passeur (heuristiques) n'entrent jamais dans le calcul.
 */
function jointRate(picks: CouponPick[], samples: Weighted<Score>[]): number | null {
  const stat = picks.filter(
    pick => pick.selection !== null && pick.historicalRate !== null && STATISTICAL_MARKETS.has(pick.market)
  );
  if (stat.length === 0) return null;

  const scored: Array<{ rate: number; test: ScoreTest }> = [];
  const independent: number[] = [];
  for (const pick of stat) {
    const rate = pick.historicalRate as number;
    const test = testOf(pick);
    if (test) scored.push({ rate, test });
    else independent.push(rate);
  }

  let rate = 100;
  if (scored.length === 1) {
    rate = scored[0].rate;
  } else if (scored.length > 1) {
    const rates = scored.map(item => item.rate);
    if (samples.length >= MIN_STAT_SAMPLES) {
      const hits = samples.filter(sample => scored.every(item => item.test(sample.value.home, sample.value.away))).length;
      rate = Math.min(percent(hits, samples.length), ...rates);
    } else {
      rate = combineRates(rates);
    }
  }
  for (const independentRate of independent) rate = (rate * independentRate) / 100;
  return Number(clamp(rate, 0, 100).toFixed(2));
}

/**
 * Taux d'un match (en %), ou null s'il n'a aucun pick statistique.
 * Sans échantillons fournis : produit des taux (hypothèse d'indépendance, estimation prudente).
 */
export function matchRate(picks: CouponPick[], samples: Weighted<Score>[] = []): number | null {
  return jointRate(picks, samples);
}

function rateOfMatch(match: CouponFixturePrediction): number | null {
  return jointRateByMatch.has(match) ? (jointRateByMatch.get(match) ?? null) : matchRate(match.picks);
}

/** Estimation indicative : probabilité jointe par match, puis produit entre matchs (indépendance supposée). */
export function estimateCombinedRate(matches: CouponFixturePrediction[]): number {
  return combineRates(matches.map(rateOfMatch).filter((rate): rate is number => rate !== null));
}

/** Associe des picks retenus à une prédiction et mémorise leur probabilité jointe. */
function withPicks(prediction: CouponFixturePrediction, picks: CouponPick[]): CouponFixturePrediction {
  const match = { ...prediction, picks };
  jointRateByMatch.set(match, jointRate(picks, contextByPrediction.get(prediction)?.scoreSamples ?? []));
  return match;
}

function pickQuality(pick: CouponPick): number {
  if (STATISTICAL_MARKETS.has(pick.market) && pick.historicalRate !== null) {
    return shrink(pick.historicalRate, pick.sampleSize);
  }
  return HEURISTIC_QUALITY + Math.min(pick.sampleSize, 6);
}

interface SelectOptions {
  max: number;
  required?: CouponPick["market"];
  random: boolean;
}

/**
 * Choisit au plus `max` picks non nuls et compatibles entre eux :
 * classés par qualité (taux lissé), diversifiés par marché, avec le pick `required`
 * garanti s'il existe et au moins un pick statistique s'il en existe un.
 * Mode aléatoire : bruit ajouté au classement pour varier les coupons.
 */
function selectPicks(picks: CouponPick[], { max, required, random }: SelectOptions): CouponPick[] {
  const valid = picks.filter(pick => pick.selection !== null);
  const score = new Map<CouponPick, number>(
    valid.map(pick => [pick, pickQuality(pick) + (random ? Math.random() * RANDOM_JITTER : 0)])
  );
  const chosen: CouponPick[] = [];
  const canAdd = (pick: CouponPick) =>
    chosen.length < max && !chosen.includes(pick) && isFeasible([...chosen, pick]);
  const best = (pool: CouponPick[]) =>
    pool.filter(canAdd).sort((first, second) => (score.get(second) ?? 0) - (score.get(first) ?? 0))[0];

  if (required) {
    const pick = best(valid.filter(item => item.market === required));
    if (pick) chosen.push(pick);
  }
  if (!chosen.some(pick => STATISTICAL_MARKETS.has(pick.market))) {
    const pick = best(valid.filter(item => STATISTICAL_MARKETS.has(item.market)));
    if (pick) chosen.push(pick);
  }
  while (chosen.length < max) {
    const candidates = valid.filter(canAdd);
    if (candidates.length === 0) break;
    const adjusted = (pick: CouponPick) =>
      (score.get(pick) ?? 0) - (chosen.some(existing => existing.market === pick.market) ? SAME_MARKET_PENALTY : 0);
    chosen.push(candidates.sort((first, second) => adjusted(second) - adjusted(first))[0]);
  }
  return chosen;
}

/* -------------------------------------------------------------------------- */
/*  Coupons mixtes                                                            */
/* -------------------------------------------------------------------------- */

export async function generateFotMobCoupons(
  fixtures: Fixture[],
  riskLevel: RiskLevel,
  couponCount: number,
  regenerate = false,
  options: CouponOptions = {}
): Promise<GeneratedCoupon[]> {
  assertPositiveInteger(couponCount, "couponCount");
  assertRiskLevel(riskLevel);
  const resolved = resolveOptions(options);
  const pool = selectPool(fixtures);
  if (pool.length === 0) throw new Error("Aucune rencontre fournie.");

  const load = createDetailsLoader(resolved.deadline);
  const contexts = (
    await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
      tryOrNull(`Rencontre ${fixture.id}`, async () => {
        const details = await load(String(fixture.id));
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
    // Coupons suivants / régénération : variation volontaire pour ne pas répéter le même coupon.
    const random = resolved.random || regenerate || index > 0;

    let matches = predictionsFor(couponRisk)
      .map(prediction =>
        withPicks(prediction, selectPicks(prediction.picks, { max: resolved.picksPerMatch, random }))
      )
      .filter(match => match.picks.length > 0);
    if (matches.length === 0) continue;

    if (resolved.matchesPerCoupon && matches.length > resolved.matchesPerCoupon) {
      const ranked = matches
        .map(match => ({ match, rate: rateOfMatch(match) ?? 0 }))
        .sort((first, second) => second.rate - first.rate);
      matches = pickFromRanked(ranked, resolved.matchesPerCoupon, random).map(item => item.match);
    }

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
  const items = weighted(samples);

  const candidates: Array<{ selection: "over" | "under"; line: number; rate: number; score: number }> = [];
  // Lignes en .5 uniquement (pas de remboursement), bornées à la plage du marché.
  for (let line = Math.floor(range.min) + 0.5; line <= range.max; line += 1) {
    if (line < range.min) continue;
    for (const selection of ["over", "under"] as const) {
      const evaluation = evaluate(items, sample => (selection === "over" ? sample > line : sample < line));
      candidates.push({ selection, line, rate: evaluation.rate, score: evaluation.score });
    }
  }
  if (candidates.length === 0) return null;

  const near = candidates.filter(candidate => Math.abs(candidate.score - target) <= STAT_RATE_TOLERANCE);
  const pool = near.length > 0 ? near : candidates;
  pool.sort(
    (first, second) =>
      Math.abs(first.score - target) - Math.abs(second.score - target) ||
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
  randomSelection = false,
  options: CouponOptions = {}
): Promise<GeneratedStatisticCoupon> {
  assertPositiveInteger(count, "count");
  assertRiskLevel(riskLevel);
  if (!SUPPORTED_STATISTIC_MARKETS.has(market)) {
    throw new Error(`Marché statistique non supporté : ${String(market)}.`);
  }
  const resolved = resolveOptions(options, randomSelection);

  const load = createDetailsLoader(resolved.deadline);
  const pool = selectPool(fixtures, excludeFixtureIds);

  const evaluated = await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
    tryOrNull(`Rencontre ${fixture.id}`, async () => {
      const details = await load(String(fixture.id));
      if (!details) return null;
      const historyDetails = await loadHistoryDetails(details, load, String(fixture.id));
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
        Math.abs(first.pick.score - target) - Math.abs(second.pick.score - target) ||
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

  const chosen = pickFromRanked(eligible, count, resolved.random);
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
  const recentMatches =
    details.history?.recentMatches?.find(recent => normalize(recent.team) === normalize(teamName))?.matches ?? [];
  // Copie avant tri : ne jamais muter les données partagées par le cache.
  const ids = [...recentMatches]
    .filter(match => match?.matchId)
    .sort((first, second) => timeOf(second.date) - timeOf(first.date))
    .slice(0, SCORER_HISTORY_MATCHES_TO_LOAD)
    .flatMap(match => (match.matchId ? [String(match.matchId)] : []));
  const loaded = await Promise.all(ids.map(id => load(id).catch(() => null)));
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
    const isHome = normalize(details.fixture?.homeTeam) === teamKey;
    const isAway = normalize(details.fixture?.awayTeam) === teamKey;
    if (!isHome && !isAway) continue;
    const side: Side = isHome ? "home" : "away";
    const teamLineup = (side === "home" ? details.homeLineup : details.awayLineup) ?? [];
    const teamTopPlayers = (side === "home" ? details.topPlayers?.home : details.topPlayers?.away) ?? [];
    players.push(
      ...teamLineup.map(player => ({ ...player, position: player.position ?? "", team: teamName })),
      ...teamTopPlayers.map(player => ({ ...player, position: player.position ?? "", team: teamName }))
    );
    for (const event of details.events ?? []) {
      const type = normalize(event.type);
      const player = normalize(event.player);
      if (player && event.side === side && GOAL_EVENT_PATTERN.test(type) && !EXCLUDED_EVENT_PATTERN.test(type)) {
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
  randomSelection = false,
  options: CouponOptions = {}
): Promise<GeneratedScorerCoupon> {
  assertPositiveInteger(count, "count");
  const resolved = resolveOptions(options, randomSelection);

  const load = createDetailsLoader(resolved.deadline);
  const pool = selectPool(fixtures, excludeFixtureIds);

  const evaluated = await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
    tryOrNull(`Rencontre ${fixture.id}`, async () => {
      const details = await load(String(fixture.id));
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

      /** Attaquant suggéré + force du signal (forme récente > classement > poste > note). */
      const pickScorerForTeam = (teamName: string, teamHistory: FotMobDetails[]) => {
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

        const player =
          strikers.find(isRecent) ??
          strikers.find(isTop) ??
          strikers[0] ??
          eligiblePlayers.find(isRecent) ??
          eligiblePlayers.find(isTop);
        if (!player) return undefined;
        const strength =
          (isRecent(player) ? 3 : 0) +
          (isTop(player) ? 2 : 0) +
          (isStriker(player.position) ? 1 : 0) +
          clamp(ratingOf(player) / 10, 0, 1);
        return { player, strength };
      };

      const home = pickScorerForTeam(fixture.homeTeam, homeHistory);
      const away = pickScorerForTeam(fixture.awayTeam, awayHistory);
      if (!home && !away) return null;

      return {
        // Les rencontres avec deux attaquants identifiés passent avant celles qui n'en ont qu'un.
        strength: (home?.strength ?? 0) + (away?.strength ?? 0) + (home && away ? 1 : 0),
        match: {
          fixtureId: fixture.id,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          homeScorer: toScorerSummary(home?.player),
          awayScorer: toScorerSummary(away?.player),
          lineupType: details.lineupType,
        },
      };
    })
  );

  // Classement par force du signal (et non plus par ordre d'arrivée) avant le tirage éventuel.
  const eligible = evaluated
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((first, second) => second.strength - first.strength);
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
    matches: pickFromRanked(eligible, count, resolved.random).map(candidate => candidate.match),
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
  randomSelection = false,
  options: CouponOptions = {}
): Promise<{ coupon: GeneratedCoupon }> {
  assertPositiveInteger(count, "count");
  assertRiskLevel(riskLevel);
  const resolved = resolveOptions(options, randomSelection);

  const load = createDetailsLoader(resolved.deadline);
  const pool = selectPool(fixtures, excludeFixtureIds);

  const candidates = await mapWithConcurrency(pool, FIXTURE_CONCURRENCY, fixture =>
    tryOrNull(`Rencontre ${fixture.id}`, async () => {
      const details = await load(String(fixture.id));
      if (!details) return null;
      const prediction = await buildPrediction(fixture, details, riskLevel, load);
      // Le pick « result » est obligatoire ; la sélection a lieu AVANT le classement
      // pour que l'estimation et le contenu concordent.
      const picks = selectPicks(prediction.picks, {
        max: resolved.picksPerMatch,
        required: "result",
        random: resolved.random,
      });
      if (!picks.some(pick => pick.market === "result")) return null;
      const match = withPicks(prediction, picks);
      return { prediction: match, estimate: rateOfMatch(match) ?? 0 };
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

  const matches = pickFromRanked(available, count, resolved.random).map(candidate => candidate.prediction);
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
  randomSelection = false,
  options: CouponOptions = {}
): Promise<{ coupon: GeneratedCoupon }> {
  return suggestFotMobCoupon(fixtures, count, "very-safe", excludeFixtureIds, randomSelection, options);
}  