"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import type { Fixture } from "@/lib/fixtures";

export function useFixtureStatuses(ids: readonly string[], intervalMs?: number) {
  const { text } = useLanguage();
  const [refreshKey] = useAutoRefresh(intervalMs);
  const [fixturesById, setFixturesById] = useState<Record<string, Fixture>>({});
  const [error, setError] = useState("");
  const fixtureIdsKey = useMemo(
    () => JSON.stringify(Array.from(new Set(ids)).sort()),
    [ids]
  );

  useEffect(() => {
    const fixtureIds = JSON.parse(fixtureIdsKey) as string[];
    if (fixtureIds.length === 0) {
      setFixturesById({});
      setError("");
      return;
    }

    const controller = new AbortController();
    const loadStatuses = async () => {
      try {
        const updatedFixtures: Fixture[] = [];
        let unavailableCount = 0;
        for (let start = 0; start < fixtureIds.length; start += 50) {
          const params = new URLSearchParams();
          fixtureIds.slice(start, start + 50).forEach(id => params.append("id", id));
          const response = await fetch(`/api/sports/fixtures/status?${params.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          const payload = await response.json() as {
            fixtures?: Fixture[];
            error?: string;
            unavailableCount?: number;
            requestedCount?: number;
          };
          if (!response.ok || !Array.isArray(payload.fixtures)) {
            throw new Error(payload.error || "Unable to load updated fixture scores.");
          }
          updatedFixtures.push(...payload.fixtures);
          unavailableCount += payload.unavailableCount ?? 0;
        }
        setFixturesById(Object.fromEntries(updatedFixtures.map(fixture => [fixture.id, fixture])));
        setError(unavailableCount > 0
          ? text(
            `${unavailableCount} rencontre(s) sur ${fixtureIds.length} n’ont pas pu être actualisée(s). Les dernières données enregistrées restent affichées.`,
            `${unavailableCount} of ${fixtureIds.length} fixtures could not be refreshed. The last saved data remains visible.`
          )
          : "");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to load updated fixture scores.");
      }
    };

    void loadStatuses();
    return () => controller.abort();
  }, [fixtureIdsKey, refreshKey, text]);

  return { fixturesById, error };
}
