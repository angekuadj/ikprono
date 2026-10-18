import { NextRequest, NextResponse } from "next/server";
import { loadFixtureMarketEstimates } from "@/lib/marketEstimateService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const fixtureIds = request.nextUrl.searchParams.getAll("id");
  if (
    fixtureIds.length < 1 ||
    fixtureIds.length > 20 ||
    fixtureIds.some(id => !/^\d{1,20}$/.test(id)) ||
    new Set(fixtureIds).size !== fixtureIds.length
  ) {
    return NextResponse.json(
      { error: "Provide between 1 and 20 unique FotMob fixture IDs." },
      { status: 400 }
    );
  }

  const marketEstimates: Record<string, Awaited<ReturnType<typeof loadFixtureMarketEstimates>>> = {};
  const errors: string[] = [];
  for (let start = 0; start < fixtureIds.length; start += 5) {
    const batch = fixtureIds.slice(start, start + 5);
    const results = await Promise.allSettled(batch.map(loadFixtureMarketEstimates));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        marketEstimates[result.value.fixtureId] = result.value;
      } else {
        errors.push(batch[index]);
        console.error(`Could not estimate markets for fixture ${batch[index]}.`, result.reason);
      }
    });
  }

  return NextResponse.json({
    marketEstimates,
    ...(errors.length > 0 ? { unavailableFixtureIds: errors } : {}),
  });
}
