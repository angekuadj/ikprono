"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import type { Fixture } from "@/lib/fixtures";

const LIVE_REFRESH_INTERVAL_MS = 20_000;
const IDLE_REFRESH_INTERVAL_MS = 60_000;

function isLiveStatus(status?: string): boolean {
  const normalized = status?.trim().toLocaleLowerCase("fr-FR") ?? "";
  return normalized === "en direct" || normalized === "mi-temps";
}

export default function LiveMatchHeader({
  fixture,
  matchDate,
}: {
  fixture: Fixture;
  matchDate: string;
}) {
  const [refreshInterval, setRefreshInterval] = useState(() =>
    isLiveStatus(fixture.status) ? LIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS
  );
  const { fixturesById } = useFixtureStatuses([fixture.id], refreshInterval);
  const currentFixture = fixturesById[fixture.id] ?? fixture;

  useEffect(() => {
    setRefreshInterval(
      isLiveStatus(currentFixture.status) ? LIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS
    );
  }, [currentFixture.status]);

  const renderCards = (side: "home" | "away") => {
    const cards = currentFixture.matchCards;
    if (!cards) return null;
    const { yellow, red } = cards[side];
    if (yellow === 0 && red === 0) return null;
    return (
      <p className="mt-2 flex items-center justify-center gap-3 text-sm">
        {yellow > 0 && (
          <span className="inline-flex items-center gap-1" title={`${yellow} carton(s) jaune(s)`}>
            <span aria-hidden>🟨</span>
            <span className="font-bold text-yellow-400">{yellow}</span>
          </span>
        )}
        {red > 0 && (
          <span className="inline-flex items-center gap-1" title={`${red} carton(s) rouge(s)`}>
            <span aria-hidden>🟥</span>
            <span className="font-bold text-red-400">{red}</span>
          </span>
        )}
      </p>
    );
  };

  return (
    <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-400">Football</p>
          <h1 className="mt-2 text-lg font-semibold">{fixture.league}</h1>
          <p className="mt-1 text-sm text-gray-400">{matchDate} · {fixture.time}</p>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 sm:gap-8">
        <div className="flex-1 text-center">
          {currentFixture.homeImageUrl && (
            <Image
              src={currentFixture.homeImageUrl}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="mx-auto mb-3 h-14 w-14 object-contain sm:h-16 sm:w-16"
            />
          )}
          <h2 className="text-xl font-bold sm:text-2xl">{currentFixture.homeTeam}</h2>
          {renderCards("home")}
        </div>
        <div className="flex-shrink-0 text-center">
          <div className="text-4xl font-bold sm:text-5xl">
            {currentFixture.homeScore ?? '-'} - {currentFixture.awayScore ?? '-'}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {currentFixture.liveDisplay || currentFixture.status || 'À venir'}
          </p>
        </div>
        <div className="flex-1 text-center">
          {currentFixture.awayImageUrl && (
            <Image
              src={currentFixture.awayImageUrl}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="mx-auto mb-3 h-14 w-14 object-contain sm:h-16 sm:w-16"
            />
          )}
          <h2 className="text-xl font-bold sm:text-2xl">{currentFixture.awayTeam}</h2>
          {renderCards("away")}
        </div>
      </div>
    </section>
  );
}
