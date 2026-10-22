import { NextResponse } from "next/server";
import { buildFotMobMatchStatistics } from "@/lib/matchStatistics";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { fixtureId: string } }
) {
  try {
    const matchStats = await buildFotMobMatchStatistics(params.fixtureId);
    return NextResponse.json(matchStats);
  } catch (error) {
    console.error("Match statistics request failed.", error);
    const message = error instanceof Error ? error.message : "Unable to load match statistics.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
