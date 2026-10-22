import { NextRequest, NextResponse } from "next/server";
import { loadLiveFootballFixtures } from "@/lib/liveFixtures";

const SPORTS_AUTORISES = ["football", "cricket", "tennis"] as const;

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { sport: string } }
) {
  const { sport } = params;

  if (!SPORTS_AUTORISES.includes(sport as (typeof SPORTS_AUTORISES)[number])) {
    return NextResponse.json(
      { error: "Sport non pris en charge" },
      { status: 400 }
    );
  }

  if (sport === "football") {
    // Appel direct de la logique de chargement (pas de fetch HTTP vers notre
    // propre domaine) pour éviter les échecs réseau en production.
    const result = await loadLiveFootballFixtures();
    return NextResponse.json({
      fixtures: result.fixtures,
      liveAvailable: result.liveAvailable,
      ...(result.cachedAt ? { cachedAt: result.cachedAt } : {}),
      ...(result.warning ? { warning: result.warning } : {}),
    });
  }

  return NextResponse.json(
    { error: "Sport non pris en charge pour les matchs en direct" },
    { status: 404 }
  );
}
