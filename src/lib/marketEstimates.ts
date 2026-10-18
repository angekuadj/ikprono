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

function teamResultCounts(matches: HistoricalScore[], team: string) {
  return matches.reduce((counts, match) => {
    if (match.homeScore === null || match.awayScore === null) return counts;
    const isHome = match.homeTeam === team;
    const teamGoals = isHome ? match.homeScore : match.awayScore;
    const opponentGoals = isHome ? match.awayScore : match.homeScore;
    if (teamGoals > opponentGoals) counts.wins += 1;
    else if (teamGoals === opponentGoals) counts.draws += 1;
    else counts.losses += 1;
    return counts;
  }, { wins: 0, draws: 0, losses: 0 });
}

export function estimateMatchMarkets(
  homeTeam: string,
  awayTeam: string,
  teamHistories: TeamHistory[]
): MarketEstimate[] {
  const homeHistory = teamHistories.find(history => history.team === homeTeam)?.matches ?? [];
  const awayHistory = teamHistories.find(history => history.team === awayTeam)?.matches ?? [];
  const homeCounts = teamResultCounts(homeHistory, homeTeam);
  const awayCounts = teamResultCounts(awayHistory, awayTeam);
  const outcomeSampleSize = homeCounts.wins + homeCounts.draws + homeCounts.losses
    + awayCounts.wins + awayCounts.draws + awayCounts.losses;

  const scoreMatches = [...homeHistory, ...awayHistory].filter(
    match => match.homeScore !== null && match.awayScore !== null
  );
  const totalSampleSize = scoreMatches.length;
  const homeWins = homeCounts.wins + awayCounts.losses;
  const draws = homeCounts.draws + awayCounts.draws;
  const awayWins = homeCounts.losses + awayCounts.wins;
  const successful = (count: number, sampleSize: number): number | null =>
    sampleSize < MIN_SAMPLE_SIZE ? null : Math.round((count / sampleSize) * 100);
  const outcomes = (count: number): number | null =>
    outcomeSampleSize < MIN_SAMPLE_SIZE ? null : Math.round((count / outcomeSampleSize) * 100);
  const totalGoals = (match: HistoricalScore) => (match.homeScore ?? 0) + (match.awayScore ?? 0);
  const scoredByBoth = (match: HistoricalScore) => (match.homeScore ?? 0) > 0 && (match.awayScore ?? 0) > 0;
  const rates: Record<MarketEstimateId, number | null> = {
    "home-win": outcomes(homeWins),
    draw: outcomes(draws),
    "away-win": outcomes(awayWins),
    "either-win": outcomes(homeWins + awayWins),
    "over-1.5": successful(scoreMatches.filter(match => totalGoals(match) > 1).length, totalSampleSize),
    "over-2.5": successful(scoreMatches.filter(match => totalGoals(match) > 2).length, totalSampleSize),
    "over-3.5": successful(scoreMatches.filter(match => totalGoals(match) > 3).length, totalSampleSize),
    "under-1.5": successful(scoreMatches.filter(match => totalGoals(match) < 2).length, totalSampleSize),
    "under-2.5": successful(scoreMatches.filter(match => totalGoals(match) < 3).length, totalSampleSize),
    "both-score-yes": successful(scoreMatches.filter(scoredByBoth).length, totalSampleSize),
    "both-score-no": successful(scoreMatches.filter(match => !scoredByBoth(match)).length, totalSampleSize),
  };

  return MARKET_ESTIMATES.flatMap(({ id }) => {
    const estimatedRate = rates[id];
    if (estimatedRate === null || estimatedRate <= 0) return [];
    return [{
      market: id,
      estimatedRate,
      sampleSize: id === "home-win" || id === "draw" || id === "away-win" || id === "either-win"
        ? outcomeSampleSize
        : totalSampleSize,
    }];
  });
}
