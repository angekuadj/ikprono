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

/**
 * Plages autorisées pour les lignes (over/under) de chaque marché statistique.
 * Les marchés absents (ex. tirs cadrés) gardent une plage dynamique selon l'échantillon.
 */
const LINE_RANGES: Partial<Record<StatisticMarket, { min: number; max: number }>> = {
  corners: { min: 6, max: 18 },
  shots: { min: 22, max: 46 },
  "shots-on-target": { min: 5, max: 18 },
  cards: { min: 2.5, max: 9 },
};

/** Marchés réellement calculables par le coupon statistique. */
const SUPPORTED_STATISTIC_MARKETS = new Set<StatisticMarket>(["shots", "shots-on-target", "corners", "cards"]);

const MAX_FIXTURES_ANALYZED = 20;
const FETCH_BATCH_SIZE = 5;
/** Plus d'échantillons = des taux moins grossiers (avec 3 matchs : 0/33/67/100 % seulement). */
const HISTORY_MATCHES_TO_LOAD = 5;
/** Nombre minimal de matchs exploitables pour fonder une statistique over/under. */
const MIN_STAT_SAMPLES = 3;
const PICKS_PER_MATCH = 2;
/** En mode aléatoire, on tire parmi les meilleurs candidats (et non dans tout le lot). */
const RANDOM_POOL_FACTOR = 2;
const RANDOM_POOL_MARGIN = 3;

/**
 * Seuls ces marchés reposent sur une vraie fréquence historique.
 * Buteur / passeur sont des heuristiques : ils n'ont plus de taux et ne sont
 * jamais multipliés dans la probabilité combinée.
 */
const STATISTICAL_MARKETS = new Set<CouponPick["market"]>(["result", "goals", "corners", "handicap"]);

const STRIKER_PATTERN = /\b(forward|striker|attacker|avant-centre|attaquant|fw|cf|forward-center)\b/;
/** Passeurs : milieux et ailiers uniquement (les attaquants ne comptent plus comme passeurs). */
const PLAYMAKER_PATTERN = /(midfield|winger|milieu|ailier|offensif)/;

/* -------------------------------------------------------------------------- */
/*  Utilitaires génériques                                                    */
/* -------------------------------------------------------------------------- */

async function mapInBatches<T, R>(
  values: T[],
  batchSize: number,
  callback: (value: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    results.push(...(await Promise.all(batch.map(callback))));
  }
  return results;
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
 * Prend `count` éléments d'une liste DÉJÀ classée par pertinence.
 * Mode aléatoire : tirage au sort uniquement parmi les meilleurs candidats,
 * pour que le niveau de risque / le classement reste respecté.
 */
function pickFromRanked<T>(ranked: T[], count: number, random: boolean): T[] {
  if (!random) return ranked.slice(0, count);
  const poolSize = Math.min(ranked.length, Math.max(count * RANDOM_POOL_FACTOR, count + RANDOM_POOL_MARGIN));
  return shuffled(ranked.slice(0, poolSize)).slice(0, count);
}

function percent(hits: number, total: number): number {
  return total === 0 ? 0 : Math.round((hits / total) * 100);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} doit être un entier supérieur ou égal à 1.`);
  }
}

function isStriker(position: string | null | undefined): boolean {
  return STRIKER_PATTERN.test(normalize(position));
}

function ratingOf(player: { rating?: string | null }): number {
  return Number.parseFloat(player.rating ?? "") || 0;
}

/**
 * Noms du classement des buteurs appartenant à l'équipe donnée.
 * Si l'entrée ne précise pas d'équipe, on la garde (comportement précédent).
 */
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
/*  Chargement des données (avec cache et tolérance aux erreurs)              */
/* -------------------------------------------------------------------------- */

type DetailsLoader = (id: string) => Promise<FotMobDetails | null>;

/**
 * Crée un chargeur mémoïsé : un même match n'est jamais téléchargé deux fois
 * pendant une génération, et une erreur réseau renvoie null au lieu de tout casser.
 */
function createDetailsLoader(): DetailsLoader {
  const cache = new Map<string, Promise<FotMobDetails | null>>();
  return id => {
    let pending = cache.get(id);
    if (!pending) {
      pending = loadFotMobDetails(id).catch(error => {
        console.error(`Impossible de charger le match ${id}.`, error);
        return null;
      });
      cache.set(id, pending);
    }
    return pending;
  };
}

async function loadHistoryDetails(details: FotMobDetails, load: DetailsLoader): Promise<FotMobDetails[]> {
  const ids = [...new Set(details.historyMatchIds ?? [])].slice(0, HISTORY_MATCHES_TO_LOAD);
  const loaded = await mapInBatches(ids, HISTORY_MATCHES_TO_LOAD, load);
  return loaded.filter((item): item is FotMobDetails => item !== null);
}

/* -------------------------------------------------------------------------- */
/*  Historique                                                                */
/* -------------------------------------------------------------------------- */

function uniqueHistory(details: FotMobDetails): HistoricalMatch[] {
  const all = [
    ...(details.history?.confrontations ?? []),
    ...(details.history?.recentMatches ?? []).flatMap(team => team.matches),
  ];
  const seen = new Set<string>();
  const result: HistoricalMatch[] = [];
  for (const match of all) {
    if (match.homeScore === null || match.awayScore === null) continue;
    const key = `${match.date}|${normalize(match.homeTeam)}|${normalize(match.awayTeam)}|${match.homeScore}-${match.awayScore}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(match);
  }
  return result;
}

/**
 * Écart de buts du point de vue de `teamKey` (positif = victoire),
 * ou null si l'équipe n'a pas joué ce match.
 */
function marginFor(match: HistoricalMatch, teamKey: string): number | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  if (normalize(match.homeTeam) === teamKey) return match.homeScore - match.awayScore;
  if (normalize(match.awayTeam) === teamKey) return match.awayScore - match.homeScore;
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
/*  Construction des picks                                                    */
/* -------------------------------------------------------------------------- */

function emptyPick(market: CouponPick["market"], team?: "home" | "away"): CouponPick {
  return { market, selection: null, historicalRate: null, sampleSize: 0, ...(team ? { team } : {}) } as CouponPick;
}

function buildResultPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  const results = history
    .map(match => outcomeForFixture(match, fixture))
    .filter((result): result is "home" | "draw" | "away" => result !== null);
  if (results.length === 0) return emptyPick("result");

  const order = ["home", "draw", "away"] as const;
  const counts: Record<(typeof order)[number], number> = {
    home: results.filter(result => result === "home").length,
    draw: results.filter(result => result === "draw").length,
    away: results.filter(result => result === "away").length,
  };

  let selection: NonNullable<CouponPick["selection"]>;
  let hits: number;
  if (level === "sure") {
    // Double chance : on exclut l'issue la moins fréquente.
    const excluded = [...order].sort((first, second) => counts[first] - counts[second])[0];
    const selections = {
      home: "away-or-draw",
      draw: "either-win",
      away: "home-or-draw",
    } as const;
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

/** Taux visé par niveau de coupon, pour choisir le marché le plus crédible. */
const LEVEL_TARGET_RATES: Record<CouponLevel, number> = {
  sure: 80,
  medium: 60,
  risky: 45,
};

/**
 * Taux minimal requis pour retenir un handicap. En dessous, le marché est
 * trop rare pour être proposé même s'il est proche du cible.
 */
const HANDICAP_MIN_RATES: Record<CouponLevel, number> = {
  sure: 55,
  medium: 45,
  risky: 35,
};

/** Score de la rencontre, ou null si le match historique n'a pas de score exploitable. */
function scoreOf(match: HistoricalMatch): { home: number; away: number } | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  return { home: match.homeScore, away: match.awayScore };
}

/**
 * Buts : au lieu de toujours envoyer « plus 0,5 / 1,5 / 2,5 », on construit
 * tous les marchés plausibles (total, buts par équipe, fourchettes d'équipe)
 * et on retient celui dont le taux historique est le plus proche du niveau visé.
 */
function buildGoalsPick(history: HistoricalMatch[], level: CouponLevel): CouponPick {
  const scores = history.map(scoreOf).filter((score): score is { home: number; away: number } => score !== null);
  if (scores.length < MIN_STAT_SAMPLES) return emptyPick("goals");

  const target = LEVEL_TARGET_RATES[level];
  const candidates: Array<{ selection: CouponSelection; rate: number }> = [];
  const rate = (hits: number) => percent(hits, scores.length);

  // Total de buts de la rencontre.
  const totals = scores.map(score => score.home + score.away);
  const totalLines: Array<[number, "over" | "under"]> = [[0.5, "over"], [0.5, "under"], [1.5, "over"], [1.5, "under"], [2.5, "over"], [2.5, "under"], [3.5, "over"], [3.5, "under"]];
  for (const [line, direction] of totalLines) {
    const hits = totals.filter(total => (direction === "over" ? total > line : total < line)).length;
    candidates.push({ selection: `${direction}-${line}` as CouponSelection, rate: rate(hits) });
  }

  // Buts marqués par chaque équipe (domicile / extérieur).
  const teamGoals: Record<"home" | "away", number[]> = {
    home: scores.map(score => score.home),
    away: scores.map(score => score.away),
  };
  for (const side of ["home", "away"] as const) {
    const goals = teamGoals[side];
    for (const [line, direction] of [[1.5, "over"], [1.5, "under"]] as const) {
      const hits = goals.filter(value => (direction === "over" ? value > line : value < line)).length;
      candidates.push({ selection: `${side}-${direction}-${line}` as CouponSelection, rate: rate(hits) });
    }
    // Fourchettes de buts de l'équipe : « domicile entre 0 et 1 », « entre 1 et 3 », etc.
    for (const [from, to] of [[0, 1], [1, 3]] as const) {
      const hits = goals.filter(value => value >= from && value <= to).length;
      candidates.push({ selection: `${side}-${from}-${to}` as CouponSelection, rate: rate(hits) });
    }
  }

  const best = [...candidates].sort(
    (first, second) => Math.abs(first.rate - target) - Math.abs(second.rate - target) || second.rate - first.rate
  )[0];
  return { market: "goals", selection: best.selection, historicalRate: best.rate, sampleSize: scores.length };
}

/** Corners : basé sur les derniers matchs réellement joués (et non sur le match à venir). */
function buildCornersPick(historyDetails: FotMobDetails[], level: CouponLevel): CouponPick {
  const samples = historyDetails
    .map(match => statisticTotal(match, "corners"))
    .filter((value): value is number => value !== null);
  if (samples.length < MIN_STAT_SAMPLES) return emptyPick("corners");

  const thresholds: Record<CouponLevel, [number, "over-5.5" | "over-8.5" | "over-10.5"]> = {
    sure: [6, "over-5.5"],
    medium: [9, "over-8.5"],
    risky: [11, "over-10.5"],
  };
  const [threshold, selection] = thresholds[level];
  const hits = samples.filter(total => total >= threshold).length;
  return { market: "corners", selection, historicalRate: percent(hits, samples.length), sampleSize: samples.length };
}

/**
 * Handicap : on évalue, côté par côté et par ligne, la fréquence historique
 * réelle, puis on retient le handicap le plus proche du taux visé.
 * Couvre « domicile +1.5 », « extérieur +1.5 », mais aussi les lignes négatives.
 */
function buildHandicapPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  const target = LEVEL_TARGET_RATES[level];
  const minSample = MIN_STAT_SAMPLES;

  const marginsFor = (teamName: string) => {
    const key = normalize(teamName);
    return history
      .map(match => marginFor(match, key))
      .filter((value): value is number => value !== null);
  };

  const candidates: Array<{ selection: CouponSelection; rate: number; sample: number }> = [];
  for (const [side, teamName] of [["home", fixture.homeTeam], ["away", fixture.awayTeam]] as const) {
    const margins = marginsFor(teamName);
    if (margins.length < minSample) continue;
    for (const line of [1.5, 2.5] as const) {
      // Ligne négative : l'équipe l'emporte avec au moins `line` buts d'écart.
      const negativeHits = margins.filter(margin => margin >= line + 0.5).length;
      candidates.push({
        selection: `${side}-${line}` as CouponSelection,
        rate: percent(negativeHits, margins.length),
        sample: margins.length,
      });
      // Ligne positive : l'équipe ne perd pas (ou perd de moins de `line` buts).
      const positiveHits = margins.filter(margin => margin >= -line + 0.5).length;
      candidates.push({
        selection: `${side}+${line}` as CouponSelection,
        rate: percent(positiveHits, margins.length),
        sample: margins.length,
      });
    }
  }

  if (candidates.length === 0) return emptyPick("handicap");

  // Borne prudente : on écarte les marchés trop rares avant de chercher le plus proche du cible.
  const eligible = candidates.filter(candidate => candidate.rate >= HANDICAP_MIN_RATES[level]);
  const pool = eligible.length > 0 ? eligible : candidates;
  const best = [...pool].sort(
    (first, second) => Math.abs(first.rate - target) - Math.abs(second.rate - target) || second.sample - first.sample
  )[0];

  return {
    market: "handicap",
    selection: best.selection,
    historicalRate: best.rate,
    sampleSize: best.sample,
  };
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
      if (!player) continue;
      if (/goal|\bbut\b/.test(type)) scorers.add(player);
      if (/assist|passe dec/.test(type)) assisters.add(player);
    }
  }
  return { scorers, assisters };
}

/**
 * Buteur / passeur : HEURISTIQUE (nombre de candidats + forme récente).
 * Ce n'est PAS un taux historique : `historicalRate` reste null pour ne pas
 * être affiché ni utilisé comme une probabilité. `sampleSize` = nombre de candidats.
 */
function buildPlayerPick(
  kind: "scorer" | "assist",
  details: FotMobDetails,
  level: CouponLevel,
  recentNames: Set<string>,
  team: "home" | "away",
  extraPriorityNames: Set<string> = new Set()
): CouponPick {
  const lineup = (team === "home" ? details.homeLineup : details.awayLineup) ?? [];
  const candidates = lineup
    .filter(player => {
      const position = normalize(player.position);
      return kind === "scorer" ? isStriker(player.position) : PLAYMAKER_PATTERN.test(position);
    })
    .sort((first, second) => ratingOf(second) - ratingOf(first));

  if (candidates.length === 0) return emptyPick(kind, team);

  const minimumCandidates: Record<CouponLevel, number> = { sure: 2, medium: 3, risky: 4 };
  if (candidates.length < minimumCandidates[level]) {
    return { ...emptyPick(kind, team), sampleSize: candidates.length };
  }

  return {
    market: kind,
    selection: `${team}-${kind}` as CouponSelection,
    historicalRate: null,
    sampleSize: candidates.length,
    team,
  } as CouponPick;
}

async function buildPrediction(
  fixture: Fixture,
  details: FotMobDetails,
  riskLevel: RiskLevel,
  load: DetailsLoader
): Promise<CouponFixturePrediction> {
  const history = uniqueHistory(details);
  const historyDetails = await loadHistoryDetails(details, load);
  const recent = extractRecentPlayers(historyDetails);
  const homeTop = topScorerNamesFor(details, fixture.homeTeam);
  const awayTop = topScorerNamesFor(details, fixture.awayTeam);
  const resultLevel = LEVEL_BY_RISK[riskLevel];
  const goalsLevel = GOAL_LEVEL_BY_RISK[riskLevel];

  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    picks: [
      buildResultPick(history, fixture, resultLevel),
      buildGoalsPick(history, goalsLevel),
      buildCornersPick(historyDetails, resultLevel),
      buildHandicapPick(history, fixture, resultLevel),
      buildPlayerPick("scorer", details, resultLevel, recent.scorers, "home", homeTop),
      buildPlayerPick("scorer", details, resultLevel, recent.scorers, "away", awayTop),
      buildPlayerPick("assist", details, resultLevel, recent.assisters, "home"),
      buildPlayerPick("assist", details, resultLevel, recent.assisters, "away"),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  Métadonnées et estimation                                                 */
/* -------------------------------------------------------------------------- */

function riskMetadata(riskLevel: RiskLevel): { title: string; description: string } {
  const metadata: Record<RiskLevel, { title: string; description: string }> = {
    "very-safe": { title: "Combinaison très prudente", description: "Double chance, buts, corners, handicap et buteurs, estimation basée sur l’historique disponible." },
    safe: { title: "Combinaison prudente", description: "Double chance, buts, corners, handicap et buteurs, selon l'historique disponible." },
    medium: { title: "Combinaison moyenne", description: "Résultat, buts, corners, handicap et buteurs selon l'historique disponible." },
    bold: { title: "Combinaison audacieuse", description: "Vainqueur, buts, corners, handicap et buteurs selon l'historique disponible." },
    "very-risky": { title: "Combinaison à risque très élevé", description: "Vainqueur, buts, corners, handicap et buteurs selon l'historique disponible." },
  };
  return metadata[riskLevel];
}

/**
 * Taux statistique d'un match (en %), ou null s'il n'a aucun pick statistique.
 * null ≠ 0 : un vrai 0 % reste un 0 %, et l'absence de donnée est ignorée.
 *
 * Les sélections d'un même match (résultat, buts, corners, handicap) sont fortement
 * corrélées : multiplier leurs taux sous-estimerait leur chance commune de façon
 * irréaliste. On retient donc le MINIMUM (borne prudente) au sein d'un match.
 */
function matchRate(picks: CouponPick[]): number | null {
  const rates = picks
    .filter(pick => pick.selection !== null && pick.historicalRate !== null && STATISTICAL_MARKETS.has(pick.market))
    .map(pick => pick.historicalRate as number);
  if (rates.length === 0) return null;
  return Math.min(...rates);
}

/**
 * Estimation naïve : minimum au sein d'un match (corrélation), puis produit entre
 * matchs (hypothèse d'indépendance entre rencontres différentes).
 * À présenter comme indicatif, pas comme une probabilité réelle.
 */
function estimateCombinedRate(matches: CouponFixturePrediction[]): number {
  const rates = matches.map(match => matchRate(match.picks)).filter((rate): rate is number => rate !== null);
  if (rates.length === 0) return 0;
  return Number(rates.reduce((rate, value) => (rate * value) / 100, 100).toFixed(2));
}

/**
 * Sélectionne `maxCount` picks non nuls au hasard, en garantissant :
 *  - le pick `required` s'il est disponible (ex. "result"),
 *  - au moins un pick statistique s'il en existe un.
 */
function selectPicks(
  picks: CouponPick[],
  maxCount = PICKS_PER_MATCH,
  required?: CouponPick["market"]
): CouponPick[] {
  const valid = picks.filter(pick => pick.selection !== null);
  const chosen: CouponPick[] = [];

  const mustKeep = required ? valid.find(pick => pick.market === required) : undefined;
  if (mustKeep) chosen.push(mustKeep);

  if (!chosen.some(pick => STATISTICAL_MARKETS.has(pick.market))) {
    const statistical = shuffled(valid.filter(pick => STATISTICAL_MARKETS.has(pick.market)));
    if (statistical[0]) chosen.push(statistical[0]);
  }

  const rest = shuffled(valid.filter(pick => !chosen.includes(pick)));
  chosen.push(...rest.slice(0, Math.max(0, maxCount - chosen.length)));
  return chosen;
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && (RISK_LEVELS as readonly string[]).includes(value);
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
  if (!isRiskLevel(riskLevel)) throw new Error(`Niveau de risque invalide : ${String(riskLevel)}.`);
  if (fixtures.length === 0) throw new Error("Aucune rencontre fournie.");

  const load = createDetailsLoader();
  // Même plafond que les autres générateurs : évite une rafale d'appels réseau.
  const pool = fixtures.slice(0, MAX_FIXTURES_ANALYZED);
  const loaded = await mapInBatches(pool, FETCH_BATCH_SIZE, async fixture => ({
    fixture,
    details: await load(fixture.id),
  }));
  const usable = loaded.filter(
    (item): item is { fixture: Fixture; details: FotMobDetails } => item.details !== null
  );
  if (usable.length === 0) throw new Error("Impossible de charger les données FotMob des rencontres sélectionnées.");

  const metadata = riskMetadata(riskLevel);
  const baseIndex = COUPON_LEVELS.indexOf(LEVEL_BY_RISK[riskLevel]);
  const predictionCache = new Map<RiskLevel, CouponFixturePrediction[]>();

  const predictionsFor = async (couponRisk: RiskLevel) => {
    const cached = predictionCache.get(couponRisk);
    if (cached) return cached;
    const predictions = await Promise.all(
      usable.map(({ fixture, details }) => buildPrediction(fixture, details, couponRisk, load))
    );
    predictionCache.set(couponRisk, predictions);
    return predictions;
  };

  const coupons: GeneratedCoupon[] = [];
  for (let index = 0; index < couponCount; index++) {
    const level = COUPON_LEVELS[Math.min(baseIndex + (regenerate ? index : 0), COUPON_LEVELS.length - 1)];
    const couponRisk: RiskLevel = level === "sure" ? "safe" : level === "risky" ? "very-risky" : "medium";
    const predictions = await predictionsFor(couponRisk);
    const matches = predictions.map(prediction => ({
      ...prediction,
      picks: selectPicks(prediction.picks),
    }));
    coupons.push({
      level,
      title: level === "sure" ? "Coupon sûr" : level === "risky" ? "Coupon risqué" : "Coupon moyen",
      description: metadata.description,
      matches,
      estimatedCombinedRate: estimateCombinedRate(matches),
    });
  }
  return coupons;
}

/* -------------------------------------------------------------------------- */
/*  Coupons statistiques                                                      */
/* -------------------------------------------------------------------------- */

/** Lit une statistique (home + away) sans confondre 0 et valeur absente. */
function findStatByLabel(details: FotMobDetails, label: string) {
  const wanted = normalize(label);
  for (const [key, value] of details.stats ? details.stats.entries() : []) {
    if (normalize(key) === wanted) return value;
  }
  return undefined;
}

function statTotal(details: FotMobDetails, label: string): number | null {
  // Correspondance exacte d'abord, puis insensible à la casse / aux accents.
  const stat = details.stats?.get(label) ?? findStatByLabel(details, label);
  if (!stat || stat.home == null || stat.away == null) return null;
  if (String(stat.home).trim() === "" || String(stat.away).trim() === "") return null;
  const total = Number(stat.home) + Number(stat.away);
  return Number.isFinite(total) ? total : null;
}

/** Premier libellé disponible parmi plusieurs variantes (EN / FR). */
function firstStatTotal(details: FotMobDetails, labels: string[]): number | null {
  for (const label of labels) {
    const total = statTotal(details, label);
    if (total !== null) return total;
  }
  return null;
}

function statisticTotal(details: FotMobDetails, market: StatisticMarket): number | null {
  switch (market) {
    case "shots":
      return firstStatTotal(details, ["total shots", "shots", "tirs totaux", "tirs"]);
    case "shots-on-target":
      // Ne jamais retomber sur les tirs totaux : ce sont deux marchés distincts.
      return firstStatTotal(details, ["shots on target", "tirs cadres"]);
    case "corners":
      return firstStatTotal(details, ["corners"]);
    case "cards": {
      const yellow = firstStatTotal(details, ["yellow cards", "cartons jaunes"]);
      const red = firstStatTotal(details, ["red cards", "cartons rouges"]) ?? 0;
      return yellow === null ? null : yellow + red;
    }
    default:
      // Ex. "scorers" : pas de total statistique. Avant, ce cas retombait silencieusement sur les cartons.
      return null;
  }
}

function chooseStatisticPick(samples: number[], riskLevel: RiskLevel, market: StatisticMarket) {
  if (samples.length < MIN_STAT_SAMPLES) return null;
  const target = TARGET_RATES[riskLevel];
  const range = LINE_RANGES[market] ?? { min: 0.5, max: Math.max(...samples) + 0.5 };
  const candidates: Array<{ selection: "over" | "under"; line: number; rate: number }> = [];
  // Lignes en .5 uniquement (pas de remboursement possible), bornées à la plage du marché.
  // Index entier pour éviter l'accumulation d'erreurs de virgule flottante.
  for (let step = 1; step * 0.5 <= range.max; step++) {
    const line = step * 0.5;
    if (line < range.min || line % 1 !== 0.5) continue;
    for (const selection of ["over", "under"] as const) {
      const hits = samples.filter(sample => (selection === "over" ? sample > line : sample < line)).length;
      candidates.push({ selection, line, rate: percent(hits, samples.length) });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (first, second) =>
      Math.abs(first.rate - target) - Math.abs(second.rate - target) ||
      second.rate - first.rate ||
      first.line - second.line
  );
  return { ...candidates[0], sampleSize: samples.length };
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
  if (!isRiskLevel(riskLevel)) throw new Error(`Niveau de risque invalide : ${String(riskLevel)}.`);
  if (!SUPPORTED_STATISTIC_MARKETS.has(market)) {
    throw new Error(`Marché statistique non supporté : ${String(market)}.`);
  }

  const load = createDetailsLoader();
  const excluded = new Set(excludeFixtureIds);
  const pool = fixtures.filter(fixture => !excluded.has(fixture.id)).slice(0, MAX_FIXTURES_ANALYZED);

  const evaluated = await mapInBatches(pool, FETCH_BATCH_SIZE, async fixture => {
    const details = await load(fixture.id);
    if (!details) return null;
    const historyDetails = await loadHistoryDetails(details, load);
    const samples = historyDetails
      .map(match => statisticTotal(match, market))
      .filter((value): value is number => value !== null);
    const pick = chooseStatisticPick(samples, riskLevel, market);
    return pick ? { fixture, pick } : null;
  });

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

  // En mode aléatoire, on tire parmi les rencontres les plus proches du taux cible.
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
    title: `Combinaison ${riskLevel} — ${LABELS[market]}`,
    description: `Seuils estimés à partir de ${LABELS[market]} historiques disponibles.`,
    matches,
    estimatedCombinedRate: Number(
      matches.reduce((rate, match) => (rate * match.historicalRate) / 100, 100).toFixed(2)
    ),
  };
}

/* -------------------------------------------------------------------------- */
/*  Coupon buteurs                                                            */
/* -------------------------------------------------------------------------- */

type ScorerCandidate = { name: string; position: string; rating?: string; imageUrl?: string; team: string };

function toScorerSummary(player: ScorerCandidate | undefined) {
  if (!player) return null;
  return {
    name: player.name,
    ...(player.position ? { position: player.position } : {}),
    ...(player.imageUrl ? { imageUrl: player.imageUrl } : {}),
  };
}

export async function generateFotMobScorerCoupon(
  fixtures: Fixture[],
  count: number,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<GeneratedScorerCoupon> {
  assertPositiveInteger(count, "count");

  const load = createDetailsLoader();
  const excluded = new Set(excludeFixtureIds);
  const pool = fixtures.filter(fixture => !excluded.has(fixture.id)).slice(0, MAX_FIXTURES_ANALYZED);

  const evaluated = await mapInBatches(pool, FETCH_BATCH_SIZE, async fixture => {
    const details = await load(fixture.id);
    if (!details) return null;

    const asCandidates = (
      players: Array<{ name: string; position: string; rating?: string; imageUrl?: string }> | undefined,
      team: string
    ): ScorerCandidate[] => (players ?? []).map(player => ({ ...player, team }));

    // Titulaires + meilleurs joueurs, dédoublonnés par (équipe, nom) pour ne jamais
    // mélanger deux homonymes d'équipes différentes.
    const allCandidates = [
      ...asCandidates(details.homeLineup, fixture.homeTeam),
      ...asCandidates(details.awayLineup, fixture.awayTeam),
      ...asCandidates(details.topPlayers?.home, fixture.homeTeam),
      ...asCandidates(details.topPlayers?.away, fixture.awayTeam),
    ];
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map(player => [`${normalize(player.team)}|${normalize(player.name)}`, player])).values()
    );

    const historyDetails = await loadHistoryDetails(details, load);
    const recentScorerNames = extractRecentPlayers(historyDetails).scorers;

    const pickScorerForTeam = (teamName: string): ScorerCandidate | undefined => {
      const teamPlayers = uniqueCandidates.filter(player => player.team === teamName);
      const topScorerNames = topScorerNamesFor(details, teamName);
      const strikers = teamPlayers
        .filter(player => isStriker(player.position))
        .sort((first, second) => ratingOf(second) - ratingOf(first));
      const isRecent = (player: ScorerCandidate) => recentScorerNames.has(normalize(player.name));
      const isTop = (player: ScorerCandidate) => topScorerNames.has(normalize(player.name));

      // Priorité : 1) attaquant ayant marqué récemment, 2) attaquant au classement des buteurs,
      // 3) attaquant le mieux noté, 4) non-attaquant uniquement s'il a marqué récemment / est classé.
      return (
        strikers.find(isRecent) ??
        strikers.find(isTop) ??
        strikers[0] ??
        teamPlayers.find(isRecent) ??
        teamPlayers.find(isTop)
      );
    };

    const homeScorer = pickScorerForTeam(fixture.homeTeam);
    const awayScorer = pickScorerForTeam(fixture.awayTeam);
    if (!homeScorer && !awayScorer) return null;

    return {
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      homeScorer: toScorerSummary(homeScorer),
      awayScorer: toScorerSummary(awayScorer),
      lineupType: details.lineupType,
    };
  });

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
    description: `Un attaquant suggéré par équipe et par rencontre, sélectionné à partir des compositions, des buteurs des ${HISTORY_MATCHES_TO_LOAD} derniers matchs et du classement des buteurs de la compétition. Les milieux et défenseurs ne sont pas proposés comme buteurs sauf s'ils figurent parmi les buteurs récents ou le classement de la compétition. Aucune probabilité de but n’est fournie.`,
    matches: (randomSelection ? shuffled(eligible) : eligible).slice(0, count),
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
  if (!isRiskLevel(riskLevel)) throw new Error(`Niveau de risque invalide : ${String(riskLevel)}.`);

  const load = createDetailsLoader();
  const excluded = new Set(excludeFixtureIds);
  const pool = fixtures.filter(fixture => !excluded.has(fixture.id)).slice(0, MAX_FIXTURES_ANALYZED);

  const candidates = await mapInBatches(pool, FETCH_BATCH_SIZE, async fixture => {
    try {
      const details = await load(fixture.id);
      if (!details) return null;
      const prediction = await buildPrediction(fixture, details, riskLevel, load);
      // Le pick "result" est obligatoire et conservé dans la sélection finale ;
      // le tirage a lieu AVANT le classement pour que estimation et contenu concordent.
      const picks = selectPicks(prediction.picks, PICKS_PER_MATCH, "result");
      if (!picks.some(pick => pick.market === "result")) return null;
      return { prediction: { ...prediction, picks }, estimate: matchRate(picks) ?? 0 };
    } catch (error) {
      console.error(`Impossible d'analyser la rencontre ${fixture.id}.`, error);
      return null;
    }
  });

  const available = candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((first, second) => second.estimate - first.estimate);

  if (available.length < count) {
    throw new Error(
      `Historique insuffisant : ${available.length} rencontre(s) analysable(s) pour ${count} demandée(s).`
    );
  }

  // En mode aléatoire, on tire parmi les meilleures rencontres (et non dans tout le lot).
  const matches = pickFromRanked(available, count, randomSelection).map(candidate => candidate.prediction);
  const metadata = riskMetadata(riskLevel);

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