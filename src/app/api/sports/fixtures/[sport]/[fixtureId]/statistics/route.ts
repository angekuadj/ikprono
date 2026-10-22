import { NextResponse } from "next/server";
import {
  buildEspnBasketballStatistics,
  buildFotMobMatchStatistics,
} from "@/lib/matchStatistics";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { sport: string; fixtureId: string } }
) {
  const { sport, fixtureId } = params;

  if (sport !== "football" && sport !== "basketball") {
    return NextResponse.json(
      { error: "Unsupported sport. Statistics are available for football and basketball only." },
      { status: 400 }
    );
  }

  try {
    if (sport === "basketball") {
      const stats = await buildEspnBasketballStatistics(fixtureId);
      return NextResponse.json(stats);
    }
    const stats = await buildFotMobMatchStatistics(fixtureId);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Match statistics request failed.", error);
    const message = error instanceof Error ? error.message : "Unable to load match statistics.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
