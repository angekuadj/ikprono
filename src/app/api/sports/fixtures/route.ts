import { NextRequest, NextResponse } from "next/server";
import type { Fixture, FixtureOption, FixtureSport } from "@/lib/fixtures";
import { FotMobDataUnavailableError, loadFotMobDay } from "@/lib/fotmob";

export const dynamic = "force-dynamic";

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

async function getCatalog(
  _kind: "countries" | "leagues" | "teams",
  _sport: FixtureSport
): Promise<FixtureOption[]> {
  return [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const catalogKind = searchParams.get("catalog");
  const sport = searchParams.get("sport") ?? "";

  if (catalogKind) {
    if (!["countries", "leagues", "teams"].includes(catalogKind)) {
      return NextResponse.json({ error: "Unsupported catalog type." }, { status: 400 });
    }
    try {
      const options = await getCatalog(
        catalogKind as "countries" | "leagues" | "teams",
        sport as FixtureSport
      );
      return NextResponse.json({ options });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load sports catalog.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? from;
  const selectedSport = searchParams.get("sport") ?? "all";

  if (!isDate(from) || !isDate(to)) {
    return NextResponse.json(
      { error: "Provide valid from and to dates in YYYY-MM-DD format." },
      { status: 400 }
    );
  }

  if (selectedSport !== "all" && selectedSport !== "football") {
    return NextResponse.json({ error: "Unsupported sport. Match data is available for football only." }, { status: 400 });
  }

  try {
    if (to < from) {
      return NextResponse.json({ error: "The end date must be on or after the start date." }, { status: 400 });
    }
    const first = new Date(`${from}T00:00:00.000Z`);
    const last = new Date(`${to}T00:00:00.000Z`);
    const dayCount = Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
    if (dayCount > 31) {
      return NextResponse.json({ error: "Date ranges are limited to 31 days." }, { status: 422 });
    }
    const days = [];
    const dayErrors: string[] = [];
    for (let offset = 0; offset < dayCount; offset += 4) {
      const batch = Array.from({ length: Math.min(4, dayCount - offset) }, (_, index) =>
        new Date(first.getTime() + (offset + index) * 86_400_000).toISOString().slice(0, 10)
      );
      const results = await Promise.all(batch.map(async date => {
        try {
          return await loadFotMobDay(date);
        } catch (error) {
          // Une journée injoignable n'empêche pas d'afficher les autres.
          console.error(`Could not load fixtures for ${date}.`, error);
          dayErrors.push(date);
          return null;
        }
      }));
      days.push(...results.filter((day): day is NonNullable<typeof day> => day !== null));
    }
    if (days.length === 0 && dayErrors.length > 0) {
      throw new FotMobDataUnavailableError();
    }
    const fixtures = days.flatMap(day => day.fixtures);

    fixtures.sort((first, second) =>
      `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`)
    );

    const cachedDays = days.filter(day => day.source === "cache");
    return NextResponse.json({
      fixtures,
      errors: dayErrors.length > 0
        ? { football: `Some fixture days could not be loaded from the data service (${dayErrors.join(", ")}).` }
        : {},
      source: cachedDays.length > 0 ? "cache" : "fotmob",
      ...(cachedDays.length > 0
        ? {
          cachedAt: cachedDays
            .map(day => day.cachedAt)
            .filter((timestamp): timestamp is string => timestamp !== undefined)
            .sort()
            .at(-1),
          warning: "Le service est indisponible. Les dernières données sauvegardées dans PostgreSQL sont affichées et peuvent être obsolètes.",
        }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load fixtures.";
    const code = error instanceof FotMobDataUnavailableError ? error.code : undefined;
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status: 502 }
    );
  }
}
