import { NextRequest, NextResponse } from "next/server";
import { loadFotMobDetails } from "@/lib/fotmob";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { matchId: string } }
) {
  if (!/^\d{1,20}$/.test(params.matchId)) {
    return NextResponse.json({ error: "Provide a valid FotMob match ID." }, { status: 400 });
  }

  try {
    const details = await loadFotMobDetails(params.matchId);
    const { fixture } = details;
    const stats = Array.from(details.stats, ([title, values]) => ({ title, ...values }));
    return NextResponse.json({
      match: {
        id: fixture.id,
        leagueName: fixture.league,
        home: {
          name: fixture.homeTeam,
          score: fixture.homeScore === undefined ? null : Number(fixture.homeScore),
          ...(details.homeImageUrl ? { imageUrl: details.homeImageUrl } : {}),
        },
        away: {
          name: fixture.awayTeam,
          score: fixture.awayScore === undefined ? null : Number(fixture.awayScore),
          ...(details.awayImageUrl ? { imageUrl: details.awayImageUrl } : {}),
        },
        status: {
          score: fixture.score ?? "—",
          label: fixture.status ?? "Prévu",
          started: fixture.status === "En direct" || fixture.status === "Terminé",
          finished: fixture.status === "Terminé",
          live: fixture.status === "En direct",
        },
        events: details.events.map(event => ({
          type: event.type,
          time: String(event.minute),
          description: `${event.player}${event.detail ? ` ${event.detail}` : ""}`,
          isHome: event.side === undefined ? null : event.side === "home",
        })),
        comments: details.comments,
        ...(details.recap ? { recap: details.recap } : {}),
        momentum: details.momentum,
        stats,
        lineup: {
          type: details.lineupType,
          home: {
            formation: details.homeFormation,
            starters: details.homeLineup.map(player => ({
              name: player.name,
              shirtNumber: String(player.number),
              position: player.position,
              ...(player.imageUrl ? { imageUrl: player.imageUrl } : {}),
              ...(player.x === undefined ? {} : { x: player.x }),
              ...(player.y === undefined ? {} : { y: player.y }),
              ...(player.rating === undefined ? {} : { rating: Number(player.rating) }),
            })),
            subs: details.homeSubstitutes.map(player => ({
              name: player.name,
              shirtNumber: String(player.number),
              position: player.position,
              ...(player.rating === undefined ? {} : { rating: Number(player.rating) }),
            })),
            unavailable: details.homeUnavailablePlayers,
          },
          away: {
            formation: details.awayFormation,
            starters: details.awayLineup.map(player => ({
              name: player.name,
              shirtNumber: String(player.number),
              position: player.position,
              ...(player.imageUrl ? { imageUrl: player.imageUrl } : {}),
              ...(player.x === undefined ? {} : { x: player.x }),
              ...(player.y === undefined ? {} : { y: player.y }),
              ...(player.rating === undefined ? {} : { rating: Number(player.rating) }),
            })),
            subs: details.awaySubstitutes.map(player => ({
              name: player.name,
              shirtNumber: String(player.number),
              position: player.position,
              ...(player.rating === undefined ? {} : { rating: Number(player.rating) }),
            })),
            unavailable: details.awayUnavailablePlayers,
          },
        },
        source: details.source,
        ...(details.cachedAt ? { cachedAt: details.cachedAt } : {}),
      },
    });
  } catch (error) {
    console.error(`FotMob match details request failed for ${params.matchId}.`, error);
    const message = error instanceof Error ? error.message : "Unable to load FotMob match details.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
