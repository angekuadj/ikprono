import type { CouponFixturePrediction, CouponPick } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";

export type CouponOutcome = "pending" | "won" | "lost" | "unavailable";

export function parseFixtureScore(fixture: Fixture): [number, number] | null {
  const homeScore = Number(fixture.homeScore);
  const awayScore = Number(fixture.awayScore);
  if (
    fixture.homeScore !== undefined &&
    fixture.awayScore !== undefined &&
    Number.isInteger(homeScore) &&
    Number.isInteger(awayScore) &&
    homeScore >= 0 &&
    awayScore >= 0
  ) {
    return [homeScore, awayScore];
  }

  const score = fixture.score?.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
  return score ? [Number(score[1]), Number(score[2])] : null;
}

export function isFixtureFinished(fixture: Fixture): boolean {
  const status = fixture.status?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR");
  return status !== undefined && ["termine", "finished", "full time", "ft", "aet", "pen"].includes(status);
}

function normalizePlayerName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase();
}

export function settleCouponPick(
  pick: CouponPick,
  score: [number, number] | null,
  fixture?: Fixture
): boolean | null {
  if (pick.market === "scorer") {
    if (!fixture || !pick.playerName) return null;
    const playerName = normalizePlayerName(pick.playerName);
    const hasScored = fixture.goalScorers?.some(scorer =>
      normalizePlayerName(scorer.name) === playerName
      && (!pick.team || !scorer.side || scorer.side === pick.team)
    );
    if (hasScored) return true;
    return isFixtureFinished(fixture) ? false : null;
  }
  if (!score) return null;
  if (!pick.selection) return null;
  const [homeGoals, awayGoals] = score;

  if (pick.market === "result") {
    switch (pick.selection) {
      case "home": return homeGoals > awayGoals;
      case "draw": return homeGoals === awayGoals;
      case "away": return awayGoals > homeGoals;
      case "home-or-draw": return homeGoals >= awayGoals;
      case "away-or-draw": return awayGoals >= homeGoals;
      case "either-win": return homeGoals !== awayGoals;
      default: return null;
    }
  }

  if (pick.market === "goals") {
    switch (pick.selection) {
      case "over-0.5": return homeGoals + awayGoals >= 1;
      case "over-1.5": return homeGoals + awayGoals >= 2;
      case "over-2.5": return homeGoals + awayGoals >= 3;
      case "over-3.5": return homeGoals + awayGoals >= 4;
      case "over-4.5": return homeGoals + awayGoals >= 5;
      case "under-0.5": return homeGoals + awayGoals === 0;
      case "under-1.5": return homeGoals + awayGoals <= 1;
      case "under-2.5": return homeGoals + awayGoals <= 2;
      case "under-3.5": return homeGoals + awayGoals <= 3;
      case "under-4.5": return homeGoals + awayGoals <= 4;
      case "btts-yes": return homeGoals > 0 && awayGoals > 0;
      case "btts-no": return homeGoals === 0 || awayGoals === 0;
      case "home-over-0.5": return homeGoals >= 1;
      case "home-over-1.5": return homeGoals >= 2;
      case "home-over-2.5": return homeGoals >= 3;
      case "away-over-0.5": return awayGoals >= 1;
      case "away-over-1.5": return awayGoals >= 2;
      case "away-over-2.5": return awayGoals >= 3;
      case "home-under-0.5": return homeGoals === 0;
      case "home-under-1.5": return homeGoals <= 1;
      case "home-under-2.5": return homeGoals <= 2;
      case "away-under-0.5": return awayGoals === 0;
      case "away-under-1.5": return awayGoals <= 1;
      case "away-under-2.5": return awayGoals <= 2;
      case "home-0-1": return homeGoals >= 0 && homeGoals <= 1;
      case "home-1-3": return homeGoals >= 1 && homeGoals <= 3;
      case "away-0-1": return awayGoals >= 0 && awayGoals <= 1;
      case "away-1-3": return awayGoals >= 1 && awayGoals <= 3;
      default: return null;
    }
  }

  if (pick.market === "handicap") {
    const goalDiff = homeGoals - awayGoals;
    switch (pick.selection) {
      case "home-0.5": return goalDiff >= 1;
      case "away-0.5": return goalDiff <= -1;
      case "home-1.5": return goalDiff >= 2;
      case "away-1.5": return goalDiff <= -2;
      case "home-2.5": return goalDiff >= 3;
      case "away-2.5": return goalDiff <= -3;
      case "home+0.5": return goalDiff >= 0;
      case "away+0.5": return goalDiff <= 0;
      case "home+1.5": return goalDiff >= -1;
      case "away+1.5": return goalDiff <= 1;
      case "home+2.5": return goalDiff >= -2;
      case "away+2.5": return goalDiff <= 2;
      default: return null;
    }
  }

  if (pick.market === "corners") {
    // Les corners ne figurent pas dans le score : on utilise les statistiques
    // actualisées de la rencontre quand elles sont disponibles.
    const total = fixture?.liveStatistics?.corners;
    if (total === null || total === undefined) return null;
    const parsed = /^(over|under)-(\d+(?:\.\d+)?)$/.exec(pick.selection);
    if (!parsed) return null;
    const line = Number(parsed[2]);
    return parsed[1] === "over" ? total > line : total < line;
  }

  return null;
}

export function settleCouponMatch(
  prediction: CouponFixturePrediction,
  fixture: Fixture | undefined
): CouponOutcome {
  if (!fixture) return "unavailable";
  const finished = isFixtureFinished(fixture);
  if (!finished) return "pending";
  const score = parseFixtureScore(fixture);

  const outcomes = prediction.picks.map(pick => settleCouponPick(pick, score, fixture));
  if (outcomes.length === 0) return "unavailable";
  const scorerOutcomes = prediction.picks
    .map((pick, index) => pick.market === "scorer" ? outcomes[index] : undefined)
    .filter((outcome): outcome is boolean | null => outcome !== undefined);
  const otherOutcomes = prediction.picks
    .map((pick, index) => pick.market !== "scorer" ? outcomes[index] : undefined)
    .filter((outcome): outcome is boolean | null => outcome !== undefined);
  if (otherOutcomes.some(outcome => outcome === false)) return "lost";
  if (scorerOutcomes.length > 0 && scorerOutcomes.every(outcome => outcome === false)) return "lost";
  if (
    otherOutcomes.some(outcome => outcome === null)
    || (scorerOutcomes.length > 0 && scorerOutcomes.every(outcome => outcome === null))
  ) return "unavailable";
  return "won";
}

export function settleCoupon(outcomes: CouponOutcome[]): CouponOutcome {
  if (outcomes.length === 0) return "unavailable";
  if (outcomes.includes("lost")) return "lost";
  if (outcomes.every(outcome => outcome === "won")) return "won";
  if (outcomes.includes("pending")) return "pending";
  return "unavailable";
}

export function combinationCompletion(combination: {
  matches: CouponFixturePrediction[];
  fixtures: Fixture[];
  fixturesById?: Record<string, Fixture | undefined>;
}): { finished: number; pending: number; total: number; allFinished: boolean } {
  let finished = 0;
  let pending = 0;
  for (const match of combination.matches) {
    const fixture = combination.fixturesById?.[match.fixtureId] ?? combination.fixtures.find(f => f.id === match.fixtureId);
    if (fixture && isFixtureFinished(fixture)) {
      finished += 1;
    } else {
      pending += 1;
    }
  }
  return {
    finished,
    pending,
    total: combination.matches.length,
    allFinished: pending === 0 && combination.matches.length > 0,
  };
}
