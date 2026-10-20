import type { Fixture } from "@/lib/fixtures";

const BASKET_STORAGE_KEY = "ikprono_fixture_basket";
const BASKET_UPDATED_EVENT = "ikprono:fixture-basket-updated";

function isFixture(value: unknown): value is Fixture {
  if (typeof value !== "object" || value === null) return false;
  const fixture = value as Partial<Fixture>;
  return (
    typeof fixture.id === "string" &&
    typeof fixture.sport === "string" &&
    typeof fixture.date === "string" &&
    typeof fixture.time === "string" &&
    typeof fixture.league === "string" &&
    typeof fixture.homeTeam === "string" &&
    typeof fixture.awayTeam === "string"
  );
}

export function readFixtureBasket(): Fixture[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return [];
  }
  const stored = localStorage.getItem(BASKET_STORAGE_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isFixture)) {
    throw new Error("Le panier contient des données invalides.");
  }
  return parsed;
}

export function writeFixtureBasket(fixtures: Fixture[]): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(fixtures));
  window.dispatchEvent(new Event(BASKET_UPDATED_EVENT));
}

export function subscribeToFixtureBasket(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(BASKET_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(BASKET_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function getSavedSelectionsKey(userId: string): string {
  return `ikprono_saved_selections_${userId}`;
}
