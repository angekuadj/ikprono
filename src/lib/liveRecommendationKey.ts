import type { CouponPick } from "@/lib/coupons";

/**
 * Clé stable d'un événement proposé par l'analyse IA (live), utilisée pour
 * demander d'autres analyses sans reproposer les mêmes événements.
 *
 * Ce module est volontairement isolé et sans dépendance serveur : il est
 * importé par un composant client, alors que `liveAnalysis.ts` charge le
 * moteur d'analyse et ses dépendances Node.
 */
export function liveRecommendationKey(market: CouponPick["market"], selection: string): string {
  return `${market}:${selection}`;
}
