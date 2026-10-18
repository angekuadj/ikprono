import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface MatchoraLiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  status: string;
  minute: string | null;
  score: string | null;
  kickoff: number;
  embedUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  try {
    const response = await fetch("https://matchora.to/api/v1/live", {
      headers: { Accept: "application/json" },
      next: { revalidate: 20 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`Matchora returned HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.events)) {
      throw new Error("Matchora returned an invalid live matches response.");
    }

    const matches: MatchoraLiveMatch[] = payload.events.flatMap(event => {
      if (!isRecord(event)
        || event.sport !== "Soccer"
        || event.live !== true
        || event.finished === true
        || typeof event.channel_count !== "number"
        || event.channel_count < 1
        || typeof event.id !== "string"
        || !/^[a-zA-Z0-9-]{1,64}$/.test(event.id)
        || typeof event.home !== "string"
        || !event.home.trim()
        || typeof event.away !== "string"
        || !event.away.trim()
        || typeof event.league !== "string"
        || typeof event.kickoff !== "number"
        || !Number.isFinite(event.kickoff)) {
        return [];
      }

      return [{
        id: event.id,
        homeTeam: event.home.trim(),
        awayTeam: event.away.trim(),
        league: event.league.trim(),
        status: typeof event.status === "string" ? event.status : "LIVE",
        minute: typeof event.minute === "string" ? event.minute : null,
        score: typeof event.score === "string" ? event.score : null,
        kickoff: event.kickoff,
        embedUrl: `https://matchora.to/embed/match/${encodeURIComponent(event.id)}`,
      }];
    });

    return NextResponse.json({ matches }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not load Matchora live matches.", error);
    return NextResponse.json(
      { error: "La disponibilité du lecteur Matchora est temporairement indisponible." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
