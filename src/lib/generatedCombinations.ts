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
    typeof value.awayTeam === "string" &&
    (value.status === undefined || typeof value.status === "string") &&
    (value.competition === undefined || typeof value.competition === "string");
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
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return [];
  }
  const stored = localStorage.getItem(GENERATED_COMBINATIONS_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    throw new Error("Les combinaisons enregistrées sont invalides.");
  }
  const valid = parsed.filter(isStoredGeneratedCombination);
  if (valid.length !== parsed.length) {
    console.warn(`${parsed.length - valid.length} combinaison(s) invalide(s) ignorée(s)`);
    writeGeneratedCombinations(valid);
  }
  return valid;
}

export function writeGeneratedCombinations(combinations: StoredGeneratedCombination[]): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  console.log("💾 Écriture de", combinations.length, "combinaison(s) dans localStorage");
  localStorage.setItem(GENERATED_COMBINATIONS_KEY, JSON.stringify(combinations));
  window.dispatchEvent(new Event(GENERATED_COMBINATIONS_UPDATED_EVENT));
}

export function subscribeToGeneratedCombinations(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(GENERATED_COMBINATIONS_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(GENERATED_COMBINATIONS_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
