import { NextRequest, NextResponse } from "next/server";
import { loadEspnBasketballLiveFixtures, EspnDataUnavailableError } from "@/lib/espn";
import { loadLiveFootballFixtures } from "@/lib/liveFixtures";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sport = searchParams.get("sport") ?? "football";

  // Basketball via ESPN
  if (sport === "basketball") {
    try {
      const live = await loadEspnBasketballLiveFixtures();
      const fixtures = [...live.fixtures];
      fixtures.sort((first, second) =>
        `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
      );
      return NextResponse.json({
        fixtures,
        liveAvailable: true,
        source: live.source === "cache" ? "cache" : "espn",
        ...(live.cachedAt ? { cachedAt: live.cachedAt } : {}),
        ...(live.source === "cache"
          ? { warning: "Le flux live est indisponible. Les dernières données enregistrées peuvent être obsolètes ; veuillez réessayer plus tard." }
          : {}),
      });
    } catch (error) {
      console.error("Basketball live fixture request failed.", error);
      const message = error instanceof EspnDataUnavailableError
        ? error.message
        : "Unable to load basketball live fixtures";
      return NextResponse.json({
        fixtures: [],
        liveAvailable: false,
        source: "unavailable",
        error: message,
      }, { status: 503 });
    }
  }

  // Football via FotMob
  const result = await loadLiveFootballFixtures();
  return NextResponse.json(result);
}
