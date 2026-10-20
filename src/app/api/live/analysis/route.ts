import { NextRequest, NextResponse } from "next/server";
import { loadFixturesFromFotMobByIds } from "@/lib/fotmob";
import { isLiveFixture, loadLiveMatchStates } from "@/lib/liveCoupons";
import { analyzeLiveMatch } from "@/lib/liveAnalysis";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Analyse IA (moteur expert local, sans clé API) des matchs EN DIRECT.
 * Corps : { fixtureIds: string[] } — 1 à 8 identifiants.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!isRecord(payload) || !Array.isArray(payload.fixtureIds)
    || payload.fixtureIds.length < 1 || payload.fixtureIds.length > 8
    || !payload.fixtureIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 128)) {
    return NextResponse.json(
      { error: "Provide between 1 and 8 fixture IDs." },
      { status: 400 }
    );
  }

  const fixtureIds = payload.fixtureIds as string[];

  try {
    const fixtures = await loadFixturesFromFotMobByIds(fixtureIds);
    const liveFixtures = fixtures.filter(isLiveFixture);
    if (liveFixtures.length === 0) {
      return NextResponse.json(
        { error: "No live fixture available to analyse among these IDs." },
        { status: 422 }
      );
    }

    const states = await loadLiveMatchStates(liveFixtures);
    const analyses = liveFixtures
      .map(fixture => {
        const state = states.get(fixture.id);
        return state ? analyzeLiveMatch(fixture, state) : null;
      })
      .filter(analysis => analysis !== null);

    return NextResponse.json({ analyses });
  } catch (error) {
    console.error("Live analysis failed.", error);
    return NextResponse.json(
      { error: "Unable to analyse these fixtures right now." },
      { status: 502 }
    );
  }
}
