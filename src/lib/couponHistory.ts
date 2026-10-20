import { isGeneratedCoupon } from "@/lib/savedSelections";
import type { GeneratedCoupon } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";

const COUPON_HISTORY_KEY = "ikprono_coupon_history";
const COUPON_HISTORY_UPDATED_EVENT = "ikprono:coupon-history-updated";

export interface StoredCouponHistory {
  id: string;
  createdAt: string;
  archivedAt: string;
  coupon: GeneratedCoupon;
  fixtures: Fixture[];
  finalOutcome: "won" | "lost" | "unavailable";
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

function isStoredCouponHistory(value: unknown): value is StoredCouponHistory {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.archivedAt === "string" &&
    isGeneratedCoupon(value.coupon) &&
    Array.isArray(value.fixtures) &&
    value.fixtures.every(isFixture) &&
    ["won", "lost", "unavailable"].includes(String(value.finalOutcome));
}

export function readCouponHistory(): StoredCouponHistory[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return [];
  }
  const stored = localStorage.getItem(COUPON_HISTORY_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isStoredCouponHistory)) {
    throw new Error("L'historique des coupons contient des données invalides.");
  }
  return parsed;
}

export function writeCouponHistory(history: StoredCouponHistory[]): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(COUPON_HISTORY_KEY, JSON.stringify(history));
  window.dispatchEvent(new Event(COUPON_HISTORY_UPDATED_EVENT));
}

export function subscribeToCouponHistory(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(COUPON_HISTORY_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(COUPON_HISTORY_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function archiveCoupon(combination: {
  id: string;
  createdAt: string;
  coupon: GeneratedCoupon;
  fixtures: Fixture[];
  finalOutcome: "won" | "lost" | "unavailable";
}): StoredCouponHistory {
  return {
    id: combination.id,
    createdAt: combination.createdAt,
    archivedAt: new Date().toISOString(),
    coupon: combination.coupon,
    fixtures: combination.fixtures,
    finalOutcome: combination.finalOutcome,
  };
}
