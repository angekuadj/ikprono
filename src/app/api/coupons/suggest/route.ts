import { NextRequest, NextResponse } from "next/server";
import type { Fixture } from "@/lib/fixtures";
import { loadFixturesFromFotMobByDateRange, loadFixturesFromFotMobByDate, loadFixturesFromFotMobByIds, isIsoDate } from "@/lib/fotmob";
import {
  generateFotMobCoupons,
  generateFotMobStatisticCoupon,
  generateFotMobScorerCoupon,
  isRiskLevel,
  suggestFotMobCoupon,
  suggestFotMobSafeCoupon,
} from "@/lib/fotmobCoupons";
import type { GeneratedCoupon, GeneratedStatisticCoupon, StatisticMarket } from "@/lib/coupons";
import {
  applyQuotaCookie,
  commitCombinationUsage,
  enforceCombinationQuota,
} from "@/lib/server/quotaGuard";
import {
  filterCouponForLive,
  filterStatisticCouponForLive,
  loadLiveMatchStates,
  type LiveMatchState,
} from "@/lib/liveCoupons";

export const dynamic = "force-dynamic";

const STATISTIC_MARKETS: StatisticMarket[] = ["shots", "cards", "corners", "shots-on-target", "scorers"];

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

/**
 * En direct : retire du résultat généré les événements déjà gagnés, perdus ou
 * inatteignables dans le temps restant. Renvoie null si plus rien d'ouvert ne
 * reste (aucun crédit ne doit alors être consommé).
 */
function filterLiveResult(
  result: Record<string, unknown>,
  liveStates: Map<string, LiveMatchState>
): Record<string, unknown> | null {
  if (liveStates.size === 0) return result;
  const coupon = result.coupon as GeneratedCoupon | GeneratedStatisticCoupon | undefined;
  if (!coupon || !Array.isArray(coupon.matches) || coupon.matches.length === 0) return result;
  const first: unknown = coupon.matches[0];
  if (typeof first === "object" && first !== null && "picks" in first) {
    const filtered = filterCouponForLive(coupon as GeneratedCoupon, liveStates);
    return filtered ? { ...result, coupon: filtered } : null;
  }
  if (typeof first === "object" && first !== null && "line" in first && "market" in first) {
    const filtered = filterStatisticCouponForLive(coupon as GeneratedStatisticCoupon, liveStates);
    return filtered ? { ...result, coupon: filtered } : null;
  }
  // Combinaisons de buteurs : non évaluables sur le score live, conservées telles quelles.
  return result;
}

const LIVE_EVENTS_EXHAUSTED_ERROR =
  "All live events for these matches are already decided, lost or unreachable. Try other matches or markets.";

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
  if (mode === "safe" || mode === "auto" || mode === "statistic" || mode === "scorer") {
    if (typeof payload.from !== "string" || !isIsoDate(payload.from)
      || typeof payload.count !== "number" || !Number.isInteger(payload.count)
      || payload.count < 1 || payload.count > 20) {
      return NextResponse.json(
        { error: "Provide a valid start date and an event count between 1 and 20." },
        { status: 400 }
      );
    }
    if (payload.randomSelection !== undefined && typeof payload.randomSelection !== "boolean") {
      return NextResponse.json({ error: "Provide a valid random selection option." }, { status: 400 });
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

    // Application du quota côté serveur (source de vérité).
    const guard = await enforceCombinationQuota(request);
    if ("response" in guard) return guard.response;
    const { context } = guard;

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

      // Une génération réussie consomme une unité du quota du jour.
      let result: Record<string, unknown>;
      if (mode === "statistic") {
        if (market === "scorers") {
          result = { coupon: await generateFotMobScorerCoupon(
            uniqueFixtures,
            payload.count,
            excludeFixtureIds,
            payload.randomSelection === true
          ) };
        } else {
          result = { coupon: await generateFotMobStatisticCoupon(
            uniqueFixtures,
            riskLevel,
            market as StatisticMarket,
            payload.count,
            excludeFixtureIds,
            payload.randomSelection === true
          ) };
        }
      } else if (mode === "scorer") {
        result = { coupon: await generateFotMobScorerCoupon(
          uniqueFixtures,
          payload.count,
          excludeFixtureIds,
          payload.randomSelection === true
        ) };
      } else if (mode === "safe") {
        result = await suggestFotMobSafeCoupon(
          uniqueFixtures,
          payload.count,
          [],
          payload.randomSelection === true
        );
      } else {
        result = await suggestFotMobCoupon(
          uniqueFixtures,
          payload.count,
          riskLevel,
          excludeFixtureIds,
          payload.randomSelection === true
        );
      }

      // En direct : on ne propose que des événements encore ouverts.
      const liveStates = await loadLiveMatchStates(uniqueFixtures);
      const filteredResult = filterLiveResult(result, liveStates);
      if (!filteredResult) {
        return NextResponse.json({ error: LIVE_EVENTS_EXHAUSTED_ERROR }, { status: 422 });
      }
      result = filteredResult;

      const entitlements = await commitCombinationUsage(context, 1);
      return applyQuotaCookie(
        NextResponse.json({ ...result, entitlements }),
        context
      );
    } catch (error) {
      console.error("Coupon suggestion failed.", error);
      const message = error instanceof Error ? error.message : "Unable to suggest a coupon.";
      return NextResponse.json({ error: message }, { status: errorStatus(error) });
    }
  }

  if (!Array.isArray(payload.fixtureIds) || payload.fixtureIds.length < 1 || payload.fixtureIds.length > 20
    || !payload.fixtureIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 128)) {
    return NextResponse.json({ error: "Choose between 1 and 20 live or upcoming fixtures." }, { status: 400 });
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

  // Application du quota côté serveur (source de vérité).
  const guard = await enforceCombinationQuota(request);
  if ("response" in guard) return guard.response;
  const { context } = guard;

  try {
    const fixtures: Fixture[] = await loadFixturesFromFotMobByIds(fixtureIds);
    if (fixtures.length !== fixtureIds.length) {
      return NextResponse.json({ error: "One or more fixtures were not found." }, { status: 404 });
    }
    const today = new Date().toISOString().slice(0, 10);
    // Combinaisons possibles sur un match en direct OU un match à venir planifié.
    const isIneligible = (fixture: Fixture) =>
      fixture.status !== "En direct" && (fixture.date < today || fixture.status !== "Prévu");
    if (fixtures.some(isIneligible)) {
      return NextResponse.json(
        { error: "Combinations can only be suggested for live or upcoming scheduled fixtures." },
        { status: 400 }
      );
    }
    const coupons = await generateFotMobCoupons(fixtures, riskLevel, couponCount, regenerate);
    // En direct : on ne propose que des événements encore ouverts (score live,
    // durée restante et statistiques en cours), jamais déjà gagnés ou perdus.
    const liveStates = await loadLiveMatchStates(fixtures);
    const openCoupons = liveStates.size > 0
      ? coupons
        .map(coupon => filterCouponForLive(coupon, liveStates))
        .filter((coupon): coupon is GeneratedCoupon => coupon !== null)
      : coupons;
    if (openCoupons.length === 0) {
      return NextResponse.json({ error: LIVE_EVENTS_EXHAUSTED_ERROR }, { status: 422 });
    }
    // Une génération réussie consomme une unité du quota du jour.
    const entitlements = await commitCombinationUsage(context, 1);
    return applyQuotaCookie(NextResponse.json({ coupons: openCoupons, entitlements }), context);
  } catch (error) {
    console.error("Combination suggestion failed.", error);
    const message = error instanceof Error ? error.message : "Unable to suggest combinations.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
