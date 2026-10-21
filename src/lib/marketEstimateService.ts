import { estimateMatchMarkets } from "@/lib/marketEstimates";
import { loadFotMobDetails } from "@/lib/fotmob";

export async function loadFixtureMarketEstimates(fixtureId: string) {
  const details = await loadFotMobDetails(fixtureId);
  return {
    fixtureId: details.fixture.id,
    markets: estimateMatchMarkets(
      details.fixture.homeTeam,
      details.fixture.awayTeam,
      details.history.recentMatches
    ),
    source: "fotmob-history" as const,
    model: "weighted-poisson-v1" as const,
  };
}
