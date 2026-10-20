import { loadFotMobDetails, type FotMobDetails } from "@/lib/fotmob";
import {
  combineRates,
  estimateCombinedRate,
  statisticTotal,
} from "@/lib/fotmobCoupons";
import type {
  CouponPick,
  GeneratedCoupon,
  GeneratedStatisticCoupon,
  StatisticMarket,
  StatisticMatchPrediction,
} from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";

/**
 * Génération de combinaisons adaptées aux matchs EN DIRECT.
 *
 * Pour un match commencé, un événement proposé doit encore être **atteignable** :
 *  - un événement déjà gagné (ex. « plus de 1,5 but » alors qu'il y en a déjà 3)
 *    est exclu : il n'apporte rien ;
 *  - un événement déjà perdu (ex. « moins de 2,5 buts » alors qu'il y en a 3,
 *    ou « victoire extérieure » alors que l'équipe mène de 3 à 80') est exclu ;
 *  - un événement inatteignable dans le temps restant (ex. 3 corners de plus
 *    à 88') est exclu.
 *
 * L'évaluation croise le **score en direct**, la **durée restante** (minute
 * affichée, temps additionnel inclus) et les **statistiques en direct**
 * (tirs, tirs cadrés, corners, cartons) fournies par FotMob.
 *
 * Principe de robustesse : quand une donnée live est absente ou illisible
 * (horloge, score, statistiques), on ne tranche pas → le pick reste « open »
 * plutôt que d'être exclu sur une valeur inventée.
 */

/* -------------------------------------------------------------------------- */
/* Constantes                                                                 */
/* -------------------------------------------------------------------------- */

const REGULATION_MINUTES = 90;
/** Borne haute de l'horloge (prolongations incluses) pour rejeter les valeurs aberrantes. */
const MAX_CLOCK_MINUTE = 130;
/** Minute utilisée pour l'affichage/les calculs quand l'horloge est indisponible. */
const DEFAULT_MINUTE = 60;
/** Temps restant minimal retenu (arrêts de jeu probables). */
const MIN_REMAINING_MINUTES = 2;

/** Cadences moyennes utilisées pour estimer l'atteignabilité (minutes par unité). */
const MINUTES_PER_GOAL = 5;
const MINUTES_PER_CORNER = 6;
const MINUTES_PER_SHOT = 3;
const MINUTES_PER_SHOT_ON_TARGET = 7;
const MINUTES_PER_CARD = 12;

/** Minute à partir de laquelle le rythme observé du match est jugé exploitable. */
const PACE_MIN_ELAPSED_MINUTES = 20;

/** Chargement des statistiques live : parallélisme borné et délai maximal. */
const MAX_CONCURRENT_LOADS = 5;
const DETAILS_TIMEOUT_MS = 8000;

/** Probabilité minimale par défaut pour garder un pick (« susceptible d'être atteint »). */
const DEFAULT_MIN_PROBABILITY = 0.3;
/** Poids (en minutes) de la moyenne historique face au rythme observé dans le match. */
const PRIOR_WEIGHT_MINUTES = 30;
/** Moyennes typiques par match (90') servant d'a priori pour le rythme restant. */
export const PRIOR_GOALS_PER_90 = 2.7;
export const PRIOR_STATS_PER_90: Record<StatisticMarket, number> = {
  shots: 25,
  "shots-on-target": 8.5,
  corners: 10,
  cards: 4,
  scorers: 0,
};
/** Nombre maximal de buts/unités supplémentaires pris en compte dans les sommes de Poisson. */
const MAX_POISSON_TERMS = 15;

const LIVE_STATUS = "En direct";

const STAT_MINUTES_PER_UNIT: Record<StatisticMarket, number> = {
  shots: MINUTES_PER_SHOT,
  "shots-on-target": MINUTES_PER_SHOT_ON_TARGET,
  corners: MINUTES_PER_CORNER,
  cards: MINUTES_PER_CARD,
  scorers: MINUTES_PER_GOAL,
};

/** Marchés statistiques lus dans les détails FotMob (« scorers » n'est pas un total). */
const LIVE_STAT_MARKETS = ["shots", "shots-on-target", "corners", "cards"] as const;

/** Fourchettes de buts par équipe (sélections « home-0-1 », « away-1-3 »…). */
const TEAM_RANGES: Record<string, { min: number; max: number }> = {
  "home-0-1": { min: 0, max: 1 },
  "home-1-3": { min: 1, max: 3 },
  "away-0-1": { min: 0, max: 1 },
  "away-1-3": { min: 1, max: 3 },
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 *  - open : encore jouable ET assez probable ;
 *  - won / lost : déjà validé / déjà perdu ;
 *  - unreachable : impossible dans le temps restant ;
 *  - unlikely : théoriquement possible mais trop improbable (< seuil).
 */
export type LivePickStatus = "open" | "won" | "lost" | "unreachable" | "unlikely";

export interface LiveMatchState {
  /** Minute courante (le temps additionnel de 1re mi-temps reste compté 45). */
  minute: number;
  /** Durée restante estimée en minutes (temps réglementaire). */
  remainingMinutes: number;
  /** Faux si la minute n'a pas pu être lue : aucun rejet « inatteignable » n'est alors fait. */
  clockKnown: boolean;
  homeGoals: number;
  awayGoals: number;
  /** Faux si le score live est illisible : les picks basés sur le score restent « open ». */
  scoreKnown: boolean;
  /** Totaux live par marché statistique, quand les stats sont disponibles. */
  stats: Partial<Record<StatisticMarket, number>>;
}

export interface LiveFilterOptions {
  /**
   * Probabilité minimale (0–1) qu'un pick se réalise d'ici la fin du match
   * pour être conservé. Défaut : 0,3. Mettre 0 pour ne garder que l'exclusion
   * « gagné / perdu / inatteignable ».
   */
  minProbability?: number;
  /**
   * Si vrai, une combinaison contenant déjà un pick perdu ou inatteignable
   * est considérée comme morte et renvoie null (au lieu de retirer
   * silencieusement ce pick, ce qui ferait paraître la combinaison meilleure
   * qu'elle n'est). Faux par défaut : comportement historique.
   */
  rejectIfDead?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Lecture de l'état live                                                     */
/* -------------------------------------------------------------------------- */

export function isLiveFixture(fixture: Pick<Fixture, "status">): boolean {
  return fixture.status === LIVE_STATUS;
}

/**
 * Extrait la minute courante d'un affichage live (« 67' », « 67'+2 », « 90+3 »,
 * « Mi-temps »). Renvoie null si l'information est absente ou illisible
 * (« Interrompu », « 2e mi-temps », texte libre…).
 *
 * Le temps additionnel de première mi-temps (45+x) reste compté 45 : il reste
 * bien 45 minutes de jeu, et non 43.
 */
export function parseLiveMinute(liveDisplay: string | null | undefined): number | null {
  if (typeof liveDisplay !== "string") return null;
  const trimmed = liveDisplay.trim();
  if (!trimmed) return null;
  if (/^(mi[-\s]?temps|half[-\s]?time|ht)$/i.test(trimmed)) return 45;

  // Le nombre doit être la minute elle-même (pas le « 2 » de « 2e mi-temps »).
  const match = trimmed.match(/^\D*?(\d{1,3})(?:\s*['′’])?(?:\s*\+\s*(\d{1,2}))?\s*['′’]?\s*$/);
  if (!match) return null;

  const base = Number(match[1]);
  const added = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(base) || !Number.isFinite(added)) return null;
  if (base > MAX_CLOCK_MINUTE) return null;
  if (base === 45 && added > 0) return 45; // arrêts de jeu de la 1re mi-temps
  return Math.min(base + added, MAX_CLOCK_MINUTE);
}

function parseGoals(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeStatisticTotal(details: FotMobDetails, market: StatisticMarket): number | null {
  try {
    const total = statisticTotal(details, market);
    return typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : null;
  } catch (error) {
    console.error(`Statistique live illisible (${market}).`, error);
    return null;
  }
}

/** État live d'un match : score, durée restante et statistiques en cours. */
export function buildLiveMatchState(fixture: Fixture, details: FotMobDetails | null): LiveMatchState {
  const parsedMinute = parseLiveMinute(fixture.liveDisplay);
  const clockKnown = parsedMinute !== null;
  const minute = parsedMinute ?? DEFAULT_MINUTE;

  let homeGoals = parseGoals(fixture.homeScore);
  let awayGoals = parseGoals(fixture.awayScore);

  // Repli sur le score affiché (« 2 - 1 ») si les champs dédiés sont absents.
  if (homeGoals === null || awayGoals === null) {
    const scoreMatch = typeof fixture.score === "string"
      ? fixture.score.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/)
      : null;
    if (scoreMatch) {
      homeGoals ??= Number(scoreMatch[1]);
      awayGoals ??= Number(scoreMatch[2]);
    }
  }

  const stats: Partial<Record<StatisticMarket, number>> = {};
  if (details) {
    for (const market of LIVE_STAT_MARKETS) {
      const total = safeStatisticTotal(details, market);
      if (total !== null) stats[market] = total;
    }
  }

  return {
    minute,
    remainingMinutes: Math.max(MIN_REMAINING_MINUTES, REGULATION_MINUTES - minute),
    clockKnown,
    homeGoals: homeGoals ?? 0,
    awayGoals: awayGoals ?? 0,
    scoreKnown: homeGoals !== null && awayGoals !== null,
    stats,
  };
}

/* -------------------------------------------------------------------------- */
/* Chargement (parallélisme borné + délai maximal)                            */
/* -------------------------------------------------------------------------- */

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} : délai dépassé (${ms} ms)`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (error) {
        console.error("Erreur inattendue pendant le chargement live.", error);
      }
    }
  });
  await Promise.all(runners);
}

/**
 * Charge les états live des matchs en direct (stats FotMob par match).
 * Un échec ou un dépassement de délai sur un match n'empêche pas les autres :
 * l'état est alors construit sans statistiques.
 */
export async function loadLiveMatchStates(fixtures: Fixture[]): Promise<Map<string, LiveMatchState>> {
  const states = new Map<string, LiveMatchState>();

  const seen = new Set<string>();
  const liveFixtures = fixtures.filter(fixture => {
    if (!isLiveFixture(fixture) || seen.has(fixture.id)) return false;
    seen.add(fixture.id);
    return true;
  });

  await runWithConcurrency(liveFixtures, MAX_CONCURRENT_LOADS, async fixture => {
    let details: FotMobDetails | null = null;
    try {
      details = await withTimeout(
        loadFotMobDetails(fixture.id),
        DETAILS_TIMEOUT_MS,
        `Statistiques live ${fixture.id}`
      );
    } catch (error) {
      console.error(`Statistiques live indisponibles pour ${fixture.id}.`, error);
    }
    states.set(fixture.id, buildLiveMatchState(fixture, details));
  });

  return states;
}

/* -------------------------------------------------------------------------- */
/* Évaluation des picks                                                       */
/* -------------------------------------------------------------------------- */

/** Vrai si `needed` unités peuvent encore survenir dans le temps restant. */
function isReachable(needed: number, minutesPerUnit: number, state: LiveMatchState): boolean {
  if (needed <= 0) return true;
  if (!state.clockKnown) return true; // horloge inconnue : on ne tranche pas
  return needed * minutesPerUnit <= state.remainingMinutes;
}

/** Évalue une marge de buts à obtenir dans le temps restant. */
function marginReachable(neededGoals: number, state: LiveMatchState): LivePickStatus {
  return isReachable(neededGoals, MINUTES_PER_GOAL, state) ? "open" : "unreachable";
}

/**
 * Cadence retenue pour une statistique : la plus rapide entre la cadence
 * moyenne et le rythme réellement observé dans ce match (un match à 2 tirs
 * par minute ne doit pas être jugé avec la cadence moyenne).
 */
function effectiveMinutesPerUnit(
  baseline: number,
  current: number,
  state: LiveMatchState,
  usePace: boolean
): number {
  if (!usePace || !state.clockKnown || current <= 0 || state.minute < PACE_MIN_ELAPSED_MINUTES) {
    return baseline;
  }
  return Math.min(baseline, state.minute / current);
}

function parseOverUnder(selection: string): { kind: "over" | "under"; line: number } | null {
  const match = selection.match(/^(over|under)-(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const line = Number(match[2]);
  if (!Number.isFinite(line)) return null;
  return { kind: match[1] as "over" | "under", line };
}

/* ----------------------------- Probabilités ------------------------------ */

/** Nombre attendu d'unités (buts, corners…) d'ici la fin, rythme observé + a priori. */
export function expectedRemaining(prior90: number, current: number, state: LiveMatchState): number {
  const rate = ((prior90 / REGULATION_MINUTES) * PRIOR_WEIGHT_MINUTES + current) /
    (PRIOR_WEIGHT_MINUTES + state.minute);
  return Math.max(0, rate * state.remainingMinutes);
}

function poissonPmf(lambda: number): number[] {
  const pmf: number[] = [Math.exp(-lambda)];
  for (let k = 1; k < MAX_POISSON_TERMS; k++) pmf.push((pmf[k - 1] * lambda) / k);
  return pmf;
}

/** P(X ≥ needed) ou P(X ≤ allowed) pour un compteur ajouté suivant une loi de Poisson. */
function lineProbability(
  current: number,
  line: number,
  kind: "over" | "under",
  lambda: number
): number {
  const pmf = poissonPmf(lambda);
  const cdf = (k: number) => pmf.slice(0, Math.max(0, k + 1)).reduce((a, b) => a + b, 0);
  if (kind === "over") {
    const needed = Math.floor(line) + 1 - current;
    if (needed <= 0) return 1;
    return Math.max(0, 1 - cdf(needed - 1));
  }
  const allowed = Math.floor(line) - current;
  return allowed < 0 ? 0 : Math.min(1, cdf(allowed));
}

type FinalScorePredicate = (home: number, away: number) => boolean;

/** Convertit une sélection (résultat, handicap, buts) en condition sur le score final. */
function finalScorePredicate(market: string, selection: string): FinalScorePredicate | null {
  if (market === "result") {
    switch (selection) {
      case "home": return (h, a) => h > a;
      case "away": return (h, a) => a > h;
      case "draw": return (h, a) => h === a;
      case "home-or-draw": return (h, a) => h >= a;
      case "away-or-draw": return (h, a) => a >= h;
      case "either-win": return (h, a) => h !== a;
      default: return null;
    }
  }
  if (market === "handicap") {
    const m = selection.match(/^(home|away)([+-])(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const line = Number(m[3]);
    if (!Number.isFinite(line)) return null;
    const needed = m[2] === "-" ? Math.floor(line) + 1 : -Math.floor(line);
    return m[1] === "home" ? (h, a) => h - a >= needed : (h, a) => a - h >= needed;
  }
  if (market === "goals") {
    const team = selection.match(/^(home|away)-(over|under)-(\d+(?:\.\d+)?)$/);
    if (team) {
      const line = Number(team[3]);
      const pick = (h: number, a: number) => (team[1] === "home" ? h : a);
      return team[2] === "over"
        ? (h, a) => pick(h, a) >= Math.floor(line) + 1
        : (h, a) => pick(h, a) <= Math.floor(line);
    }
    const range = TEAM_RANGES[selection];
    if (range) {
      const isHome = selection.startsWith("home");
      return (h, a) => {
        const g = isHome ? h : a;
        return g >= range.min && g <= range.max;
      };
    }
    const total = parseOverUnder(selection);
    if (total) {
      return total.kind === "over"
        ? (h, a) => h + a >= Math.floor(total.line) + 1
        : (h, a) => h + a <= Math.floor(total.line);
    }
  }
  return null;
}

/** Probabilité que la condition soit vraie au coup de sifflet final (buts répartis 50/50). */
function finalScoreProbability(state: LiveMatchState, predicate: FinalScorePredicate): number {
  const total = state.homeGoals + state.awayGoals;
  const lambda = expectedRemaining(PRIOR_GOALS_PER_90, total, state) / 2;
  const pmf = poissonPmf(lambda);
  let probability = 0;
  for (let h = 0; h < pmf.length; h++) {
    for (let a = 0; a < pmf.length; a++) {
      if (predicate(state.homeGoals + h, state.awayGoals + a)) probability += pmf[h] * pmf[a];
    }
  }
  return Math.min(1, probability);
}

/** Probabilité d'un pick, ou null quand elle n'est pas calculable (on ne tranche pas). */
export function livePickProbability(pick: CouponPick, state: LiveMatchState): number | null {
  if (!state.clockKnown || pick.selection === null || pick.selection === undefined) return null;
  const selection = String(pick.selection);

  if (pick.market === "corners") {
    const parsed = parseOverUnder(selection);
    const current = state.stats.corners;
    if (!parsed || current === undefined) return null;
    return lineProbability(
      current, parsed.line, parsed.kind,
      expectedRemaining(PRIOR_STATS_PER_90.corners, current, state)
    );
  }
  if (!state.scoreKnown) return null;
  const predicate = finalScorePredicate(pick.market, selection);
  return predicate ? finalScoreProbability(state, predicate) : null;
}

/**
 * Évalue une ligne « plus/moins de X » sur un total live.
 *  - over : « won » si déjà atteint, « unreachable » si hors de portée du temps restant ;
 *  - under : « lost » si la ligne est déjà franchie ; sinon encore ouvert.
 *    (Ligne entière : un total égal à la ligne est un remboursement, donc encore ouvert.)
 */
function evaluateLine(
  current: number | null,
  line: number,
  kind: "over" | "under",
  minutesPerUnit: number,
  state: LiveMatchState,
  usePace = false
): LivePickStatus {
  if (current === null) return "open"; // Pas de donnée live : impossible à trancher.

  if (kind === "over") {
    const target = Math.floor(line) + 1; // over-2.5 → 3 requis ; over-2 → 3 requis
    const needed = target - current;
    if (needed <= 0) return "won"; // Déjà gagné : exclu (ne rapporte rien).
    const perUnit = effectiveMinutesPerUnit(minutesPerUnit, current, state, usePace);
    return isReachable(needed, perUnit, state) ? "open" : "unreachable";
  }

  return current > line ? "lost" : "open"; // Ligne franchie : le « moins » est mort.
}

/** Issue du match (1N2 et doubles chances) : atteignable tant que le temps le permet. */
function evaluateResultSelection(selection: string, state: LiveMatchState): LivePickStatus {
  const margin = state.homeGoals - state.awayGoals;
  switch (selection) {
    case "home":
      return marginReachable(Math.max(0, 1 - margin), state);
    case "away":
      return marginReachable(Math.max(0, 1 + margin), state);
    case "draw":
      return marginReachable(Math.abs(margin), state);
    case "home-or-draw":
      return marginReachable(Math.max(0, -margin), state);
    case "away-or-draw":
      return marginReachable(Math.max(0, margin), state);
    case "either-win":
      return marginReachable(margin === 0 ? 1 : 0, state);
    default:
      return "open";
  }
}

/**
 * Handicap : écart de buts à obtenir (ou à ne pas dépasser) dans le temps restant.
 *  - « home-1.5 » : victoire avec ≥ 2 buts d'écart ;
 *  - « away+1.5 » : l'adversaire ne gagne pas de plus de 1 but ;
 *  - « away+0.5 » : l'adversaire ne gagne pas (nul ou mieux).
 */
function evaluateHandicapSelection(selection: string, state: LiveMatchState): LivePickStatus {
  const match = selection.match(/^(home|away)([+-])(\d+(?:\.\d+)?)$/);
  if (!match) return "open";
  const side = match[1] as "home" | "away";
  const sign = match[2];
  const line = Number(match[3]);
  if (!Number.isFinite(line)) return "open";

  // Écart de buts du point de vue de l'équipe concernée.
  const sideMargin = side === "home"
    ? state.homeGoals - state.awayGoals
    : state.awayGoals - state.homeGoals;

  if (sign === "-") {
    const requiredMargin = Math.floor(line) + 1;
    return marginReachable(Math.max(0, requiredMargin - sideMargin), state);
  }

  // Ligne positive : l'équipe peut perdre d'au plus `floor(line)` buts.
  const tolerated = Math.floor(line);
  return marginReachable(Math.max(0, -sideMargin - tolerated), state);
}

/** Buts d'une équipe (« home-over-1.5 », « away-under-2.5 »…). */
function evaluateTeamGoalsSelection(selection: string, state: LiveMatchState): LivePickStatus | null {
  const match = selection.match(/^(home|away)-((?:over|under)-\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const parsed = parseOverUnder(match[2]);
  if (!parsed) return null;
  const current = match[1] === "home" ? state.homeGoals : state.awayGoals;
  return evaluateLine(current, parsed.line, parsed.kind, MINUTES_PER_GOAL, state);
}

/** Fourchette de buts d'une équipe (« home-0-1 » : l'équipe marque 0 ou 1 but). */
function evaluateTeamRangeSelection(selection: string, state: LiveMatchState): LivePickStatus | null {
  const range = TEAM_RANGES[selection];
  if (!range) return null;
  const current = selection.startsWith("home") ? state.homeGoals : state.awayGoals;
  if (current > range.max) return "lost"; // Hors fourchette : déjà perdu.
  return marginReachable(Math.max(0, range.min - current), state);
}

/** Évalue un pick de combinaison sur un match en direct (statut « logique », sans probabilité). */
function evaluateLivePickState(pick: CouponPick, state: LiveMatchState): LivePickStatus {
  if (pick.selection === null || pick.selection === undefined) return "lost"; // Pick non calculable : exclu.
  const selection = String(pick.selection);

  // Sans score fiable, les marchés basés sur le score ne peuvent pas être tranchés.
  const scoreBased = pick.market === "result" || pick.market === "handicap" || pick.market === "goals";
  if (scoreBased && !state.scoreKnown) return "open";

  switch (pick.market) {
    case "result":
      return evaluateResultSelection(selection, state);

    case "handicap":
      return evaluateHandicapSelection(selection, state);

    case "corners": {
      const parsed = parseOverUnder(selection);
      if (!parsed) return "open";
      const current = state.stats.corners ?? null;
      return evaluateLine(current, parsed.line, parsed.kind, MINUTES_PER_CORNER, state, true);
    }

    case "goals": {
      const team = evaluateTeamGoalsSelection(selection, state);
      if (team) return team;
      const range = evaluateTeamRangeSelection(selection, state);
      if (range) return range;
      const parsed = parseOverUnder(selection);
      if (parsed) {
        const totalGoals = state.homeGoals + state.awayGoals;
        return evaluateLine(totalGoals, parsed.line, parsed.kind, MINUTES_PER_GOAL, state);
      }
      return "open";
    }

    case "scorer": {
      // « Buteur domicile/extérieur (n'importe quand) » = l'équipe marque au moins
      // un but. Déjà validé si l'équipe a déjà marqué ; sinon il faut encore le temps.
      if (!state.scoreKnown || (selection !== "home-scorer" && selection !== "away-scorer")) return "open";
      const teamGoals = selection === "home-scorer" ? state.homeGoals : state.awayGoals;
      if (teamGoals >= 1) return "won"; // Déjà validé : exclu.
      return marginReachable(1, state);
    }

    case "assist": {
      // « Pass décisive (n'importe quand) » : impossible à valider sans compteur de
      // passes live. Exclue seulement si l'équipe n'a plus le temps de marquer.
      if (!state.scoreKnown || (selection !== "home-assist" && selection !== "away-assist")) return "open";
      const teamGoals = selection === "home-assist" ? state.homeGoals : state.awayGoals;
      return teamGoals >= 1 ? "open" : marginReachable(1, state);
    }

    default:
      // Marché inconnu : on ne tranche pas.
      return "open";
  }
}

/**
 * Évalue un pick sur un match en direct : exclut le déjà gagné/perdu/inatteignable
 * puis les picks dont la probabilité de réalisation est sous `minProbability`.
 */
export function evaluateLivePick(
  pick: CouponPick,
  state: LiveMatchState,
  minProbability: number = DEFAULT_MIN_PROBABILITY
): LivePickStatus {
  const status = evaluateLivePickState(pick, state);
  if (status !== "open") return status;
  const probability = livePickProbability(pick, state);
  return probability !== null && probability < minProbability ? "unlikely" : "open";
}

/** Évalue une prédiction statistique (ligne over/under) sur un match en direct. */
export function evaluateLiveStatisticPrediction(
  prediction: StatisticMatchPrediction,
  state: LiveMatchState,
  minProbability: number = DEFAULT_MIN_PROBABILITY
): LivePickStatus {
  const status = evaluateLiveStatisticState(prediction, state);
  if (status !== "open") return status;
  if (prediction.market === "scorers" || !state.clockKnown) return "open";
  const current = state.stats[prediction.market];
  if (current === undefined) return "open";
  const probability = lineProbability(
    current,
    prediction.line,
    prediction.selection,
    expectedRemaining(PRIOR_STATS_PER_90[prediction.market], current, state)
  );
  return probability < minProbability ? "unlikely" : "open";
}

function evaluateLiveStatisticState(
  prediction: StatisticMatchPrediction,
  state: LiveMatchState
): LivePickStatus {
  if (prediction.market === "scorers") return "open";
  if (prediction.selection !== "over" && prediction.selection !== "under") return "open";
  if (!Number.isFinite(prediction.line)) return "open";

  const current = state.stats[prediction.market] ?? null;
  return evaluateLine(
    current,
    prediction.line,
    prediction.selection,
    STAT_MINUTES_PER_UNIT[prediction.market] ?? MINUTES_PER_SHOT,
    state,
    true
  );
}

/* -------------------------------------------------------------------------- */
/* Filtrage des combinaisons                                                  */
/* -------------------------------------------------------------------------- */

function isDeadStatus(status: LivePickStatus): boolean {
  return status === "lost" || status === "unreachable";
}

/**
 * Retire d'un coupon les picks des matchs en direct qui sont déjà gagnés,
 * perdus ou inatteignables. Renvoie null si plus aucun pick ouvert ne reste
 * (ou, avec `rejectIfDead`, si un pick est déjà perdu/inatteignable).
 */
export function filterCouponForLive(
  coupon: GeneratedCoupon,
  states: Map<string, LiveMatchState>,
  options: LiveFilterOptions = {}
): GeneratedCoupon | null {
  let dead = false;
  const minProbability = options.minProbability ?? DEFAULT_MIN_PROBABILITY;

  const matches = coupon.matches
    .map(match => {
      const state = states.get(match.fixtureId);
      if (!state) return match; // Match pas en direct (ou état absent) : inchangé.
      const picks = match.picks.filter(pick => {
        const status = evaluateLivePick(pick, state, minProbability);
        if (isDeadStatus(status)) dead = true;
        return status === "open";
      });
      return { ...match, picks };
    })
    .filter(match => match.picks.length > 0);

  if (options.rejectIfDead && dead) return null;
  if (matches.length === 0) return null;
  return { ...coupon, matches, estimatedCombinedRate: estimateCombinedRate(matches) };
}

/** Idem pour une combinaison statistique (lignes over/under sur stats live). */
export function filterStatisticCouponForLive(
  coupon: GeneratedStatisticCoupon,
  states: Map<string, LiveMatchState>,
  options: LiveFilterOptions = {}
): GeneratedStatisticCoupon | null {
  let dead = false;
  const minProbability = options.minProbability ?? DEFAULT_MIN_PROBABILITY;

  const matches = coupon.matches.filter(match => {
    const state = states.get(match.fixtureId);
    if (!state) return true;
    const status = evaluateLiveStatisticPrediction(match, state, minProbability);
    if (isDeadStatus(status)) dead = true;
    return status === "open";
  });

  if (options.rejectIfDead && dead) return null;
  if (matches.length === 0) return null;
  return {
    ...coupon,
    matches,
    estimatedCombinedRate: combineRates(matches.map(match => match.historicalRate)),
  };
}