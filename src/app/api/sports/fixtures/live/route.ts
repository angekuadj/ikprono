import { NextResponse } from "next/server";
import { loadFotMobDay } from "@/lib/fotmob";
import { loadFotMobLiveFixtures, saveFotMobLiveFixtures } from "@/lib/fotmobCache";

export const dynamic = "force-dynamic";

function cachedResponse(fixtures: Awaited<ReturnType<typeof loadFotMobLiveFixtures>>) {
  return NextResponse.json({
    fixtures: fixtures?.fixtures ?? [],
    liveAvailable: false,
    source: "cache",
    ...(fixtures?.cachedAt ? { cachedAt: fixtures.cachedAt } : {}),
    warning: "Le flux live est indisponible. Les dernières données enregistrées peuvent être obsolètes ; veuillez réessayer plus tard.",
  });
}

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const day = await loadFotMobDay(today);
    if (day.source === "cache") {
      const cachedLive = await loadFotMobLiveFixtures();
      if (cachedLive && cachedLive.fixtures.length > 0) return cachedResponse(cachedLive);
      return NextResponse.json({
        fixtures: day.fixtures.filter(fixture => fixture.status === "En direct"),
        liveAvailable: false,
        source: "cache",
        cachedAt: day.cachedAt,
        warning: "Le flux live est indisponible. Les dernières données enregistrées peuvent être obsolètes ; veuillez réessayer plus tard.",
      });
    }
    const fixtures = day.fixtures.filter(fixture => fixture.status === "En direct");
    fixtures.sort((first, second) =>
      `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
    );
    try {
      await saveFotMobLiveFixtures(fixtures);
    } catch (cacheError) {
      console.error("Could not save current live fixtures to PostgreSQL cache.", cacheError);
    }
    return NextResponse.json({ fixtures, liveAvailable: true, source: "fotmob" });
  } catch (error) {
    console.error("Live fixture request failed.", error);
    let cachedLive: Awaited<ReturnType<typeof loadFotMobLiveFixtures>> = null;
    try {
      cachedLive = await loadFotMobLiveFixtures();
    } catch (cacheError) {
      console.error("Could not read cached live fixtures.", cacheError);
    }
    return NextResponse.json({
      fixtures: cachedLive?.fixtures ?? [],
      liveAvailable: false,
      source: cachedLive ? "cache" : "unavailable",
      ...(cachedLive ? { cachedAt: cachedLive.cachedAt } : {}),
      warning: "Les matchs en direct sont indisponibles pour le moment. Les dernières données sauvegardées sont affichées si disponibles ; veuillez réessayer plus tard.",
    }, { status: 503 });
  }
}
