import type { Fixture } from "@/lib/fixtures";

const LIVE_FIXTURES_KEY = "ikprono_live_notification_fixtures";
const LIVE_FIXTURES_UPDATED_EVENT = "ikprono:live-notification-fixtures-updated";

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

export function readLiveNotificationFixtures(): Fixture[] {
  const stored = localStorage.getItem(LIVE_FIXTURES_KEY);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isFixture)) {
    throw new Error("La liste des notifications de match est invalide.");
  }
  return parsed;
}

export function writeLiveNotificationFixtures(fixtures: Fixture[]): void {
  localStorage.setItem(LIVE_FIXTURES_KEY, JSON.stringify(fixtures));
  window.dispatchEvent(new Event(LIVE_FIXTURES_UPDATED_EVENT));
}

export function subscribeToLiveNotificationFixtures(callback: () => void): () => void {
  window.addEventListener(LIVE_FIXTURES_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LIVE_FIXTURES_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
