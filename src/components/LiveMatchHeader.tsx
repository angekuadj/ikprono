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
    <section className="match-scoreboard mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-8">
      <div className="match-scoreboard-meta">
        <div className="min-w-0">
          <p className="match-sport-label">Football <span aria-hidden="true">·</span> {fixture.league}</p>
          <p className="mt-1 text-sm text-gray-400">{matchDate} · {fixture.time}</p>
        </div>
        <span className={`match-status ${isLiveStatus(currentFixture.status) ? "is-live" : ""}`}>
          {currentFixture.liveDisplay || currentFixture.status || "À venir"}
        </span>
      </div>

      <div className="match-scoreboard-teams">
        <div className="match-team">
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
          <h1 className="match-team-name">{currentFixture.homeTeam}</h1>
          {renderCards("home")}
        </div>
        <div className="match-score">
          <div className="match-score-numbers">
            {currentFixture.homeScore ?? '-'} - {currentFixture.awayScore ?? '-'}
          </div>
          <span className="match-score-caption">
            {isLiveStatus(currentFixture.status) ? "Score en direct" : "Coup d’envoi"}
          </span>
        </div>
        <div className="match-team">
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
          <h2 className="match-team-name">{currentFixture.awayTeam}</h2>
          {renderCards("away")}
        </div>
      </div>
    </section>
  );
}
