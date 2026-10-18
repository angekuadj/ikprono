"use client";

import { useState } from "react";
import type { FixtureHistory } from "@/lib/fotmob";

const INITIAL_MATCH_COUNT = 4;

function formatHistoryDate(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MatchHistory({ history }: { history: FixtureHistory }) {
  const [showAllConfrontations, setShowAllConfrontations] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(() => new Set());
  const confrontations = showAllConfrontations
    ? history.confrontations
    : history.confrontations.slice(0, INITIAL_MATCH_COUNT);

  const toggleTeamHistory = (team: string) => {
    setExpandedTeams(current => {
      const next = new Set(current);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  };

  return (
    <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-8" aria-labelledby="match-history-title">
      <h2 id="match-history-title" className="text-xl font-bold text-white sm:text-2xl">Historique</h2>

      <div className="mt-6">
        <h3 className="mb-3 text-base font-semibold text-green-400">Confrontations directes</h3>
        {history.confrontations.length === 0 ? (
          <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm text-gray-400">
            Aucune confrontation directe disponible.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {confrontations.map((match, index) => (
                <li key={`${match.date}-${index}`} className="grid gap-2 rounded-lg border border-gray-800 bg-black/20 p-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center">
                  <time dateTime={match.date} className="text-xs text-gray-400">{formatHistoryDate(match.date)}</time>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-white">{match.homeTeam} <span className="text-gray-500">—</span> {match.awayTeam}</p>
                    {match.competition && <p className="mt-1 text-xs text-gray-500">{match.competition}</p>}
                  </div>
                  <span className="font-bold text-white sm:text-right">{match.score || "—"}</span>
                </li>
              ))}
            </ul>
            {history.confrontations.length > INITIAL_MATCH_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllConfrontations(current => !current)}
                aria-expanded={showAllConfrontations}
                className="mt-3 text-sm font-semibold text-green-400 hover:text-green-300"
              >
                {showAllConfrontations ? "Voir moins" : "Voir plus"}
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-base font-semibold text-green-400">Derniers matchs</h3>
        <div className="grid gap-5 lg:grid-cols-2">
          {history.recentMatches.map(teamHistory => {
            const isExpanded = expandedTeams.has(teamHistory.team);
            const matches = isExpanded
              ? teamHistory.matches
              : teamHistory.matches.slice(0, INITIAL_MATCH_COUNT);

            return (
              <section key={teamHistory.team} aria-label={`Derniers matchs de ${teamHistory.team}`}>
                <h4 className="mb-2 text-sm font-semibold text-white">{teamHistory.team}</h4>
                {teamHistory.matches.length === 0 ? (
                  <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm text-gray-400">
                    Aucun résultat récent disponible.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {matches.map((match, index) => (
                        <li key={`${match.date}-${index}`} className="grid gap-2 rounded-lg border border-gray-800 bg-black/20 p-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-center">
                          <time dateTime={match.date} className="text-xs text-gray-400">{formatHistoryDate(match.date)}</time>
                          <div className="min-w-0">
                            <p className="break-words text-sm text-white">{match.homeTeam} <span className="text-gray-500">—</span> {match.awayTeam}</p>
                            {match.competition && <p className="mt-1 text-xs text-gray-500">{match.competition}</p>}
                          </div>
                          <span className="font-bold text-white sm:text-right">{match.score || "—"}</span>
                        </li>
                      ))}
                    </ul>
                    {teamHistory.matches.length > INITIAL_MATCH_COUNT && (
                      <button
                        type="button"
                        onClick={() => toggleTeamHistory(teamHistory.team)}
                        aria-expanded={isExpanded}
                        className="mt-3 text-sm font-semibold text-green-400 hover:text-green-300"
                      >
                        {isExpanded ? "Voir moins" : "Voir plus"}
                      </button>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
