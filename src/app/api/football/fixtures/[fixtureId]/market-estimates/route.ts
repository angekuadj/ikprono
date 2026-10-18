import { NextResponse } from "next/server";
import { loadFixtureMarketEstimates } from "@/lib/marketEstimateService";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { fixtureId: string } }
) {
  if (!/^\d{1,20}$/.test(params.fixtureId)) {
    return NextResponse.json({ error: "Provide a valid FotMob fixture ID." }, { status: 400 });
  }

  try {
    return NextResponse.json(await loadFixtureMarketEstimates(params.fixtureId));
  } catch (error) {
    console.error("FotMob market estimate request failed.", error);
    const message = error instanceof Error ? error.message : "Unable to estimate markets from FotMob history.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
