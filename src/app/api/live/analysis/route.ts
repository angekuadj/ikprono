import { NextRequest, NextResponse } from "next/server";
import { loadFixturesFromFotMobByIds } from "@/lib/fotmob";
import { isLiveFixture, loadLiveMatchStates } from "@/lib/liveCoupons";
import { analyzeLiveMatch } from "@/lib/liveAnalysis";

export const dynamic = "force-dynamic";

/** Nombre maximal de matchs en direct analysés en une requête. */
const MAX_LIVE_FIXTURES = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Analyse IA (moteur expert local, sans clé API) des matchs EN DIRECT.
 * Corps : { fixtureIds: string[], excludeRecommendations?: Record<fixtureId, string[]> }
 * — 1 à 60 identifiants. `excludeRecommendations` permet de demander une
 * nouvelle analyse sans reproposer les événements déjà affichés.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!isRecord(payload) || !Array.isArray(payload.fixtureIds)
    || payload.fixtureIds.length < 1 || payload.fixtureIds.length > MAX_LIVE_FIXTURES
    || !payload.fixtureIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 128)) {
    return NextResponse.json(
      { error: `Provide between 1 and ${MAX_LIVE_FIXTURES} fixture IDs.` },
      { status: 400 }
    );
  }

  const fixtureIds = payload.fixtureIds as string[];

  const exclusions = new Map<string, string[]>();
  if (payload.excludeRecommendations !== undefined) {
    if (!isRecord(payload.excludeRecommendations)) {
      return NextResponse.json(
        { error: "excludeRecommendations must map fixture IDs to recommendation keys." },
        { status: 400 }
      );
    }
    for (const [fixtureId, keys] of Object.entries(payload.excludeRecommendations)) {
      if (!Array.isArray(keys) || keys.length > 64
        || !keys.every(key => typeof key === "string" && key.length > 0 && key.length <= 128)) {
        return NextResponse.json(
          { error: "Invalid recommendation exclusions." },
          { status: 400 }
        );
      }
      exclusions.set(fixtureId, keys as string[]);
    }
  }

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
        return state
          ? analyzeLiveMatch(fixture, state, { excludeKeys: exclusions.get(fixture.id) ?? [] })
          : null;
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
