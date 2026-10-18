import type { Fixture } from "@/lib/fixtures";
import type {
  CouponFixturePrediction,
  CouponLevel,
  CouponPick,
  GeneratedCoupon,
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

function buildPrediction(fixture: Fixture, details: FotMobDetails, riskLevel: RiskLevel): CouponFixturePrediction {
  const history = uniqueHistory(details);
  const resultLevel = LEVEL_BY_RISK[riskLevel];
  const goalsLevel = GOAL_LEVEL_BY_RISK[riskLevel];
  return {
    fixtureId: fixture.id,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    picks: [
      buildResultPick(history, fixture, resultLevel),
      buildGoalsPick(history, goalsLevel),
    ],
  };
}

function riskMetadata(riskLevel: RiskLevel): { title: string; description: string } {
  const metadata: Record<RiskLevel, { title: string; description: string }> = {
    "very-safe": { title: "Combinaison très prudente", description: "Double chance et au moins 1 but, estimation basée sur l’historique FotMob disponible." },
    safe: { title: "Combinaison prudente", description: "Double chance et au moins 1 but, estimation basée sur l’historique FotMob disponible." },
    medium: { title: "Combinaison moyenne", description: "Résultat le plus fréquent et au moins 2 buts selon l’historique FotMob disponible." },
    bold: { title: "Combinaison audacieuse", description: "Vainqueur le plus fréquent et au moins 2 buts selon l’historique FotMob disponible." },
    "very-risky": { title: "Combinaison à risque très élevé", description: "Vainqueur le plus fréquent et au moins 3 buts selon l’historique FotMob disponible." },
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
    const matches = fixtures.map((fixture, fixtureIndex) => buildPrediction(fixture, details[fixtureIndex], couponRisk));
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
      console.error(`Could not load FotMob history match ${id}.`, error);
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
  excludeFixtureIds: string[] = []
): Promise<GeneratedStatisticCoupon> {
  const evaluated = await mapInBatches(fixtures.slice(0, 10), 5, async fixture => {
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
  const selected = candidates.filter(candidate => !excluded.has(candidate.fixture.id));
  if (selected.length === 0) {
    throw new Error(`FotMob has no historical ${LABELS[market]} statistics available for these matches.`);
  }
  if (selected.length < count) {
    throw new Error(`FotMob does not provide enough historical ${LABELS[market]} statistics to suggest ${count} matches.`);
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
    description: `Seuils estimés à partir de ${LABELS[market]} historiques disponibles sur FotMob.`,
    matches,
    estimatedCombinedRate: Number(matches.reduce((rate, match) => rate * match.historicalRate / 100, 100).toFixed(2)),
  };
}

export async function suggestFotMobCoupon(
  fixtures: Fixture[],
  count: number,
  riskLevel: RiskLevel,
  excludeFixtureIds: string[] = []
): Promise<{ coupon: GeneratedCoupon }> {
  const candidates = await mapInBatches(fixtures.slice(0, 20), 5, async fixture => {
    try {
      const details = await loadFotMobDetails(fixture.id);
      const prediction = buildPrediction(fixture, details, riskLevel);
      if (prediction.picks.some(pick => pick.historicalRate === null)) return null;
      const estimate = prediction.picks.reduce((rate, pick) => rate * (pick.historicalRate ?? 0) / 100, 100);
      return { prediction, estimate };
    } catch (error) {
      console.error(`Could not analyze FotMob fixture ${fixture.id}.`, error);
      return null;
    }
  });
  const excluded = new Set(excludeFixtureIds);
  const available = candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((first, second) => second.estimate - first.estimate)
    .filter(candidate => !excluded.has(candidate.prediction.fixtureId));
  if (available.length < count) {
    throw new Error(`FotMob does not provide enough completed match history to suggest ${count} fixtures.`);
  }
  const matches = available.slice(0, count).map(candidate => candidate.prediction);
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
  excludeFixtureIds: string[] = []
): Promise<{ coupon: GeneratedCoupon }> {
  return suggestFotMobCoupon(fixtures, count, "very-safe", excludeFixtureIds);
}
