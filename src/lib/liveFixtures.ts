import type { Fixture } from "@/lib/fixtures";
import { loadFotMobDay } from "@/lib/fotmob";
import { loadFotMobLiveFixtures, saveFotMobLiveFixtures } from "@/lib/fotmobCache";

/**
 * Charge les matchs de football en direct via FotMob, avec repli sur le cache
 * PostgreSQL.
 *
 * Cette logique est partagée par `/api/sports/fixtures/live` et
 * `/api/live/[sport]`. Elle est appelée directement (jamais par un fetch HTTP
 * vers notre propre domaine) : en production, l'auto-appel HTTP via
 * `NEXT_PUBLIC_SITE_URL` pouvait échouer et faire croire à tort que le flux
 * live était indisponible.
 */
export interface LiveFootballResult {
  fixtures: Fixture[];
  liveAvailable: boolean;
  source: "fotmob" | "cache" | "unavailable";
  cachedAt?: string;
  warning?: string;
}

const LIVE_UNAVAILABLE_WARNING =
  "Le flux live est indisponible. Les dernières données enregistrées peuvent être obsolètes ; veuillez réessayer plus tard.";

const LIVE_DOWN_WARNING =
  "Les matchs en direct sont indisponibles pour le moment. Les dernières données sauvegardées sont affichées si disponibles ; veuillez réessayer plus tard.";

function sortByKickoff(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((first, second) =>
    `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
  );
}

export async function loadLiveFootballFixtures(): Promise<LiveFootballResult> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const day = await loadFotMobDay(today);
    if (day.source === "cache") {
      const cachedLive = await loadFotMobLiveFixtures();
      if (cachedLive && cachedLive.fixtures.length > 0) {
        return {
          fixtures: cachedLive.fixtures,
          liveAvailable: false,
          source: "cache",
          ...(cachedLive.cachedAt ? { cachedAt: cachedLive.cachedAt } : {}),
          warning: LIVE_UNAVAILABLE_WARNING,
        };
      }
      return {
        fixtures: day.fixtures.filter(fixture => fixture.status === "En direct"),
        liveAvailable: false,
        source: "cache",
        ...(day.cachedAt ? { cachedAt: day.cachedAt } : {}),
        warning: LIVE_UNAVAILABLE_WARNING,
      };
    }
    const fixtures = sortByKickoff(day.fixtures.filter(fixture => fixture.status === "En direct"));
    try {
      await saveFotMobLiveFixtures(fixtures);
    } catch (cacheError) {
      console.error("Could not save current live fixtures to PostgreSQL cache.", cacheError);
    }
    return { fixtures, liveAvailable: true, source: "fotmob" };
  } catch (error) {
    console.error("Live fixture request failed.", error);
    let cachedLive: Awaited<ReturnType<typeof loadFotMobLiveFixtures>> = null;
    try {
      cachedLive = await loadFotMobLiveFixtures();
    } catch (cacheError) {
      console.error("Could not read cached live fixtures.", cacheError);
    }
    return {
      fixtures: cachedLive?.fixtures ?? [],
      liveAvailable: false,
      source: cachedLive ? "cache" : "unavailable",
      ...(cachedLive?.cachedAt ? { cachedAt: cachedLive.cachedAt } : {}),
      warning: LIVE_DOWN_WARNING,
    };
  }
}
