import { NextRequest, NextResponse } from "next/server";
import type { Fixture } from "@/lib/fixtures";
import { loadFixturesFromFotMobByDateRange, loadFixturesFromFotMobByDate, loadFixturesFromFotMobByIds, isIsoDate } from "@/lib/fotmob";
import {
  generateFotMobCoupons,
  generateFotMobStatisticCoupon,
  isRiskLevel,
  suggestFotMobCoupon,
  suggestFotMobSafeCoupon,
} from "@/lib/fotmobCoupons";
import type { StatisticMarket } from "@/lib/coupons";

export const dynamic = "force-dynamic";

const STATISTIC_MARKETS: StatisticMarket[] = ["shots", "cards", "corners", "shots-on-target"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  return message.includes("does not provide enough")
    || message.includes("no historical")
    || message.includes("limited to 31 days")
    ? 422
    : 502;
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mode = payload.mode;
  if (mode === "safe" || mode === "auto" || mode === "statistic") {
    if (typeof payload.from !== "string" || !isIsoDate(payload.from)
      || typeof payload.count !== "number" || !Number.isInteger(payload.count)
      || payload.count < 1 || payload.count > 5) {
      return NextResponse.json(
        { error: "Provide a valid start date and an event count between 1 and 5." },
        { status: 400 }
      );
    }
    const riskLevel = mode === "safe" ? "very-safe" : payload.riskLevel ?? "very-safe";
    if (!isRiskLevel(riskLevel)) {
      return NextResponse.json({ error: "Provide a valid risk level." }, { status: 400 });
    }
    const excludeFixtureIds = payload.excludeFixtureIds ?? [];
    if (!Array.isArray(excludeFixtureIds)
      || !excludeFixtureIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 128)) {
      return NextResponse.json({ error: "Provide valid excluded fixture IDs." }, { status: 400 });
    }
    const market = payload.market;
    if (mode === "statistic" && !STATISTIC_MARKETS.includes(market as StatisticMarket)) {
      return NextResponse.json({ error: "Choose a supported statistic market." }, { status: 400 });
    }
    const to = payload.to ?? (() => {
      const through = new Date(`${payload.from}T00:00:00.000Z`);
      through.setUTCDate(through.getUTCDate() + 6);
      return through.toISOString().slice(0, 10);
    })();
    if (typeof to !== "string" || !isIsoDate(to) || to < payload.from) {
      return NextResponse.json({ error: "Provide a valid end date on or after the start date." }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const includeLive = payload.includeLive === true;
    if (!includeLive && payload.from < today) {
      return NextResponse.json({ error: "The start date must be today or later." }, { status: 400 });
    }

    try {
      const fixtures = includeLive
        ? (await loadFixturesFromFotMobByDate(today)).filter(fixture => fixture.status === "En direct")
        : (await loadFixturesFromFotMobByDateRange(payload.from, to))
          .filter(fixture => fixture.date >= today && fixture.status === "Prévu");
      const uniqueFixtures = Array.from(new Map(fixtures.map(fixture => [fixture.id, fixture])).values());
      if (uniqueFixtures.length < payload.count) {
        return NextResponse.json(
          { error: `Only ${uniqueFixtures.length} eligible fixture(s) are available for this request.` },
          { status: 422 }
        );
      }
      if (mode === "statistic") {
        const coupon = await generateFotMobStatisticCoupon(
          uniqueFixtures,
          riskLevel,
          market as StatisticMarket,
          payload.count,
          excludeFixtureIds
        );
        return NextResponse.json({ coupon });
      }
      if (mode === "safe") {
        return NextResponse.json(await suggestFotMobSafeCoupon(uniqueFixtures, payload.count));
      }
      return NextResponse.json(await suggestFotMobCoupon(uniqueFixtures, payload.count, riskLevel, excludeFixtureIds));
    } catch (error) {
      console.error("FotMob coupon suggestion failed.", error);
      const message = error instanceof Error ? error.message : "Unable to suggest a coupon from FotMob.";
      return NextResponse.json({ error: message }, { status: errorStatus(error) });
    }
  }

  if (!Array.isArray(payload.fixtureIds) || payload.fixtureIds.length < 1 || payload.fixtureIds.length > 5
    || !payload.fixtureIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 128)) {
    return NextResponse.json({ error: "Choose between 1 and 5 upcoming fixtures." }, { status: 400 });
  }
  const fixtureIds = payload.fixtureIds as string[];
  if (new Set(fixtureIds).size !== fixtureIds.length) {
    return NextResponse.json({ error: "Fixture IDs must be unique." }, { status: 400 });
  }
  const riskLevel = payload.riskLevel ?? "medium";
  if (!isRiskLevel(riskLevel)) {
    return NextResponse.json({ error: "Provide a valid risk level." }, { status: 400 });
  }
  const regenerate = payload.regenerate ?? false;
  const couponCount = payload.couponCount ?? 3;
  if (typeof regenerate !== "boolean" || typeof couponCount !== "number"
    || !Number.isInteger(couponCount) || couponCount < 1 || couponCount > 50) {
    return NextResponse.json({ error: "Provide a valid regenerate flag and coupon count." }, { status: 400 });
  }

  try {
    const fixtures: Fixture[] = await loadFixturesFromFotMobByIds(fixtureIds);
    if (fixtures.length !== fixtureIds.length) {
      return NextResponse.json({ error: "One or more FotMob fixtures were not found." }, { status: 404 });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (fixtures.some(fixture => fixture.date < today || fixture.status !== "Prévu")) {
      return NextResponse.json(
        { error: "Combinations can only be suggested for upcoming scheduled fixtures." },
        { status: 400 }
      );
    }
    const coupons = await generateFotMobCoupons(fixtures, riskLevel, couponCount, regenerate);
    return NextResponse.json({ coupons });
  } catch (error) {
    console.error("FotMob combination suggestion failed.", error);
    const message = error instanceof Error ? error.message : "Unable to suggest combinations from FotMob.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
