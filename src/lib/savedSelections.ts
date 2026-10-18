import type { GeneratedCoupon } from "@/lib/coupons";
import type { Fixture } from "@/lib/fixtures";

export interface SavedSelection {
  id: string;
  createdAt: string;
  fixtures: Fixture[];
  coupons?: GeneratedCoupon[];
  couponsGeneratedAt?: string;
}

const couponSelections = [
  "home",
  "draw",
  "away",
  "home-or-draw",
  "away-or-draw",
  "either-win",
  "over-0.5",
  "over-1.5",
  "over-2.5",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSavedFixture(value: unknown): value is Fixture {
  return isRecord(value) &&
    typeof value.id === "string" &&
    ["football", "basketball", "tennis"].includes(String(value.sport)) &&
    typeof value.homeTeam === "string" &&
    typeof value.awayTeam === "string" &&
    typeof value.date === "string" &&
    typeof value.time === "string" &&
    typeof value.league === "string";
}

export function isGeneratedCoupon(value: unknown): value is GeneratedCoupon {
  if (
    !isRecord(value) ||
    !["sure", "medium", "risky"].includes(String(value.level)) ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    !Array.isArray(value.matches)
  ) {
    return false;
  }
  return value.matches.every(match =>
    isRecord(match) &&
    typeof match.fixtureId === "string" &&
    typeof match.homeTeam === "string" &&
    typeof match.awayTeam === "string" &&
    Array.isArray(match.picks) &&
    match.picks.every(pick =>
      isRecord(pick) &&
      (pick.market === "result" || pick.market === "goals") &&
      (pick.selection === null || (typeof pick.selection === "string" && couponSelections.includes(pick.selection))) &&
      (pick.historicalRate === null || typeof pick.historicalRate === "number") &&
      typeof pick.sampleSize === "number"
    )
  );
}

export function isSavedSelection(value: unknown): value is SavedSelection {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.fixtures) &&
    value.fixtures.every(isSavedFixture) &&
    (value.coupons === undefined ||
      (Array.isArray(value.coupons) &&
        value.coupons.length >= 1 &&
        value.coupons.length <= 3 &&
        value.coupons.every(isGeneratedCoupon))) &&
    (value.couponsGeneratedAt === undefined || typeof value.couponsGeneratedAt === "string")
  );
}

export function readSavedSelections(userId: string): SavedSelection[] {
  const stored = localStorage.getItem(getSavedSelectionsKey(userId));
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isSavedSelection)) {
    throw new Error("L’historique des sélections est invalide.");
  }
  return parsed;
}

export function writeSavedSelections(userId: string, selections: SavedSelection[]): void {
  localStorage.setItem(getSavedSelectionsKey(userId), JSON.stringify(selections));
}

export function getSavedSelectionsKey(userId: string): string {
  return `ikprono_saved_selections_${userId}`;
}
