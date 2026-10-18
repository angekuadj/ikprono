import { NextRequest, NextResponse } from "next/server";
import { loadFotMobDay } from "@/lib/fotmob";

export const dynamic = "force-dynamic";

interface FotMobMatch {
  id: number;
  time: string;
  home: { name: string; score?: number };
  away: { name: string; score?: number };
  status: {
    started: boolean;
    finished: boolean;
    cancelled: boolean;
    scoreStr?: string;
    reason?: { short?: string; long?: string };
    liveTime?: {
      short?: string;
      long?: string;
      shortKey?: string;
      longKey?: string;
      basePeriod?: number;
      addedTime?: number;
    };
  };
}

interface FotMobLeague {
  id: number;
  name: string;
  matches: FotMobMatch[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalScore(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function parseMatch(value: unknown): FotMobMatch | null {
  if (!isRecord(value) || !isRecord(value.home) || !isRecord(value.away) || !isRecord(value.status)) {
    return null;
  }
  const { home, away, status } = value;
  const reason = isRecord(status.reason) ? status.reason : undefined;
  const liveTime = isRecord(status.liveTime) ? status.liveTime : undefined;
  const hasStarted = status.started === true || status.finished === true;

  if (
    typeof value.id !== "number" ||
    typeof value.time !== "string" ||
    typeof home.name !== "string" ||
    typeof away.name !== "string" ||
    typeof status.started !== "boolean" ||
    typeof status.finished !== "boolean" ||
    typeof status.cancelled !== "boolean" ||
    !isOptionalScore(home.score) ||
    !isOptionalScore(away.score) ||
    (status.scoreStr !== undefined && typeof status.scoreStr !== "string") ||
    (reason?.short !== undefined && typeof reason.short !== "string") ||
    (reason?.long !== undefined && typeof reason.long !== "string") ||
    (liveTime?.short !== undefined && typeof liveTime.short !== "string") ||
    (liveTime?.long !== undefined && typeof liveTime.long !== "string") ||
    (liveTime?.shortKey !== undefined && typeof liveTime.shortKey !== "string") ||
    (liveTime?.longKey !== undefined && typeof liveTime.longKey !== "string") ||
    (liveTime?.basePeriod !== undefined && (typeof liveTime.basePeriod !== "number" || !Number.isFinite(liveTime.basePeriod))) ||
    (liveTime?.addedTime !== undefined && (typeof liveTime.addedTime !== "number" || !Number.isFinite(liveTime.addedTime)))
  ) {
    return null;
  }

  return {
    id: value.id,
    time: value.time,
    home: { name: home.name, ...(hasStarted && home.score !== undefined ? { score: home.score } : {}) },
    away: { name: away.name, ...(hasStarted && away.score !== undefined ? { score: away.score } : {}) },
    status: {
      started: status.started,
      finished: status.finished,
      cancelled: status.cancelled,
      scoreStr: hasStarted ? status.scoreStr as string | undefined : undefined,
      reason: reason as FotMobMatch["status"]["reason"],
      liveTime: liveTime as FotMobMatch["status"]["liveTime"],
    },
  };
}

function parseDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value.replaceAll("-", "");
}

export async function GET(request: NextRequest) {
  const isoDate = request.nextUrl.searchParams.get("date") ?? "";
  const date = parseDate(isoDate);
  if (!date) {
    return NextResponse.json({ error: "Provide a valid date in YYYY-MM-DD format." }, { status: 400 });
  }

  try {
    const day = await loadFotMobDay(isoDate);
    const payload: unknown = day.response;
    if (!isRecord(payload) || !Array.isArray(payload.leagues)) {
      throw new Error("FotMob returned an invalid matches response.");
    }

    const leagues: FotMobLeague[] = payload.leagues.map(value => {
      if (
        !isRecord(value) ||
        typeof value.id !== "number" ||
        typeof value.name !== "string" ||
        !Array.isArray(value.matches)
      ) {
        throw new Error("FotMob returned an invalid league in the matches response.");
      }
      const matches = value.matches.map(parseMatch);
      if (matches.some(match => match === null)) {
        throw new Error(`FotMob returned invalid match data for ${value.name}.`);
      }
      return { id: value.id, name: value.name, matches: matches as FotMobMatch[] };
    });

    return NextResponse.json({
      date: isoDate,
      leagues,
      source: day.source,
      liveAvailable: day.source === "fotmob",
      ...(day.cachedAt ? { cachedAt: day.cachedAt } : {}),
      ...(day.source === "cache"
        ? { warning: "Le flux live FotMob est indisponible. Ces données en cache peuvent être obsolètes ; veuillez réessayer plus tard." }
        : {}),
    });
  } catch (error) {
    console.error("FotMob matches request failed.", error);
    const message = error instanceof Error ? error.message : "Unable to load matches from FotMob.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
