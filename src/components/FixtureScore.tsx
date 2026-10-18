"use client";

import type { Fixture } from "@/lib/fixtures";
import { useFixtureStatuses } from "@/hooks/useFixtureStatuses";

export default function FixtureScore({ fixture }: { fixture: Fixture }) {
  const { fixturesById } = useFixtureStatuses([fixture.id]);
  const currentFixture = fixturesById[fixture.id] ?? fixture;
  const status = currentFixture.status?.trim().toLocaleLowerCase("fr-FR") ?? "";
  const isLive = status === "en live" || status === "mi-temps";

  return (
    <>
      {currentFixture.status && (
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
          isLive ? "bg-red-600 text-white" :
          status === "terminé" ? "bg-gray-700 text-gray-200" :
          "bg-gray-800 text-gray-300"
        }`}>
          {currentFixture.status}
        </span>
      )}

      <div className="my-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-center sm:gap-8">
        <h2 className="break-words text-lg font-bold sm:text-2xl">{currentFixture.homeTeam}</h2>
        <p className="whitespace-nowrap text-2xl font-bold sm:text-4xl">
          {currentFixture.score || "vs"}
        </p>
        <h2 className="break-words text-lg font-bold sm:text-2xl">{currentFixture.awayTeam}</h2>
      </div>

      <dl className="grid gap-4 border-t border-gray-800 pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Lieu</dt>
          <dd className="mt-1 font-medium">{currentFixture.location || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Compétition</dt>
          <dd className="mt-1 font-medium">{currentFixture.competition || currentFixture.league}</dd>
        </div>
        {currentFixture.homeScore !== undefined && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Score domicile</dt>
            <dd className="mt-1 font-medium">{currentFixture.homeScore}</dd>
          </div>
        )}
        {currentFixture.awayScore !== undefined && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">Score extérieur</dt>
            <dd className="mt-1 font-medium">{currentFixture.awayScore}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
