"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useNotifications } from "@/context/NotificationContext";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";
import {
  readLiveNotificationFixtures,
  subscribeToLiveNotificationFixtures,
  writeLiveNotificationFixtures,
} from "@/lib/liveFixtureNotifications";
import type { Fixture } from "@/lib/fixtures";

function scoreOf(fixture: Fixture): string {
  return fixture.score
    || (fixture.homeScore !== undefined || fixture.awayScore !== undefined
      ? `${fixture.homeScore ?? "-"} - ${fixture.awayScore ?? "-"}`
      : "");
}

function isFinished(fixture: Fixture): boolean {
  return /^(termin[eé]|finished|full time|ft|aet|pen)$/i.test(fixture.status?.trim() ?? "");
}

export default function LiveFixtureNotificationWatcher() {
  const { text } = useLanguage();
  const { addNotification } = useNotifications();
  const [trackedFixtures, setTrackedFixtures] = useState<Fixture[]>([]);
  const trackedIds = useMemo(
    () => trackedFixtures.filter(fixture => !isFinished(fixture)).map(fixture => fixture.id),
    [trackedFixtures]
  );
  const { fixturesById } = useFixtureStatuses(trackedIds);

  useEffect(() => {
    const syncTrackedFixtures = () => {
      try {
        setTrackedFixtures(readLiveNotificationFixtures());
      } catch (error) {
        console.error("Could not read live notification fixtures.", error);
      }
    };
    syncTrackedFixtures();
    return subscribeToLiveNotificationFixtures(syncTrackedFixtures);
  }, []);

  useEffect(() => {
    if (Object.keys(fixturesById).length === 0 || trackedFixtures.length === 0) return;

    let changed = false;
    const updated = trackedFixtures.map(previous => {
      const current = fixturesById[previous.id];
      if (!current) return previous;

      const previousScore = scoreOf(previous);
      const currentScore = scoreOf(current);
      const previousStatus = previous.status ?? "";
      const currentStatus = current.status ?? "";
      const scoreChanged = Boolean(previousScore && currentScore && previousScore !== currentScore);
      const started = !/^(en direct|mi-temps|live|in progress)$/i.test(previousStatus)
        && /^(en direct|mi-temps|live|in progress)$/i.test(currentStatus);
      const finished = !isFinished(previous) && isFinished(current);

      if (scoreChanged || started || finished) {
        const message = scoreChanged
          ? text(
            `${current.homeTeam} ${currentScore} ${current.awayTeam}`,
            `${current.homeTeam} ${currentScore} ${current.awayTeam}`
          )
          : started
            ? text(`${current.homeTeam} – ${current.awayTeam} a commencé.`, `${current.homeTeam} vs ${current.awayTeam} has started.`)
            : text(`${current.homeTeam} – ${current.awayTeam} est terminé (${currentScore || "score indisponible"}).`, `${current.homeTeam} vs ${current.awayTeam} has finished (${currentScore || "score unavailable"}).`);
        addNotification(message, scoreChanged ? "info" : "success", 7000);

        if ("Notification" in window && window.Notification.permission === "granted") {
          const notification = new window.Notification(
            text("Suivi de match", "Match update"),
            { body: message, tag: `ikprono-live-${current.id}` }
          );
          notification.onclick = () => {
            window.focus();
            window.location.href = `/match/${encodeURIComponent(current.id)}`;
          };
        }
      }

      if (
        previousScore !== currentScore
        || previousStatus !== currentStatus
        || previous.liveDisplay !== current.liveDisplay
      ) {
        changed = true;
      }
      return { ...previous, ...current };
    });

    if (changed) {
      try {
        writeLiveNotificationFixtures(updated);
      } catch (error) {
        console.error("Could not save updated live notification fixtures.", error);
      }
    }
  }, [addNotification, fixturesById, text, trackedFixtures]);

  return null;
}
