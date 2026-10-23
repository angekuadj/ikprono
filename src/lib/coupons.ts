export type CouponLevel = "sure" | "medium" | "risky";

/**
 * Source de vérité des sélections qu'un coupon peut contenir.
 *
 * Le générateur (`fotmobCoupons.ts`) construit les lignes dynamiquement
 * (`over-${line}`, `under-${line}`…). Cette liste doit donc rester synchronisée
 * avec ses bornes ; le type `CouponSelection` en est dérivé pour éviter toute
 * divergence entre la validation du stockage et les picks réellement produits.
 */
export const COUPON_SELECTIONS = [
  // Résultat du match.
  "home",
  "draw",
  "away",
  "home-or-draw",
  "away-or-draw",
  "either-win",
  // Total de buts (lignes 0,5 à 4,5).
  "over-0.5",
  "over-1.5",
  "over-2.5",
  "over-3.5",
  "over-4.5",
  "under-0.5",
  "under-1.5",
  "under-2.5",
  "under-3.5",
  "under-4.5",
  // Les deux équipes marquent.
  "btts-yes",
  "btts-no",
  // Buts d'une seule équipe (lignes 0,5 à 2,5 et fourchettes).
  "home-over-0.5",
  "home-over-1.5",
  "home-over-2.5",
  "away-over-0.5",
  "away-over-1.5",
  "away-over-2.5",
  "home-under-0.5",
  "home-under-1.5",
  "home-under-2.5",
  "away-under-0.5",
  "away-under-1.5",
  "away-under-2.5",
  "home-0-1",
  "home-1-3",
  "away-0-1",
  "away-1-3",
  // Corners (lignes 5,5 à 13,5).
  "over-5.5",
  "over-6.5",
  "over-7.5",
  "over-8.5",
  "over-9.5",
  "over-10.5",
  "over-11.5",
  "over-12.5",
  "over-13.5",
  "under-5.5",
  "under-6.5",
  "under-7.5",
  "under-8.5",
  "under-9.5",
  "under-10.5",
  "under-11.5",
  "under-12.5",
  "under-13.5",
  // Handicap (lignes 0,5 à 2,5).
  "home-0.5",
  "home+0.5",
  "home-1.5",
  "home+1.5",
  "home-2.5",
  "home+2.5",
  "away-0.5",
  "away+0.5",
  "away-1.5",
  "away+1.5",
  "away-2.5",
  "away+2.5",
  // Buteur / passeur.
  "scorer",
  "assist",
  "home-scorer",
  "away-scorer",
  "home-assist",
  "away-assist",
] as const;

export type CouponSelection = (typeof COUPON_SELECTIONS)[number];

export interface CouponPick {
  market: "result" | "goals" | "corners" | "handicap" | "scorer" | "assist";
  selection: CouponSelection | null;
  historicalRate: number | null;
  sampleSize: number;
  team?: "home" | "away";
  playerName?: string;
  playerImageUrl?: string;
}

/** Libellés bilingues des sélections, partagés par le panier, le profil et les combinaisons. */
const COUPON_SELECTION_LABELS: Record<CouponSelection, { fr: string; en: string }> = {
  home: { fr: "Victoire domicile (1)", en: "Home win (1)" },
  draw: { fr: "Match nul (N)", en: "Draw (N)" },
  away: { fr: "Victoire extérieur (2)", en: "Away win (2)" },
  "home-or-draw": { fr: "Domicile ou nul (1X)", en: "Home or draw (1X)" },
  "away-or-draw": { fr: "Extérieur ou nul (X2)", en: "Away or draw (X2)" },
  "either-win": { fr: "Victoire d’une équipe (12)", en: "Either team to win (12)" },
  "over-0.5": { fr: "Plus de 0,5 but", en: "Over 0.5 goals" },
  "over-1.5": { fr: "Plus de 1,5 buts", en: "Over 1.5 goals" },
  "over-2.5": { fr: "Plus de 2,5 buts", en: "Over 2.5 goals" },
  "over-3.5": { fr: "Plus de 3,5 buts", en: "Over 3.5 goals" },
  "over-4.5": { fr: "Plus de 4,5 buts", en: "Over 4.5 goals" },
  "under-0.5": { fr: "Moins de 0,5 but", en: "Under 0.5 goals" },
  "under-1.5": { fr: "Moins de 1,5 buts", en: "Under 1.5 goals" },
  "under-2.5": { fr: "Moins de 2,5 buts", en: "Under 2.5 goals" },
  "under-3.5": { fr: "Moins de 3,5 buts", en: "Under 3.5 goals" },
  "under-4.5": { fr: "Moins de 4,5 buts", en: "Under 4.5 goals" },
  "btts-yes": { fr: "Les deux équipes marquent", en: "Both teams to score" },
  "btts-no": { fr: "Au moins une équipe ne marque pas", en: "At least one team fails to score" },
  "home-over-0.5": { fr: "Domicile plus de 0,5 but", en: "Home over 0.5 goals" },
  "home-over-1.5": { fr: "Domicile plus de 1,5 but", en: "Home over 1.5 goals" },
  "home-over-2.5": { fr: "Domicile plus de 2,5 buts", en: "Home over 2.5 goals" },
  "away-over-0.5": { fr: "Extérieur plus de 0,5 but", en: "Away over 0.5 goals" },
  "away-over-1.5": { fr: "Extérieur plus de 1,5 but", en: "Away over 1.5 goals" },
  "away-over-2.5": { fr: "Extérieur plus de 2,5 buts", en: "Away over 2.5 goals" },
  "home-under-0.5": { fr: "Domicile moins de 0,5 but", en: "Home under 0.5 goals" },
  "home-under-1.5": { fr: "Domicile moins de 1,5 but", en: "Home under 1.5 goals" },
  "home-under-2.5": { fr: "Domicile moins de 2,5 buts", en: "Home under 2.5 goals" },
  "away-under-0.5": { fr: "Extérieur moins de 0,5 but", en: "Away under 0.5 goals" },
  "away-under-1.5": { fr: "Extérieur moins de 1,5 but", en: "Away under 1.5 goals" },
  "away-under-2.5": { fr: "Extérieur moins de 2,5 buts", en: "Away under 2.5 goals" },
  "home-0-1": { fr: "Domicile entre 0 et 1 but", en: "Home 0 to 1 goals" },
  "home-1-3": { fr: "Domicile entre 1 et 3 buts", en: "Home 1 to 3 goals" },
  "away-0-1": { fr: "Extérieur entre 0 et 1 but", en: "Away 0 to 1 goals" },
  "away-1-3": { fr: "Extérieur entre 1 et 3 buts", en: "Away 1 to 3 goals" },
  "over-5.5": { fr: "Plus de 5,5 corners", en: "Over 5.5 corners" },
  "over-6.5": { fr: "Plus de 6,5 corners", en: "Over 6.5 corners" },
  "over-7.5": { fr: "Plus de 7,5 corners", en: "Over 7.5 corners" },
  "over-8.5": { fr: "Plus de 8,5 corners", en: "Over 8.5 corners" },
  "over-9.5": { fr: "Plus de 9,5 corners", en: "Over 9.5 corners" },
  "over-10.5": { fr: "Plus de 10,5 corners", en: "Over 10.5 corners" },
  "over-11.5": { fr: "Plus de 11,5 corners", en: "Over 11.5 corners" },
  "over-12.5": { fr: "Plus de 12,5 corners", en: "Over 12.5 corners" },
  "over-13.5": { fr: "Plus de 13,5 corners", en: "Over 13.5 corners" },
  "under-5.5": { fr: "Moins de 5,5 corners", en: "Under 5.5 corners" },
  "under-6.5": { fr: "Moins de 6,5 corners", en: "Under 6.5 corners" },
  "under-7.5": { fr: "Moins de 7,5 corners", en: "Under 7.5 corners" },
  "under-8.5": { fr: "Moins de 8,5 corners", en: "Under 8.5 corners" },
  "under-9.5": { fr: "Moins de 9,5 corners", en: "Under 9.5 corners" },
  "under-10.5": { fr: "Moins de 10,5 corners", en: "Under 10.5 corners" },
  "under-11.5": { fr: "Moins de 11,5 corners", en: "Under 11.5 corners" },
  "under-12.5": { fr: "Moins de 12,5 corners", en: "Under 12.5 corners" },
  "under-13.5": { fr: "Moins de 13,5 corners", en: "Under 13.5 corners" },
  "home-0.5": { fr: "Domicile -0.5", en: "Home -0.5" },
  "home+0.5": { fr: "Domicile +0.5", en: "Home +0.5" },
  "home-1.5": { fr: "Domicile -1.5", en: "Home -1.5" },
  "home+1.5": { fr: "Domicile +1.5", en: "Home +1.5" },
  "home-2.5": { fr: "Domicile -2.5", en: "Home -2.5" },
  "home+2.5": { fr: "Domicile +2.5", en: "Home +2.5" },
  "away-0.5": { fr: "Extérieur -0.5", en: "Away -0.5" },
  "away+0.5": { fr: "Extérieur +0.5", en: "Away +0.5" },
  "away-1.5": { fr: "Extérieur -1.5", en: "Away -1.5" },
  "away+1.5": { fr: "Extérieur +1.5", en: "Away +1.5" },
  "away-2.5": { fr: "Extérieur -2.5", en: "Away -2.5" },
  "away+2.5": { fr: "Extérieur +2.5", en: "Away +2.5" },
  scorer: { fr: "Buteur (n'importe quand)", en: "Anytime scorer" },
  assist: { fr: "Passeur décisif (n'importe quand)", en: "Anytime assist" },
  "home-scorer": { fr: "Buteur domicile (n'importe quand)", en: "Home scorer (anytime)" },
  "away-scorer": { fr: "Buteur extérieur (n'importe quand)", en: "Away scorer (anytime)" },
  "home-assist": { fr: "Passeur décisif domicile (n'importe quand)", en: "Home assist (anytime)" },
  "away-assist": { fr: "Passeur décisif extérieur (n'importe quand)", en: "Away assist (anytime)" },
};

/** Libellé bilingue d'un pick, avec le nom du joueur pour les marchés buteur / passeur. */
export function couponPickLabel(pick: CouponPick): { fr: string; en: string } {
  if (!pick.selection) return { fr: "Historique insuffisant", en: "Insufficient history" };
  const label = COUPON_SELECTION_LABELS[pick.selection];
  return pick.playerName && (pick.market === "scorer" || pick.market === "assist")
    ? { fr: `${label.fr} : ${pick.playerName}`, en: `${label.en} : ${pick.playerName}` }
    : label;
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

export function formatTheoreticalOdds(rate: number): string | null {
  return Number.isFinite(rate) && rate > 0 ? (100 / rate).toFixed(2) : null;
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
