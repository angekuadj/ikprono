import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

/**
 * Domaines officiels de Matchora, du plus récent au plus ancien. Le service
 * change régulièrement de domaine : on peut en forcer un via
 * `MATCHORA_BASE_URL`, sinon on essaie les domaines connus dans l'ordre.
 * Voir https://matchora.link/ pour la liste officielle à jour.
 */
function matchoraBaseUrls(): string[] {
  const configured = process.env.MATCHORA_BASE_URL?.trim();
  const candidates = [
    configured,
    "https://matchora.pro",
    "https://matchora.to",
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return [...new Set(candidates.map(value => value.replace(/\/+$/, "")))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadCachedMatches(): MatchoraLiveMatch[] {
  try {
    const cachePath = path.join(process.cwd(), ".next/cache/fetch-cache/7aac18bed87c95a04eaffb4b3d2b2f7058a183a226e5b2cc71efb8ee6b57017b");
    const raw = fs.readFileSync(cachePath, "utf8");
    // Cache is JSON with body containing base64/escaped JSON
    const start = raw.indexOf('"body"');
    if (start < 0) return [];
    const bodyStart = raw.indexOf('"', start + 7);
    if (bodyStart < 0) return [];
    // find the string content
    let i = bodyStart + 1;
    let out = "";
    while (i < raw.length) {
      const ch = raw[i];
      if (ch === '\\' && i + 1 < raw.length) {
        const n = raw[i + 1];
        if (n === 'n') { out += '\n'; i += 2; continue; }
        if (n === 'r') { out += '\r'; i += 2; continue; }
        if (n === 't') { out += '\t'; i += 2; continue; }
        if (n === '"') { out += '"'; i += 2; continue; }
        if (n === '\\') { out += '\\'; i += 2; continue; }
        if (n === '/') { out += '/'; i += 2; continue; }
        if (n === 'u' && i + 5 < raw.length) {
          out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        i += 2;
        continue;
      }
      if (ch === '"') break;
      out += ch;
      i++;
    }
    // body is base64 in the cached form
    try {
      const decoded = Buffer.from(out, 'base64').toString('utf8');
      const payload = JSON.parse(decoded) as { events?: unknown[] };
      if (Array.isArray(payload.events)) {
        return (payload.events as Record<string, unknown>[])
          .filter(e => e.sport === 'Soccer' && e.live === true && e.finished !== true && typeof e.channel_count === 'number' && e.channel_count >= 1 && typeof e.id === 'string' && typeof e.home === 'string' && typeof e.away === 'string' && typeof e.league === 'string' && typeof e.kickoff === 'number')
          .map(e => ({
            id: String(e.id),
            homeTeam: String(e.home).trim(),
            awayTeam: String(e.away).trim(),
            league: String(e.league).trim(),
            status: typeof e.status === 'string' ? e.status : 'LIVE',
            minute: typeof e.minute === 'string' ? e.minute : null,
            score: typeof e.score === 'string' ? e.score : null,
            kickoff: Number(e.kickoff),
            embedUrl: `https://matchora.to/embed/match/${encodeURIComponent(String(e.id))}`,
          }));
      }
    } catch {}
  } catch {}
  return [];
}

async function loadLiveMatches(baseUrl: string): Promise<MatchoraLiveMatch[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch(`${baseUrl}/api/v1/live`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${baseUrl}/`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Matchora returned HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.events)) {
      throw new Error("Matchora returned an invalid live matches response.");
    }

    return payload.events.flatMap(event => {
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
        embedUrl: `${baseUrl}/embed/match/${encodeURIComponent(event.id)}`,
      }];
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const baseUrls = matchoraBaseUrls();
  const results = await Promise.allSettled(
    baseUrls.map(async baseUrl => ({
      baseUrl,
      matches: await loadLiveMatches(baseUrl),
    }))
  );

  const success = results.find(
    (result): result is PromiseFulfilledResult<{ baseUrl: string; matches: MatchoraLiveMatch[] }> =>
      result.status === "fulfilled" && result.value.matches.length > 0
  );
  if (success) {
    return NextResponse.json({ matches: success.value.matches, source: success.value.baseUrl }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cached = loadCachedMatches();
  if (cached.length > 0) {
    return NextResponse.json({ matches: cached, source: "cache" }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const errors = results
    .map((result, index) => {
      if (result.status === "fulfilled") return null;
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      return `${baseUrls[index]}: ${reason}`;
    })
    .filter((message): message is string => message !== null);
  console.error("Could not load Matchora live matches.", errors.join(" | "));
  return NextResponse.json(
    {
      error: "Le lecteur vidéo en direct est temporairement indisponible.",
      detail: "Aucun domaine Matchora ne répond pour le moment.",
    },
    { status: 502, headers: { "Cache-Control": "no-store" } }
  );
}
