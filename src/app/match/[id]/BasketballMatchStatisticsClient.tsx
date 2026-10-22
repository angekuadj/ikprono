"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useLanguage } from "@/context/LanguageContext";

const LIVE_REFRESH_INTERVAL_MS = 15_000;
const IDLE_REFRESH_INTERVAL_MS = 60_000;

interface BasketballPlayerStat {
  name: string;
  shortName?: string;
  number?: string;
  position?: string;
  imageUrl?: string;
  starter: boolean;
  didNotPlay: boolean;
  stats: Record<string, string>;
}

interface BasketballPlay {
  id: string;
  period: string;
  clock: string;
  text: string;
  type: string;
  side?: "home" | "away";
  homeScore?: number;
  awayScore?: number;
  scoringPlay: boolean;
  threePointShot: boolean;
}

interface BasketballInjury {
  name: string;
  status?: string;
  date?: string;
  type?: string;
  imageUrl?: string;
}

interface BasketballMatchStats {
  sport: "basketball";
  date: string;
  time: string;
  competition: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
  status: string;
  liveDisplay?: string;
  homeScore?: number;
  awayScore?: number;
  periodScores: { period: number; label: string; home: number | null; away: number | null }[];
  stats: { key: string; label: string; home: string; away: string }[];
  homePlayers: BasketballPlayerStat[];
  awayPlayers: BasketballPlayerStat[];
  playerStatKeys: { key: string; label: string }[];
  plays: BasketballPlay[];
  standings: {
    position: number;
    team: string;
    played: number;
    won: number;
    lost: number;
    points: number;
    winPercentage?: number;
    gamesBehind?: number;
    streak?: number;
  }[];
  homeInjuries: BasketballInjury[];
  awayInjuries: BasketballInjury[];
  venue?: string;
  attendance?: number;
  officials: string[];
  records: { home?: string; away?: string };
  availableStats: string[];
  source: "espn" | "cache";
  cachedAt?: string;
  error?: string;
}

function isLiveStatus(status?: string): boolean {
  return (status ?? "").trim() === "En direct";
}

function numeric(value?: string): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BasketballMatchStatisticsClient({ fixtureId }: { fixtureId: string }) {
  const { language, text } = useLanguage();
  const [stats, setStats] = useState<BasketballMatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const response = await fetch(
        `/api/sports/fixtures/basketball/${encodeURIComponent(fixtureId)}/statistics`,
        { cache: "no-store" }
      );
      const payload = await response.json() as BasketballMatchStats & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || text(
          "Impossible de charger les détails du match.",
          "Unable to load the match details."
        ));
      }
      setStats(payload);
      setError(null);
    } catch (cause) {
      if (silent) {
        // En cas d'échec d'actualisation silencieuse, les dernières données restent affichées.
        console.error("Silent basketball stats refresh failed:", cause);
      } else {
        setError(cause instanceof Error ? cause.message : text(
          "Erreur de connexion",
          "Connection error"
        ));
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [fixtureId, text]);

  useEffect(() => {
    void fetchMatchStats();
  }, [fetchMatchStats]);

  const isLiveMatch = isLiveStatus(stats?.status);
  const [refreshKey] = useAutoRefresh(isLiveMatch ? LIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS);

  useEffect(() => {
    if (refreshKey === 0) return; // premier rendu : déjà chargé par l'effet dédié
    void fetchMatchStats(true);
  }, [refreshKey, fetchMatchStats]);

  if (isLoading) {
    return (
      <div className="mt-6 flex items-center justify-center rounded-2xl border border-gray-800 bg-gray-900 p-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
        <p className="text-red-400">{error || text("Données non disponibles", "Data unavailable")}</p>
      </div>
    );
  }

  const locale = language === "fr" ? "fr-FR" : "en-GB";
  const statusLabel = stats.liveDisplay || stats.status;
  const periodColumns = stats.periodScores;

  const renderTeamTable = (
    players: BasketballPlayerStat[],
    teamName: string,
    side: "home" | "away"
  ) => {
    if (players.length === 0) return null;
    return (
      <div className="overflow-x-auto">
        <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
          {side === "home" ? stats.homeImageUrl && (
            <Image src={stats.homeImageUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
          ) : stats.awayImageUrl && (
            <Image src={stats.awayImageUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
          )}
          {teamName}
        </h4>
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="py-2 pr-2 text-left font-semibold">
                {text("Joueur", "Player")}
              </th>
              {stats.playerStatKeys.map(key => (
                <th key={key.key} className="px-2 py-2 text-center font-semibold">{key.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr
                key={`${player.name}-${index}`}
                className={`border-b border-gray-800 ${player.starter ? "bg-gray-800/30" : ""}`}
              >
                <td className="py-2 pr-2 text-left">
                  <span className="flex items-center gap-2">
                    {player.imageUrl ? (
                      <Image
                        src={player.imageUrl}
                        alt=""
                        width={24}
                        height={24}
                        unoptimized
                        className="h-6 w-6 shrink-0 rounded-full bg-gray-800 object-cover"
                      />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full bg-gray-800" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-white">
                        {player.number ? `#${player.number} ` : ""}{player.name}
                      </span>
                      {player.position && (
                        <span className="block text-[10px] uppercase text-gray-500">{player.position}</span>
                      )}
                    </span>
                  </span>
                </td>
                {stats.playerStatKeys.map(key => (
                  <td key={key.key} className="px-2 py-2 text-center text-gray-200">
                    {player.didNotPlay && !player.stats[key.key] ? "—" : (player.stats[key.key] || "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="match-details mt-6 space-y-6">
      {stats.source === "cache" && (
        <p role="status" className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
          {text(
            "Le flux live est indisponible. Les dernières données sont affichées et peuvent être obsolètes ; veuillez réessayer plus tard.",
            "The live feed is unavailable. The last saved data is shown and may be outdated; please try again later."
          )}
          {stats.cachedAt && (
            <span className="ml-1">{new Date(stats.cachedAt).toLocaleString(locale)}</span>
          )}
        </p>
      )}

      <section
        className="rounded-2xl border border-gray-800 bg-gray-900 p-5"
        aria-label={text("Résumé de la rencontre", "Match overview")}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">{stats.competition}</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isLiveMatch ? "bg-red-600 text-white" : "bg-gray-800 text-gray-300"
          }`}>
            {statusLabel}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="text-center">
            {stats.homeImageUrl && (
              <Image
                src={stats.homeImageUrl}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="mx-auto mb-2 h-12 w-12 object-contain"
              />
            )}
            <p className="break-words text-sm font-semibold text-white">{stats.homeTeam}</p>
            {stats.records.home && (
              <p className="mt-0.5 text-xs text-gray-500">{stats.records.home}</p>
            )}
          </div>
          <div className="text-center">
            <p className="whitespace-nowrap text-3xl font-bold text-white">
              {stats.homeScore ?? "-"} <span className="text-gray-500">-</span> {stats.awayScore ?? "-"}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(`${stats.date}T12:00:00.000Z`).toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {" · "}
              {stats.time}
            </p>
          </div>
          <div className="text-center">
            {stats.awayImageUrl && (
              <Image
                src={stats.awayImageUrl}
                alt=""
                width={56}
                height={56}
                unoptimized
                className="mx-auto mb-2 h-12 w-12 object-contain"
              />
            )}
            <p className="break-words text-sm font-semibold text-white">{stats.awayTeam}</p>
            {stats.records.away && (
              <p className="mt-0.5 text-xs text-gray-500">{stats.records.away}</p>
            )}
          </div>
        </div>

        {(stats.venue || stats.attendance !== undefined) && (
          <p className="mt-4 text-center text-xs text-gray-500">
            {stats.venue}
            {stats.venue && stats.attendance !== undefined ? " · " : ""}
            {stats.attendance !== undefined
              ? text(`${stats.attendance} spectateurs`, `${stats.attendance} attendance`)
              : ""}
          </p>
        )}
      </section>

      {periodColumns.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-3 text-lg font-bold text-white">
            {text("Score par quart-temps", "Score by quarter")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-2 pr-2 text-left font-semibold">{text("Équipe", "Team")}</th>
                  {periodColumns.map(column => (
                    <th key={column.period} className="px-3 py-2 text-center font-semibold">{column.label}</th>
                  ))}
                  <th className="px-3 py-2 text-center font-bold text-white">T</th>
                </tr>
              </thead>
              <tbody>
                {(["home", "away"] as const).map(side => (
                  <tr key={side} className="border-b border-gray-800">
                    <td className="py-2 pr-2 text-left font-medium text-white">
                      {side === "home" ? stats.homeTeam : stats.awayTeam}
                    </td>
                    {periodColumns.map(column => {
                      const value = column[side];
                      const better = (() => {
                        const mine = column[side];
                        const theirs = column[side === "home" ? "away" : "home"];
                        return mine !== null && theirs !== null && mine > theirs;
                      })();
                      return (
                        <td key={column.period} className={`px-3 py-2 text-center ${better ? "font-bold text-green-400" : "text-gray-200"}`}>
                          {value ?? "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-bold text-white">
                      {side === "home" ? stats.homeScore ?? "-" : stats.awayScore ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats.stats.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-4 text-lg font-bold text-white">
            {text("Statistiques des équipes", "Team statistics")}
          </h3>
          <div className="space-y-3">
            {stats.stats.map(stat => {
              const home = numeric(stat.home);
              const away = numeric(stat.away);
              const total = home + away;
              const homeShare = total > 0 ? (home / total) * 100 : 50;
              const homeLeads = home > away;
              const awayLeads = away > home;
              return (
                <div key={stat.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className={homeLeads ? "font-bold text-white" : "text-gray-300"}>{stat.home || "0"}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{stat.label}</span>
                    <span className={awayLeads ? "font-bold text-white" : "text-gray-300"}>{stat.away || "0"}</span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-800">
                    <div className={`h-full ${homeLeads ? "bg-green-500" : "bg-gray-600"}`} style={{ width: `${homeShare}%` }} />
                    <div className={`h-full ${awayLeads ? "bg-green-500" : "bg-gray-600"}`} style={{ width: `${100 - homeShare}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(stats.homePlayers.length > 0 || stats.awayPlayers.length > 0) && stats.playerStatKeys.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-4 text-lg font-bold text-white">
            {text("Statistiques des joueurs", "Player statistics")}
          </h3>
          <div className="space-y-6">
            {renderTeamTable(stats.homePlayers, stats.homeTeam, "home")}
            {renderTeamTable(stats.awayPlayers, stats.awayTeam, "away")}
          </div>
        </section>
      )}

      {stats.plays.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-4 text-lg font-bold text-white">
            {text("Déroulé du match", "Play-by-play")}
          </h3>
          <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {[...stats.plays].reverse().map((play, index) => (
              <li
                key={`${play.id}-${index}`}
                className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${
                  play.scoringPlay ? "bg-green-950/30" : "bg-gray-950/40"
                }`}
              >
                <span className="w-24 shrink-0 text-xs text-gray-500">
                  {play.period}
                  {play.clock ? ` · ${play.clock}` : ""}
                </span>
                <span className={`min-w-0 flex-1 ${play.scoringPlay ? "text-white" : "text-gray-300"}`}>
                  {play.threePointShot && <span className="mr-1" aria-hidden="true">🎯</span>}
                  {play.text || play.type}
                </span>
                {(play.homeScore !== undefined || play.awayScore !== undefined) && (
                  <span className="shrink-0 text-xs font-semibold text-gray-400">
                    {play.awayScore ?? 0} - {play.homeScore ?? 0}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(stats.homeInjuries.length > 0 || stats.awayInjuries.length > 0) && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-4 text-lg font-bold text-white">
            {text("Infirmerie", "Injuries")}
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            {([["home", stats.homeTeam, stats.homeInjuries], ["away", stats.awayTeam, stats.awayInjuries]] as const).map(
              ([side, teamName, injuries]) => injuries.length > 0 && (
                <div key={side}>
                  <h4 className="mb-2 text-sm font-bold text-white">{teamName}</h4>
                  <ul className="space-y-2">
                    {injuries.map((injury, index) => (
                      <li key={`${injury.name}-${index}`} className="flex items-center gap-2 text-sm">
                        {injury.imageUrl ? (
                          <Image src={injury.imageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 shrink-0 rounded-full bg-gray-800 object-cover" />
                        ) : (
                          <span className="h-6 w-6 shrink-0 rounded-full bg-gray-800" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-gray-200">{injury.name}</span>
                        {injury.status && (
                          <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] uppercase text-gray-300">
                            {injury.status}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {stats.standings.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-3 text-lg font-bold text-white">
            {text("Classement", "Standings")}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="py-2 pr-2 text-left font-semibold">#</th>
                  <th className="py-2 pr-2 text-left font-semibold">{text("Équipe", "Team")}</th>
                  <th className="px-2 py-2 text-center font-semibold">V</th>
                  <th className="px-2 py-2 text-center font-semibold">D</th>
                  <th className="px-2 py-2 text-center font-semibold">%</th>
                  <th className="px-2 py-2 text-center font-semibold">GB</th>
                  <th className="px-2 py-2 text-center font-semibold">{text("Série", "Streak")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.standings.map((standing, index) => (
                  <tr key={`${standing.team}-${index}`} className="border-b border-gray-800">
                    <td className="py-2 pr-2 text-gray-400">{standing.position || index + 1}</td>
                    <td className="py-2 pr-2 font-medium text-white">{standing.team}</td>
                    <td className="px-2 py-2 text-center text-gray-200">{standing.won}</td>
                    <td className="px-2 py-2 text-center text-gray-200">{standing.lost}</td>
                    <td className="px-2 py-2 text-center text-gray-200">
                      {standing.winPercentage !== undefined ? standing.winPercentage.toFixed(3).replace(/^0/, "") : "—"}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-200">
                      {standing.gamesBehind !== undefined ? (standing.gamesBehind === 0 ? "—" : standing.gamesBehind) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-200">
                      {standing.streak !== undefined
                        ? `${standing.streak > 0 ? "V" : "D"}${Math.abs(standing.streak)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats.officials.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-2 text-lg font-bold text-white">
            {text("Arbitres", "Officials")}
          </h3>
          <p className="text-sm text-gray-300">{stats.officials.join(", ")}</p>
        </section>
      )}

      {stats.periodScores.length === 0 && stats.stats.length === 0 && stats.plays.length === 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <p className="text-sm text-gray-400">
            {text(
              "Les statistiques détaillées ne sont pas encore disponibles pour cette rencontre. Les scores et statuts sont actualisés automatiquement.",
              "Detailed statistics are not available for this match yet. Scores and statuses refresh automatically."
            )}
          </p>
        </section>
      )}
    </div>
  );
}
