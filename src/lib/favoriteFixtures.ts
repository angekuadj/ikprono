import type { Fixture } from "@/lib/fixtures";

const FAVORITE_FIXTURES_KEY = "ikprono_favorite_fixtures";
const FAVORITE_FIXTURES_UPDATED_EVENT = "ikprono:favorite-fixtures-updated";

function isFixture(value: unknown): value is Fixture {
  if (typeof value !== "object" || value === null) return false;
  const fixture = value as Partial<Fixture>;
  return typeof fixture.id === "string"
    && typeof fixture.sport === "string"
    && typeof fixture.date === "string"
    && typeof fixture.time === "string"
    && typeof fixture.league === "string"
    && typeof fixture.homeTeam === "string"
    && typeof fixture.awayTeam === "string";
}

export function readFavoriteFixtures(): Fixture[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return [];
  }
  const stored = localStorage.getItem(FAVORITE_FIXTURES_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isFixture)) {
    throw new Error("Les matchs favoris enregistrés sont invalides.");
  }
  return parsed;
}

export function writeFavoriteFixtures(fixtures: Fixture[]): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(FAVORITE_FIXTURES_KEY, JSON.stringify(fixtures));
  window.dispatchEvent(new Event(FAVORITE_FIXTURES_UPDATED_EVENT));
}

export function subscribeToFavoriteFixtures(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(FAVORITE_FIXTURES_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(FAVORITE_FIXTURES_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
