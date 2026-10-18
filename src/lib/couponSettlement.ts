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

export function settleCouponPick(pick: CouponPick, score: [number, number]): boolean | null {
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
      default: return null;
    }
  }

  return null;
}

export function settleCouponMatch(
  prediction: CouponFixturePrediction,
  fixture: Fixture | undefined
): CouponOutcome {
  if (!fixture) return "unavailable";
  if (!isFixtureFinished(fixture)) return "pending";

  const score = parseFixtureScore(fixture);
  if (!score) return "unavailable";

  const outcomes = prediction.picks.map(pick => settleCouponPick(pick, score));
  if (outcomes.some(outcome => outcome === false)) return "lost";
  if (outcomes.length === 0 || outcomes.some(outcome => outcome === null)) return "unavailable";
  return "won";
}

export function settleCoupon(outcomes: CouponOutcome[]): CouponOutcome {
  if (outcomes.length === 0) return "unavailable";
  if (outcomes.includes("lost")) return "lost";
  if (outcomes.every(outcome => outcome === "won")) return "won";
  if (outcomes.includes("pending")) return "pending";
  return "unavailable";
}
