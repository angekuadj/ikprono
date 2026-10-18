import { NextResponse } from "next/server";
import { loadFotMobDetails } from "@/lib/fotmob";

export const dynamic = "force-dynamic";

const STAT_FIELDS: Record<string, string> = {
  "ball possession": "possession",
  "expected goals (xg)": "expectedGoals",
  "total shots": "shots",
  shots: "shots",
  "shots on target": "shotsOnTarget",
  "shots off target": "shotsOffTarget",
  "blocked shots": "blockedShots",
  "hit woodwork": "hitWoodwork",
  "shots inside box": "shotsInsideBox",
  "shots outside box": "shotsOutsideBox",
  "big chances": "bigChances",
  "big chances missed": "bigChancesMissed",
  "touches in opposition box": "touchesInBox",
  corners: "corners",
  "yellow cards": "yellowCards",
  "red cards": "redCards",
  "fouls committed": "foulsCommitted",
  passes: "passes",
  "accurate passes": "accuratePasses",
  "accurate long balls": "accurateLongBalls",
  "accurate crosses": "accurateCrosses",
  throws: "throws",
  offsides: "offsides",
  tackles: "tackles",
  interceptions: "interceptions",
  blocks: "blocks",
  clearances: "clearances",
  "keeper saves": "keeperSaves",
  "duels won": "duelsWon",
  "ground duels won": "groundDuelsWon",
  "aerial duels won": "aerialDuelsWon",
  "successful dribbles": "successfulDribbles",
  "distance covered": "distanceCovered",
  "sprints": "numberOfSprints",
};

function numericStat(value: string): number {
  const result = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(result) ? result : 0;
}

export async function GET(
  _request: Request,
  { params }: { params: { fixtureId: string } }
) {
  try {
    const details = await loadFotMobDetails(params.fixtureId);
    const { fixture } = details;
    const stats: Record<string, unknown> = {};
    for (const [label, field] of Object.entries(STAT_FIELDS)) {
      const values = details.stats.get(label);
      if (!values) continue;
      const asText = field === "accuratePasses"
        || field === "accurateLongBalls"
        || field === "accurateCrosses"
        || field === "groundDuelsWon"
        || field === "aerialDuelsWon"
        || field === "successfulDribbles";
      stats[field] = asText
        ? values
        : { home: numericStat(values.home), away: numericStat(values.away) };
    }

    const formFor = (teamName: string) => {
      const teamHistory = details.history.recentMatches.find(history => history.team === teamName);
      if (!teamHistory) return "";
      const matchDate = Date.parse(`${fixture.date}T00:00:00.000Z`);
      if (!Number.isFinite(matchDate)) return "";
      const recentCutoff = matchDate - 180 * 24 * 60 * 60 * 1000;
      return teamHistory.matches
        .filter(match => {
          const historyDate = Date.parse(`${match.date}T00:00:00.000Z`);
          return Number.isFinite(historyDate) && historyDate >= recentCutoff && historyDate <= matchDate;
        })
        .slice(-5)
        .map(match => {
          if (match.homeScore === null || match.awayScore === null) return "";
          const teamIsHome = match.homeTeam === teamName;
          const teamGoals = teamIsHome ? match.homeScore : match.awayScore;
          const opponentGoals = teamIsHome ? match.awayScore : match.homeScore;
          return teamGoals > opponentGoals ? "W" : teamGoals === opponentGoals ? "D" : "L";
        })
        .filter(Boolean)
        .join("");
    };

    const headToHead = details.history.confrontations.map(match => ({
      date: match.date,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      competition: match.competition,
    }));
    const matchStats = {
      date: fixture.date,
      time: fixture.time,
      competition: fixture.league,
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      homeImageUrl: details.homeImageUrl,
      awayImageUrl: details.awayImageUrl,
      status: fixture.status,
      homeScore: fixture.homeScore === undefined ? undefined : Number(fixture.homeScore),
      awayScore: fixture.awayScore === undefined ? undefined : Number(fixture.awayScore),
      homeForm: formFor(fixture.homeTeam),
      awayForm: formFor(fixture.awayTeam),
      ...(details.coverageLevel ? { coverageLevel: details.coverageLevel } : {}),
      events: details.events,
      lineupType: details.lineupType,
      homeLineup: details.homeLineup,
      awayLineup: details.awayLineup,
      homeSubstitutes: details.homeSubstitutes,
      awaySubstitutes: details.awaySubstitutes,
      homeUnavailablePlayers: details.homeUnavailablePlayers,
      awayUnavailablePlayers: details.awayUnavailablePlayers,
      comments: details.comments,
      recap: details.recap,
      momentum: details.momentum,
      topPlayers: details.topPlayers,
      headToHead,
      recentMatches: details.history.recentMatches,
      standings: details.standings,
      odds: null,
      availableStats: Object.keys(stats),
      source: details.source,
      ...(details.cachedAt ? { cachedAt: details.cachedAt } : {}),
      ...stats,
    };
    return NextResponse.json(matchStats);
  } catch (error) {
    console.error("FotMob match statistics request failed.", error);
    const message = error instanceof Error ? error.message : "Unable to load match statistics from FotMob.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
