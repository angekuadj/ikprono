import { isGeneratedCoupon } from "@/lib/savedSelections";
import type { GeneratedCoupon } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";

const GENERATED_COMBINATIONS_KEY = "ikprono_generated_combinations";
const GENERATED_COMBINATIONS_UPDATED_EVENT = "ikprono:generated-combinations-updated";

export interface StoredGeneratedCombination {
  id: string;
  createdAt: string;
  coupon: GeneratedCoupon;
  fixtures: Fixture[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFixture(value: unknown): value is Fixture {
  return isRecord(value) &&
    typeof value.id === "string" &&
    ["football", "basketball", "tennis"].includes(String(value.sport)) &&
    typeof value.date === "string" &&
    typeof value.time === "string" &&
    typeof value.league === "string" &&
    typeof value.homeTeam === "string" &&
    typeof value.awayTeam === "string";
}

function isStoredGeneratedCombination(value: unknown): value is StoredGeneratedCombination {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    isGeneratedCoupon(value.coupon) &&
    Array.isArray(value.fixtures) &&
    value.fixtures.every(isFixture);
}

export function readGeneratedCombinations(): StoredGeneratedCombination[] {
  const stored = localStorage.getItem(GENERATED_COMBINATIONS_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isStoredGeneratedCombination)) {
    throw new Error("Les combinaisons enregistrées sont invalides.");
  }
  return parsed;
}

export function writeGeneratedCombinations(combinations: StoredGeneratedCombination[]): void {
  localStorage.setItem(GENERATED_COMBINATIONS_KEY, JSON.stringify(combinations));
  window.dispatchEvent(new Event(GENERATED_COMBINATIONS_UPDATED_EVENT));
}

export function subscribeToGeneratedCombinations(callback: () => void): () => void {
  window.addEventListener(GENERATED_COMBINATIONS_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(GENERATED_COMBINATIONS_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
