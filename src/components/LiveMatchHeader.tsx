"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import type { Fixture } from "@/lib/fixtures";

const LIVE_REFRESH_INTERVAL_MS = 20_000;
const IDLE_REFRESH_INTERVAL_MS = 60_000;
const SCORE_FLASH_DURATION_MS = 2_000;

function parseScore(fixture: Fixture): [number, number] | null {
  const home = Number(fixture.homeScore);
  const away = Number(fixture.awayScore);
  if (
    fixture.homeScore !== undefined &&
    fixture.awayScore !== undefined &&
    Number.isInteger(home) &&
    Number.isInteger(away) &&
    home >= 0 &&
    away >= 0
  ) {
    return [home, away];
  }
  const match = fixture.score?.match(/^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

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
  const [highlightedScoreSides, setHighlightedScoreSides] = useState<Array<"home" | "away">>([]);
  const scoreFlashTimeout = useRef<number | null>(null);
  const { fixturesById } = useFixtureStatuses([fixture.id], refreshInterval);
  const currentFixture = fixturesById[fixture.id] ?? fixture;
  const currentScore = parseScore(currentFixture);
  const currentScoreKey = currentScore ? `${currentScore[0]}-${currentScore[1]}` : "";

  useEffect(() => {
    setRefreshInterval(
      isLiveStatus(currentFixture.status) ? LIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS
    );
  }, [currentFixture.status]);

  useEffect(() => {
    const currentScoreMatch = currentScoreKey.match(/^(\d+)-(\d+)$/);
    if (!currentScoreMatch) return;
    const currentHomeScore = Number(currentScoreMatch[1]);
    const currentAwayScore = Number(currentScoreMatch[2]);

    setHighlightedScoreSides([]);
    const storageKey = `ikprono:last-seen-score:${fixture.id}`;
    try {
      const previousScoreValue = window.localStorage.getItem(storageKey);
      const previousScoreMatch = previousScoreValue?.match(/^(\d+)-(\d+)$/);
      if (previousScoreMatch) {
        const previousHomeScore = Number(previousScoreMatch[1]);
        const previousAwayScore = Number(previousScoreMatch[2]);
        const updatedSides: Array<"home" | "away"> = [];
        if (currentHomeScore > previousHomeScore) updatedSides.push("home");
        if (currentAwayScore > previousAwayScore) updatedSides.push("away");
        if (updatedSides.length > 0) {
          setHighlightedScoreSides(updatedSides);
          if (scoreFlashTimeout.current !== null) {
            window.clearTimeout(scoreFlashTimeout.current);
          }
          scoreFlashTimeout.current = window.setTimeout(() => {
            setHighlightedScoreSides([]);
            scoreFlashTimeout.current = null;
          }, SCORE_FLASH_DURATION_MS);
        }
      }
      window.localStorage.setItem(storageKey, currentScoreKey);
    } catch (error) {
      console.error(`Could not track the last seen score for fixture ${fixture.id}.`, error);
    }

    return () => {
      if (scoreFlashTimeout.current !== null) {
        window.clearTimeout(scoreFlashTimeout.current);
        scoreFlashTimeout.current = null;
      }
    };
  }, [currentScoreKey, fixture.id]);

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
          <div className="match-score-numbers" aria-label={
            currentScore ? `${currentScore[0]} - ${currentScore[1]}` : undefined
          }>
            <span className={highlightedScoreSides.includes("home") ? "is-updated" : ""}>
              {currentScore?.[0] ?? "-"}
            </span>
            {" - "}
            <span className={highlightedScoreSides.includes("away") ? "is-updated" : ""}>
              {currentScore?.[1] ?? "-"}
            </span>
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
