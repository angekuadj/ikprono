import { NextRequest, NextResponse } from "next/server";
import { loadFixturesFromFotMobByIds } from "@/lib/fotmob";
import type { Fixture } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.getAll("id");
  if (
    ids.length < 1 ||
    ids.length > 50 ||
    ids.some(id => id.length < 1 || id.length > 128) ||
    new Set(ids).size !== ids.length
  ) {
    return NextResponse.json(
      { error: "Provide between 1 and 50 unique fixture IDs." },
      { status: 400 }
    );
  }

  const fixtures: Fixture[] = [];
  let unavailableCount = 0;
  for (let start = 0; start < ids.length; start += 5) {
    const batch = ids.slice(start, start + 5);
    const results = await Promise.allSettled(
      batch.map(async id => {
        const matches = await loadFixturesFromFotMobByIds([id]);
        if (matches.length !== 1) {
          throw new Error(`FotMob did not return an updated fixture for ${id}.`);
        }
        return matches[0];
      })
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        fixtures.push(result.value);
      } else {
        unavailableCount += 1;
        console.error(`Could not refresh FotMob fixture ${batch[index]}.`, result.reason);
      }
    });
  }

  return NextResponse.json({
    fixtures,
    ...(unavailableCount > 0 ? { unavailableCount, requestedCount: ids.length } : {}),
  });
}
