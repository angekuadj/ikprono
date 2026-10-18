export type CouponLevel = "sure" | "medium" | "risky";
export type CouponSelection =
  | "home"
  | "draw"
  | "away"
  | "home-or-draw"
  | "away-or-draw"
  | "either-win"
  | "over-0.5"
  | "over-1.5"
  | "over-2.5";

export interface CouponPick {
  market: "result" | "goals";
  selection: CouponSelection | null;
  historicalRate: number | null;
  sampleSize: number;
}

export interface CouponFixturePrediction {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  picks: CouponPick[];
}

export interface GeneratedCoupon {
  level: CouponLevel;
  title: string;
  description: string;
  matches: CouponFixturePrediction[];
  estimatedCombinedRate?: number;
}

export function uniqueGeneratedCoupons(coupons: GeneratedCoupon[]): GeneratedCoupon[] {
  const seen = new Set<string>();
  return coupons.filter(coupon => {
    const signature = JSON.stringify(
      coupon.matches
        .map(match => ({
          fixtureId: match.fixtureId,
          picks: match.picks
            .map(pick => ({ market: pick.market, selection: pick.selection }))
            .sort((first, second) =>
              `${first.market}:${first.selection}`.localeCompare(`${second.market}:${second.selection}`)
            ),
        }))
        .sort((first, second) => first.fixtureId.localeCompare(second.fixtureId))
    );
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export type StatisticMarket = "shots" | "cards" | "corners" | "shots-on-target";

export interface StatisticMatchPrediction {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  market: StatisticMarket;
  selection: "over" | "under";
  line: number;
  historicalRate: number;
  sampleSize: number;
}

export interface GeneratedStatisticCoupon {
  riskLevel: string;
  title: string;
  description: string;
  matches: StatisticMatchPrediction[];
  estimatedCombinedRate: number;
}
