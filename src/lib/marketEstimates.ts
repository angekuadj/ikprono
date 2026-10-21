export const MARKET_ESTIMATES = [
  { id: "home-win", label: "Victoire domicile", labelEn: "Home win" },
  { id: "draw", label: "Match nul", labelEn: "Draw" },
  { id: "away-win", label: "Victoire extérieur", labelEn: "Away win" },
  { id: "either-win", label: "12 · Une équipe gagne", labelEn: "12 · Either team wins" },
  { id: "over-1.5", label: "Plus de 1,5 buts", labelEn: "Over 1.5 goals" },
  { id: "over-2.5", label: "Plus de 2,5 buts", labelEn: "Over 2.5 goals" },
  { id: "over-3.5", label: "Plus de 3,5 buts", labelEn: "Over 3.5 goals" },
  { id: "under-1.5", label: "Moins de 1,5 buts", labelEn: "Under 1.5 goals" },
  { id: "under-2.5", label: "Moins de 2,5 buts", labelEn: "Under 2.5 goals" },
  { id: "both-score-yes", label: "Les deux équipes marquent · Oui", labelEn: "Both teams to score · Yes" },
  { id: "both-score-no", label: "Les deux équipes marquent · Non", labelEn: "Both teams to score · No" },
] as const;

export type MarketEstimateId = typeof MARKET_ESTIMATES[number]["id"];

export interface MarketEstimate {
  market: MarketEstimateId;
  estimatedRate: number;
  sampleSize: number;
}

export interface MarketSelection extends MarketEstimate {
  estimatedOdds: number;
}

export interface HistoricalScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface TeamHistory {
  team: string;
  matches: HistoricalScore[];
}

const MIN_SAMPLE_SIZE = 5;
const RECENCY_DECAY = 0.8;
const PRIOR_MATCH_WEIGHT = 3;
const MAX_GOALS = 12;
const HOME_ADVANTAGE = 1.08;
const AWAY_ADJUSTMENT = 0.92;

type CompletedMatch = HistoricalScore & { homeScore: number; awayScore: number };

function validMatches(matches: HistoricalScore[]): CompletedMatch[] {
  return matches.filter((match): match is CompletedMatch =>
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.homeScore >= 0 &&
    match.awayScore >= 0
  );
}

function weightedAverage(values: number[], prior: number): number {
  let weightedTotal = 0;
  let totalWeight = 0;
  values.slice(-10).forEach((value, index, recentValues) => {
    const weight = RECENCY_DECAY ** (recentValues.length - index - 1);
    weightedTotal += value * weight;
    totalWeight += weight;
  });
  return (weightedTotal + prior * PRIOR_MATCH_WEIGHT) / (totalWeight + PRIOR_MATCH_WEIGHT);
}

function poissonProbability(expectedGoals: number, goals: number): number {
  let probability = Math.exp(-expectedGoals);
  for (let count = 1; count <= goals; count += 1) {
    probability *= expectedGoals / count;
  }
  return probability;
}

function clampExpectedGoals(value: number): number {
  return Math.min(4.5, Math.max(0.1, value));
}

export function estimateMatchMarkets(
  homeTeam: string,
  awayTeam: string,
  teamHistories: TeamHistory[]
): MarketEstimate[] {
  const homeHistory = validMatches(
    teamHistories.find(history => history.team === homeTeam)?.matches ?? []
  );
  const awayHistory = validMatches(
    teamHistories.find(history => history.team === awayTeam)?.matches ?? []
  );
  const scoreMatches = [...homeHistory, ...awayHistory];
  const totalSampleSize = scoreMatches.length;
  if (
    totalSampleSize < MIN_SAMPLE_SIZE ||
    homeHistory.length === 0 ||
    awayHistory.length === 0
  ) {
    return [];
  }

  const leagueGoalRate = scoreMatches.reduce(
    (total, match) => total + match.homeScore + match.awayScore,
    0
  ) / (2 * totalSampleSize);
  const teamRates = (matches: CompletedMatch[], team: string) => ({
    scored: weightedAverage(
      matches.map(match => match.homeTeam === team ? match.homeScore : match.awayScore),
      leagueGoalRate
    ),
    conceded: weightedAverage(
      matches.map(match => match.homeTeam === team ? match.awayScore : match.homeScore),
      leagueGoalRate
    ),
  });
  const homeRates = teamRates(homeHistory, homeTeam);
  const awayRates = teamRates(awayHistory, awayTeam);
  const expectedHomeGoals = clampExpectedGoals(
    ((homeRates.scored + awayRates.conceded) / 2) * HOME_ADVANTAGE
  );
  const expectedAwayGoals = clampExpectedGoals(
    ((awayRates.scored + homeRates.conceded) / 2) * AWAY_ADJUSTMENT
  );
  const scoreProbabilities = Array.from({ length: MAX_GOALS + 1 }, (_, homeGoals) =>
    Array.from({ length: MAX_GOALS + 1 }, (_, awayGoals) =>
      poissonProbability(expectedHomeGoals, homeGoals)
      * poissonProbability(expectedAwayGoals, awayGoals)
    )
  );
  const probabilityMass = scoreProbabilities.flat().reduce((total, value) => total + value, 0);
  const probability = (predicate: (homeGoals: number, awayGoals: number) => boolean) =>
    scoreProbabilities.reduce((total, row, homeGoals) =>
      total + row.reduce((rowTotal, value, awayGoals) =>
        rowTotal + (predicate(homeGoals, awayGoals) ? value : 0), 0
      ), 0
    ) / probabilityMass;
  const rates: Record<MarketEstimateId, number> = {
    "home-win": probability((homeGoals, awayGoals) => homeGoals > awayGoals),
    draw: probability((homeGoals, awayGoals) => homeGoals === awayGoals),
    "away-win": probability((homeGoals, awayGoals) => homeGoals < awayGoals),
    "either-win": probability((homeGoals, awayGoals) => homeGoals !== awayGoals),
    "over-1.5": probability((homeGoals, awayGoals) => homeGoals + awayGoals > 1),
    "over-2.5": probability((homeGoals, awayGoals) => homeGoals + awayGoals > 2),
    "over-3.5": probability((homeGoals, awayGoals) => homeGoals + awayGoals > 3),
    "under-1.5": probability((homeGoals, awayGoals) => homeGoals + awayGoals < 2),
    "under-2.5": probability((homeGoals, awayGoals) => homeGoals + awayGoals < 3),
    "both-score-yes": probability((homeGoals, awayGoals) => homeGoals > 0 && awayGoals > 0),
    "both-score-no": probability((homeGoals, awayGoals) => homeGoals === 0 || awayGoals === 0),
  };

  return MARKET_ESTIMATES.flatMap(({ id }) => {
    const estimatedRate = Number(Math.min(99.99, rates[id] * 100).toFixed(4));
    return [{
      market: id,
      estimatedRate,
      sampleSize: totalSampleSize,
    }];
  });
}
