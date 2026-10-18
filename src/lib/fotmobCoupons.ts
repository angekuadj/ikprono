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

const RISK_LEVELS = ["very-safe", "safe", "medium", "bold", "very-risky"] as const;
type RiskLevel = (typeof RISK_LEVELS)[number];

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

async function mapInBatches<T, R>(
  values: T[],
  batchSize: number,
  callback: (value: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    results.push(...await Promise.all(values.slice(index, index + batchSize).map(callback)));
  }
  return results;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
}

function uniqueHistory(details: FotMobDetails): HistoricalMatch[] {
  const all = [
    ...details.history.confrontations,
    ...details.history.recentMatches.flatMap(team => team.matches),
  ];
  const seen = new Set<string>();
  return all.filter(match => {
    const key = `${match.date}|${normalize(match.homeTeam)}|${normalize(match.awayTeam)}|${match.homeScore}-${match.awayScore}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return match.homeScore !== null && match.awayScore !== null;
  });
}

interface RecentScorerInfo {
  scorers: string[];
  assisters: string[];
}

function extractScorerInfo(details: FotMobDetails): RecentScorerInfo {
  const scorers = new Set<string>();
  const assisters = new Set<string>();
  for (const event of details.events) {
    const type = (event.type ?? "").toLowerCase();
    const player = (event.player ?? "").trim();
    if (!player) continue;
    if (/goal|but/.test(type)) scorers.add(player);
    if (/assist|passe déc/.test(type)) assisters.add(player);
  }
  return { scorers: Array.from(scorers), assisters: Array.from(assisters) };
}

async function loadRecentScorerInfo(matchIds: string[]): Promise<RecentScorerInfo> {
  const ids = [...new Set(matchIds)].slice(0, 3);
  if (ids.length === 0) return { scorers: [], assisters: [] };
  const detailsList = await mapInBatches(ids, 3, async id => {
    try {
      return await loadFotMobDetails(id);
    } catch {
      return null;
    }
  });
  const result: RecentScorerInfo = { scorers: [], assisters: [] };
  for (const details of detailsList.filter((d): d is FotMobDetails => d !== null)) {
    const info = extractScorerInfo(details);
    result.scorers.push(...info.scorers);
    result.assisters.push(...info.assisters);
  }
  return result;
}

function outcomeForFixture(match: HistoricalMatch, fixture: Fixture): "home" | "draw" | "away" | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  const homeName = normalize(fixture.homeTeam);
  const awayName = normalize(fixture.awayTeam);
  const historicalHome = normalize(match.homeTeam);
  const historicalAway = normalize(match.awayTeam);
  const homeIsSelected = historicalHome === homeName || historicalAway === homeName;
  const awayIsSelected = historicalHome === awayName || historicalAway === awayName;
  if (!homeIsSelected && !awayIsSelected) return null;
  if (match.homeScore === match.awayScore) return "draw";
  const winner = match.homeScore > match.awayScore ? historicalHome : historicalAway;
  return winner === homeName ? "home" : winner === awayName ? "away" : null;
}

function buildResultPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  const results = history.map(match => outcomeForFixture(match, fixture)).filter(
    (result): result is "home" | "draw" | "away" => result !== null
  );
  if (results.length === 0) {
    return { market: "result", selection: null, historicalRate: null, sampleSize: 0 };
  }
  const order = ["home", "draw", "away"] as const;
  const counts = Object.fromEntries(order.map(outcome => [outcome, results.filter(result => result === outcome).length]));
  let selection: CouponPick["selection"];
  let hits: number;
  if (level === "sure") {
    const excluded = [...order].sort((first, second) => counts[first] - counts[second])[0];
    const selections: Record<typeof excluded, NonNullable<CouponPick["selection"]>> = {
      home: "away-or-draw",
      draw: "either-win",
      away: "home-or-draw",
    };
    selection = selections[excluded];
    hits = results.length - counts[excluded];
  } else {
    const preferred = level === "risky" ? ["home", "away"] as const : order;
    const selected = [...preferred].sort((first, second) => counts[second] - counts[first])[0];
    selection = selected;
    hits = counts[selected];
  }
  return {
    market: "result",
    selection,
    historicalRate: Math.round(hits / results.length * 100),
    sampleSize: results.length,
  };
}

function buildGoalsPick(history: HistoricalMatch[], level: CouponLevel): CouponPick {
  const thresholds: Record<CouponLevel, [number, "over-0.5" | "over-1.5" | "over-2.5"]> = {
    sure: [1, "over-0.5"],
    medium: [2, "over-1.5"],
    risky: [3, "over-2.5"],
  };
  const [threshold, selection] = thresholds[level];
  if (history.length === 0) {
    return { market: "goals", selection: null, historicalRate: null, sampleSize: 0 };
  }
  const hits = history.filter(match =>
    match.homeScore !== null && match.awayScore !== null && match.homeScore + match.awayScore >= threshold
  ).length;
  return {
    market: "goals",
    selection,
    historicalRate: Math.round(hits / history.length * 100),
    sampleSize: history.length,
  };
}

function buildCornersPick(details: FotMobDetails, level: CouponLevel): CouponPick {
  const corners = details.stats.get("corners");
  if (!corners || corners.home === null || corners.away === null) {
    return { market: "corners", selection: null, historicalRate: null, sampleSize: 0 };
  }
  const total = Number(corners.home) + Number(corners.away);
  const thresholds: Record<CouponLevel, [number, "over-5.5" | "over-8.5" | "over-10.5"]> = {
    sure: [6, "over-5.5"],
    medium: [9, "over-8.5"],
    risky: [11, "over-10.5"],
  };
  const [threshold, selection] = thresholds[level];
  const hits = total >= threshold ? 1 : 0;
  return {
    market: "corners",
    selection,
    historicalRate: Math.round(hits * 100),
    sampleSize: 1,
  };
}

function buildHandicapPick(history: HistoricalMatch[], fixture: Fixture, level: CouponLevel): CouponPick {
  if (history.length === 0) {
    return { market: "handicap", selection: null, historicalRate: null, sampleSize: 0 };
  }
  const homeWins = history.filter(match => {
    if (match.homeScore === null || match.awayScore === null) return false;
    const historicalHome = normalize(match.homeTeam);
    const historicalAway = normalize(match.awayTeam);
    const homeName = normalize(fixture.homeTeam);
    const awayName = normalize(fixture.awayTeam);
    const homeIsSelected = historicalHome === homeName || historicalAway === homeName;
    const awayIsSelected = historicalHome === awayName || historicalAway === awayName;
    if (!homeIsSelected && !awayIsSelected) return false;
    const winner = match.homeScore > match.awayScore ? historicalHome : historicalAway;
    return winner === homeName && (match.homeScore - match.awayScore) >= 2;
  }).length;
  const awayWins = history.filter(match => {
    if (match.homeScore === null || match.awayScore === null) return false;
    const historicalHome = normalize(match.homeTeam);
    const historicalAway = normalize(match.awayTeam);
    const homeName = normalize(fixture.homeTeam);
    const awayName = normalize(fixture.awayTeam);
    const homeIsSelected = historicalHome === homeName || historicalAway === homeName;
    const awayIsSelected = historicalHome === awayName || historicalAway === awayName;
    if (!homeIsSelected && !awayIsSelected) return false;
    const winner = match.homeScore > match.awayScore ? historicalHome : historicalAway;
    return winner === awayName && (match.awayScore - match.homeScore) >= 2;
  }).length;
  const homeRate = Math.round(homeWins / history.length * 100);
  const awayRate = Math.round(awayWins / history.length * 100);
  let selection: CouponSelection | null = null;
  if (level === "sure" && (homeRate >= 50 || awayRate >= 50)) {
    selection = homeRate >= awayRate ? "home-1.5" : "away-1.5";
  } else if (level === "risky" && (homeRate >= 30 || awayRate >= 30)) {
    selection = homeRate >= awayRate ? "home-2.5" : "away-2.5";
  } else if (level === "medium" && (homeRate >= 40 || awayRate >= 40)) {
    selection = homeRate >= awayRate ? "home-1.5" : "away-1.5";
  }
  return {
    market: "handicap",
    selection,
    historicalRate: selection?.startsWith("home") ? homeRate : awayRate,
    sampleSize: history.length,
  };
}

function buildScorerPick(details: FotMobDetails, level: CouponLevel, recent: RecentScorerInfo, team: "home" | "away"): CouponPick {
  const players = team === "home" ? details.homeLineup : details.awayLineup;
  // Un attaquant de référence uniquement (ailiers, milieux et défenseurs exclus).
  const attackers = players.filter(player => {
    const position = player.position?.toLowerCase() ?? "";
    return /forward|striker|attacker|avant-centre|attaquant|fw|cf|forward-center/.test(position);
  }).sort((first, second) => (Number.parseFloat(second.rating ?? "") || 0) - (Number.parseFloat(first.rating ?? "") || 0));
  if (attackers.length === 0) {
    return { market: "scorer", selection: null, historicalRate: null, sampleSize: 0, team };
  }
  const recentScorerNames = new Set(recent.scorers.map(name => normalize(name)));
  const topScorerNames = new Set((details.topScorers ?? []).map(scorer => normalize(scorer.name)));
  // Priorité : attaquant de l'équipe qui a marqué lors des 3 derniers matchs ou qui figure au classement des buteurs de la compétition.
  const priority = attackers.filter(player =>
    recentScorerNames.has(normalize(player.name)) || topScorerNames.has(normalize(player.name))
  );
  const thresholds: Record<CouponLevel, number> = {
    sure: 2,
    medium: 3,
    risky: 4,
  };
  if (attackers.length >= thresholds[level]) {
    return {
      market: "scorer",
      selection: team === "home" ? "home-scorer" : "away-scorer",
      historicalRate: Math.round(attackers.length * 25 + (priority.length > 0 ? 10 : 0)),
      sampleSize: attackers.length,
      team,
    };
  }
  return { market: "scorer", selection: null, historicalRate: null, sampleSize: attackers.length, team };
}

function buildAssistPick(details: FotMobDetails, level: CouponLevel, recent: RecentScorerInfo, team: "home" | "away"): CouponPick {
  const players = team === "home" ? details.homeLineup : details.awayLineup;
  const playmakers = players.filter(player => {
    const position = player.position?.toLowerCase() ?? "";
    return (
      position.includes("midfielder")
      || position.includes("midfield")
      || position.includes("winger")
      || position.includes("attacker")
      || position.includes("forward")
      || position.includes("milieu")
      || position.includes("ailier")
      || position.includes("offensif")
    );
  }).sort((first, second) => (Number.parseFloat(second.rating ?? "") || 0) - (Number.parseFloat(first.rating ?? "") || 0));
  if (playmakers.length === 0) {
    return { market: "assist", selection: null, historicalRate: null, sampleSize: 0, team };
  }
  const recentAssisterNames = new Set(recent.assisters.map(name => normalize(name)));
  // Priorité : passeur décisif de l'équipe qui a délivré une passe lors des 3 derniers matchs.
  const priority = playmakers.filter(player => recentAssisterNames.has(normalize(player.name)));
  const thresholds: Record<CouponLevel, number> = {
    sure: 2,
    medium: 3,
    risky: 4,
  };
  if (playmakers.length >= thresholds[level]) {
    return {
      market: "assist",
      selection: team === "home" ? "home-assist" : "away-assist",
      historicalRate: Math.round(playmakers.length * 20 + (priority.length > 0 ? 10 : 0)),
      sampleSize: playmakers.length,
      team,
    };
  }
  return { market: "assist", selection: null, historicalRate: null, sampleSize: playmakers.length, team };
}

async function buildPrediction(fixture: Fixture, details: FotMobDetails, riskLevel: RiskLevel): Promise<CouponFixturePrediction> {
  const history = uniqueHistory(details);
  const resultLevel = LEVEL_BY_RISK[riskLevel];
  const goalsLevel = GOAL_LEVEL_BY_RISK[riskLevel];
  const recent = await loadRecentScorerInfo(details.historyMatchIds);
  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    picks: [
      buildResultPick(history, fixture, resultLevel),
      buildGoalsPick(history, goalsLevel),
      buildCornersPick(details, resultLevel),
      buildHandicapPick(history, fixture, resultLevel),
      buildScorerPick(details, resultLevel, recent, "home"),
      buildScorerPick(details, resultLevel, recent, "away"),
      buildAssistPick(details, resultLevel, recent, "home"),
      buildAssistPick(details, resultLevel, recent, "away"),
    ],
  };
}

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

function estimateCombinedRate(matches: CouponFixturePrediction[]): number {
  return Number(matches.reduce((rate, match) => {
    const pickRates = match.picks.map(pick => pick.historicalRate).filter((rate): rate is number => rate !== null);
    const matchRate = pickRates.length
      ? pickRates.reduce((product, rate) => product * rate / 100, 100)
      : 0;
    return rate * matchRate / 100;
  }, 100).toFixed(2));
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

// Garde uniquement les sélections qui retournent une valeur (non null) et en tire
// au hasard un nombre limité (par défaut 2), afin d'éviter d'afficher des marchés
// sans données ("Historique insuffisant").
function selectRandomNonNullPicks(picks: CouponPick[], maxCount = 2): CouponPick[] {
  const nonNull = picks.filter(pick => pick.selection !== null);
  return shuffled(nonNull).slice(0, maxCount);
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return typeof value === "string" && RISK_LEVELS.includes(value as RiskLevel);
}

export async function generateFotMobCoupons(
  fixtures: Fixture[],
  riskLevel: RiskLevel,
  couponCount: number,
  regenerate = false
): Promise<GeneratedCoupon[]> {
  const details = await Promise.all(fixtures.map(fixture => loadFotMobDetails(fixture.id)));
  const metadata = riskMetadata(riskLevel);
  const coupons: GeneratedCoupon[] = [];
  for (let index = 0; index < couponCount; index++) {
    const level = regenerate && index > 0
      ? (["sure", "medium", "risky"] as const)[(["sure", "medium", "risky"] as const).indexOf(LEVEL_BY_RISK[riskLevel]) + index]
        ?? LEVEL_BY_RISK[riskLevel]
      : LEVEL_BY_RISK[riskLevel];
    const couponRisk = level === "sure" ? "safe" : level === "risky" ? "very-risky" : "medium";
    const matchesRaw = await Promise.all(fixtures.map((fixture, fixtureIndex) => buildPrediction(fixture, details[fixtureIndex], couponRisk)));
    const matches = matchesRaw.map(prediction => ({
      ...prediction,
      picks: selectRandomNonNullPicks(prediction.picks, 2),
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

function statisticTotal(details: FotMobDetails, market: StatisticMarket): number | null {
  const get = (label: string) => details.stats.get(label)?.home && details.stats.get(label)?.away
    ? Number(details.stats.get(label)?.home) + Number(details.stats.get(label)?.away)
    : null;
  if (market === "shots") return get("total shots") ?? get("shots");
  if (market === "shots-on-target") return get("shots on target");
  if (market === "corners") return get("corners");
  const yellow = get("yellow cards");
  const red = get("red cards") ?? 0;
  return yellow === null ? null : yellow + red;
}

async function statisticSamples(details: FotMobDetails, market: StatisticMarket): Promise<number[]> {
  const ids = details.historyMatchIds.slice(0, 3);
  const matches = await mapInBatches(ids, 3, async id => {
    try {
      return await loadFotMobDetails(id);
    } catch (error) {
      console.error(`Could not load history match ${id}.`, error);
      return null;
    }
  });
  return matches
    .filter((match): match is FotMobDetails => match !== null)
    .map(match => statisticTotal(match, market))
    .filter((value): value is number => value !== null);
}

function chooseStatisticPick(samples: number[], riskLevel: RiskLevel) {
  if (samples.length === 0) return null;
  const target = TARGET_RATES[riskLevel];
  const maximumLine = Math.max(...samples) + 0.5;
  const candidates: Array<{ selection: "over" | "under"; line: number; rate: number }> = [];
  for (let line = 0.5; line <= maximumLine; line += 0.5) {
    for (const selection of ["over", "under"] as const) {
      const hits = selection === "over"
        ? samples.filter(sample => sample > line).length
        : samples.filter(sample => sample < line).length;
      candidates.push({ selection, line, rate: Math.round(hits / samples.length * 100) });
    }
  }
  candidates.sort((first, second) =>
    Math.abs(first.rate - target) - Math.abs(second.rate - target) || second.rate - first.rate || first.line - second.line
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
  const evaluated = await mapInBatches(fixtures.slice(0, 20), 5, async fixture => {
    const details = await loadFotMobDetails(fixture.id);
    const samples = await statisticSamples(details, market);
    const pick = chooseStatisticPick(samples, riskLevel);
    return pick ? { fixture, pick } : null;
  });
  const candidates = evaluated
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((first, second) =>
      Math.abs(first.pick.rate - TARGET_RATES[riskLevel]) - Math.abs(second.pick.rate - TARGET_RATES[riskLevel])
      || second.pick.sampleSize - first.pick.sampleSize
    );
  const excluded = new Set(excludeFixtureIds);
  const eligible = candidates.filter(candidate => !excluded.has(candidate.fixture.id));
  const selected = randomSelection ? shuffled(eligible) : eligible;
  if (selected.length === 0) {
    throw new Error(`Data has no historical ${LABELS[market]} statistics available for these matches.`);
  }
  if (selected.length < count) {
    throw new Error(`Data does not provide enough historical ${LABELS[market]} statistics to suggest ${count} matches.`);
  }
  const chosen = selected.slice(0, count);
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
    estimatedCombinedRate: Number(matches.reduce((rate, match) => rate * match.historicalRate / 100, 100).toFixed(2)),
  };
}

export async function generateFotMobScorerCoupon(
  fixtures: Fixture[],
  count: number,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<GeneratedScorerCoupon> {
  const evaluated = await mapInBatches(fixtures.slice(0, 20), 5, async fixture => {
    const details = await loadFotMobDetails(fixture.id);

    // Un joueur est considéré comme attaquant de référence uniquement si sa position
    // le désigne clairement comme tel (milieux et défenseurs exclus par défaut).
    const isStriker = (position: string) =>
      /forward|striker|attacker|avant-centre|attaquant|fw|cf|forward-center/.test(normalize(position ?? ""));

    type ScorerCandidate = { name: string; position: string; rating?: string; imageUrl?: string; team: string };

    // Tous les joueurs listés pour la rencontre (titulaires + tops joueurs de l'équipe),
    // dédoublonnés par nom, avec leur équipe d'appartenance.
    const allCandidates: ScorerCandidate[] = [
      ...details.homeLineup.map(player => ({ name: player.name, position: player.position, rating: player.rating, imageUrl: player.imageUrl, team: fixture.homeTeam })),
      ...details.awayLineup.map(player => ({ name: player.name, position: player.position, rating: player.rating, imageUrl: player.imageUrl, team: fixture.awayTeam })),
      ...details.topPlayers.home.map(player => ({ name: player.name, position: player.position, rating: player.rating, imageUrl: player.imageUrl, team: fixture.homeTeam })),
      ...details.topPlayers.away.map(player => ({ name: player.name, position: player.position, rating: player.rating, imageUrl: player.imageUrl, team: fixture.awayTeam })),
    ];
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map(player => [normalize(player.name), player])).values()
    );

    const recent = await loadRecentScorerInfo(details.historyMatchIds);
    const recentScorerNames = new Set(recent.scorers.map(name => normalize(name)));
    const topScorerNames = new Set((details.topScorers ?? []).map(scorer => normalize(scorer.name)));

    // Sélectionne le meilleur buteur pour une équipe donnée.
    const pickScorerForTeam = (teamName: string) => {
      const teamPlayers = uniqueCandidates.filter(player => player.team === teamName);
      const strikers = teamPlayers.filter(player => isStriker(player.position)).sort(
        (first, second) => (Number.parseFloat(second.rating ?? "") || 0) - (Number.parseFloat(first.rating ?? "") || 0)
      );
      // Priorité absolue aux attaquants :
      // 1. attaquant ayant marqué lors des 3 derniers matchs,
      // 2. attaquant du classement des buteurs de la compétition,
      // 3. attaquant le mieux noté.
      let scorer: ScorerCandidate | undefined =
        strikers.find(player => recentScorerNames.has(normalize(player.name))) ??
        (topScorerNames.size > 0 ? strikers.find(player => topScorerNames.has(normalize(player.name))) : undefined) ??
        strikers[0];
      // Derniers recours : un joueur non-attaquant n'est proposé que s'il a marqué récemment
      // ou s'il figure dans le classement des buteurs de la compétition.
      scorer ??= teamPlayers.find(player => recentScorerNames.has(normalize(player.name)));
      if (!scorer && topScorerNames.size > 0) {
        scorer ??= teamPlayers.find(player => topScorerNames.has(normalize(player.name)));
      }
      return scorer;
    };

    const homeScorer = pickScorerForTeam(fixture.homeTeam);
    const awayScorer = pickScorerForTeam(fixture.awayTeam);
    if (!homeScorer && !awayScorer) return null;

    return {
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      homeScorer: homeScorer
        ? { name: homeScorer.name, ...(homeScorer.position ? { position: homeScorer.position } : {}), ...(homeScorer.imageUrl ? { imageUrl: homeScorer.imageUrl } : {}) }
        : null,
      awayScorer: awayScorer
        ? { name: awayScorer.name, ...(awayScorer.position ? { position: awayScorer.position } : {}), ...(awayScorer.imageUrl ? { imageUrl: awayScorer.imageUrl } : {}) }
        : null,
      lineupType: details.lineupType,
    };
  });

  const excluded = new Set(excludeFixtureIds);
  const eligible = evaluated.filter(
    (candidate): candidate is NonNullable<typeof candidate> => candidate !== null && !excluded.has(candidate.fixtureId)
  );
  const selected = randomSelection ? shuffled(eligible) : eligible;
  if (selected.length === 0) {
    throw new Error("Aucun attaquant exploitable n'a été trouvé pour ces rencontres (compositions, buteurs récents ou classement de la compétition indisponibles).");
  }
  if (selected.length < count) {
    throw new Error(`Data provides only ${selected.length} usable striker(s); ${count} are required.`);
  }

  return {
    title: "Combinaison buteurs — buteur à tout moment",
    description: "Un attaquant suggéré par équipe et par rencontre, sélectionné à partir des compositions, des buteurs des 3 derniers matchs et du classement des buteurs de la compétition. Les milieux et défenseurs ne sont pas proposés comme buteurs sauf s'ils figurent parmi les buteurs récents ou le classement de la compétition. Aucune probabilité de but n’est fournie.",
    matches: selected.slice(0, count),
  };
}

export async function suggestFotMobCoupon(
  fixtures: Fixture[],
  count: number,
  riskLevel: RiskLevel,
  excludeFixtureIds: string[] = [],
  randomSelection = false
): Promise<{ coupon: GeneratedCoupon }> {
  const candidates = await mapInBatches(fixtures.slice(0, 20), 5, async fixture => {
    try {
      const details = await loadFotMobDetails(fixture.id);
      const prediction = await buildPrediction(fixture, details, riskLevel);
      const resultPick = prediction.picks.find(pick => pick.market === "result");
      // Seul le pick "result" est obligatoire pour proposer une rencontre. Les marchés
      // options (corners, handicap, buteur, passeur) sont conservés quand les données le
      // permettent, mais n'excluent plus la rencontre lorsqu'ils sont indisponibles.
      if (!resultPick || resultPick.selection === null) return null;
      const estimate = prediction.picks.reduce((rate, pick) => rate * (pick.historicalRate ?? 0) / 100, 100);
      return { prediction, estimate };
    } catch (error) {
      console.error(`Could not analyze fixture ${fixture.id}.`, error);
      return null;
    }
  });
  const excluded = new Set(excludeFixtureIds);
  const available = candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((first, second) => second.estimate - first.estimate)
    .filter(candidate => !excluded.has(candidate.prediction.fixtureId));
  if (available.length < count) {
    throw new Error(`Data does not provide enough completed match history to suggest ${count} fixtures.`);
  }
  const selected = randomSelection ? shuffled(available) : available;
  const matches = selected.slice(0, count).map(candidate => ({
    ...candidate.prediction,
    picks: selectRandomNonNullPicks(candidate.prediction.picks, 2),
  }));
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
