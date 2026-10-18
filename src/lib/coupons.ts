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
  | "over-2.5"
  | "over-3.5"
  | "over-5.5"
  | "over-8.5"
  | "over-10.5"
  | "under-0.5"
  | "under-1.5"
  | "under-2.5"
  | "under-3.5"
  | "home-1.5"
  | "away-1.5"
  | "home-2.5"
  | "away-2.5"
  | "scorer"
  | "assist"
  | "home-scorer"
  | "away-scorer"
  | "home-assist"
  | "away-assist";

export interface CouponPick {
  market: "result" | "goals" | "corners" | "handicap" | "scorer" | "assist";
  selection: CouponSelection | null;
  historicalRate: number | null;
  sampleSize: number;
  team?: "home" | "away";
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

export type StatisticMarket = "shots" | "cards" | "corners" | "shots-on-target" | "scorers";

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

export interface ScorerMatchPrediction {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeScorer: { name: string; position?: string; imageUrl?: string } | null;
  awayScorer: { name: string; position?: string; imageUrl?: string } | null;
  lineupType: string;
}

export interface GeneratedScorerCoupon {
  title: string;
  description: string;
  matches: ScorerMatchPrediction[];
}
