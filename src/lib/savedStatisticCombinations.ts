import type { GeneratedStatisticCoupon, StatisticMarket } from "@/lib/coupons";

const SAVED_STATISTIC_COMBINATIONS_KEY = "ikprono_saved_statistic_combinations";

export interface SavedStatisticCombination {
  id: string;
  createdAt: string;
  coupon: GeneratedStatisticCoupon;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatisticMarket(value: unknown): value is StatisticMarket {
  return ["shots", "cards", "corners", "shots-on-target", "scorers"].includes(String(value));
}

function isGeneratedStatisticCoupon(value: unknown): value is GeneratedStatisticCoupon {
  return isRecord(value) &&
    typeof value.riskLevel === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.estimatedCombinedRate === "number" &&
    Number.isFinite(value.estimatedCombinedRate) &&
    Array.isArray(value.matches) &&
    value.matches.every(match =>
      isRecord(match) &&
      typeof match.fixtureId === "string" &&
      typeof match.homeTeam === "string" &&
      typeof match.awayTeam === "string" &&
      isStatisticMarket(match.market) &&
      (match.selection === "over" || match.selection === "under") &&
      typeof match.line === "number" &&
      Number.isFinite(match.line) &&
      typeof match.historicalRate === "number" &&
      Number.isFinite(match.historicalRate) &&
      typeof match.sampleSize === "number" &&
      Number.isFinite(match.sampleSize)
    );
}

function isSavedStatisticCombination(value: unknown): value is SavedStatisticCombination {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    isGeneratedStatisticCoupon(value.coupon);
}

export function readSavedStatisticCombinations(): SavedStatisticCombination[] {
  const stored = localStorage.getItem(SAVED_STATISTIC_COMBINATIONS_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("Les combinaisons statistiques enregistrées sont invalides.");
  }

  // Lecture tolérante : une entrée invalide (ancien format, donnée corrompue)
  // est écartée au lieu de rendre toute la liste illisible. La liste est
  // réécrite à la prochaine sauvegarde, ce qui nettoie automatiquement les restes.
  const valid: SavedStatisticCombination[] = [];
  for (const entry of parsed) {
    if (isSavedStatisticCombination(entry)) valid.push(entry);
    else console.warn("Combinaison statistique ignorée (format invalide).", entry);
  }
  return valid;
}

export function writeSavedStatisticCombinations(combinations: SavedStatisticCombination[]): void {
  localStorage.setItem(SAVED_STATISTIC_COMBINATIONS_KEY, JSON.stringify(combinations));
}
