'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const LIVE_REFRESH_INTERVAL_MS = 15_000;
const IDLE_REFRESH_INTERVAL_MS = 60_000;

interface MatchStats {
  source?: "fotmob" | "cache";
  cachedAt?: string;
  coverageLevel?: string;
  availableStats: string[];
  date: string;
  competition: string;
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  homeForm: string;
  awayForm: string;
  events: Array<{
    minute: number | string;
    type: string;
    player: string;
    playerImageUrl?: string;
    detail?: string;
    side?: 'home' | 'away';
    playerIn?: string;
    playerInImageUrl?: string;
    playerOut?: string;
    playerOutImageUrl?: string;
    period?: 'halftime' | 'fulltime';
  }>;
  homeLineup: Array<{
    number: number;
    name: string;
    position: string;
    rating?: string;
    imageUrl?: string;
  }>;
  awayLineup: Array<{
    number: number;
    name: string;
    position: string;
    rating?: string;
    imageUrl?: string;
  }>;
  homeSubstitutes: Array<{
    number: number;
    name: string;
    position: string;
    rating?: string;
    imageUrl?: string;
  }>;
  topPlayers?: {
    home: Array<{ number?: number; name: string; position: string; rating?: string; imageUrl?: string }>;
    away: Array<{ number?: number; name: string; position: string; rating?: string; imageUrl?: string }>;
  };
  awaySubstitutes: Array<{
    number: number;
    name: string;
    position: string;
    rating?: string;
    imageUrl?: string;
  }>;
  possession: { home: number; away: number };
  expectedGoals: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  touchesInBox: { home: number; away: number };
  bigChances: { home: number; away: number };
  bigChancesMissed: { home: number; away: number };
  accuratePasses: { home: string; away: string };
  yellowCards: { home: number; away: number };
  corners: { home: number; away: number };
  shotsOffTarget: { home: number; away: number };
  blockedShots: { home: number; away: number };
  hitWoodwork: { home: number; away: number };
  shotsInsideBox: { home: number; away: number };
  shotsOutsideBox: { home: number; away: number };
  xgOpenPlay: { home: number; away: number };
  xgSetPlay: { home: number; away: number };
  xgNonPenalty: { home: number; away: number };
  xgOnTarget: { home: number; away: number };
  passes: { home: number; away: number };
  ownHalf: { home: number; away: number };
  oppositionHalf: { home: number; away: number };
  accurateLongBalls: { home: string; away: string };
  accurateCrosses: { home: string; away: string };
  throws: { home: number; away: number };
  offsides: { home: number; away: number };
  tackles: { home: number; away: number };
  interceptions: { home: number; away: number };
  blocks: { home: number; away: number };
  clearances: { home: number; away: number };
  keeperSaves: { home: number; away: number };
  duelsWon: { home: number; away: number };
  groundDuelsWon: { home: string; away: string };
  aerialDuelsWon: { home: string; away: string };
  successfulDribbles: { home: string; away: string };
  redCards: { home: number; away: number };
  foulsCommitted: { home: number; away: number };
  distanceCovered?: { home: number; away: number };
  runningDistance?: { home: number; away: number };
  sprintingDistance?: { home: number; away: number };
  numberOfSprints?: { home: number; away: number };
  headToHead: Array<{
    date: string;
    homeTeam: string;
    awayTeam: string;
    homeScore?: number | null;
    awayScore?: number | null;
    competition: string;
  }>;
  standings: Array<{
    position: number;
    team: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
    points: number;
  }>;
  odds: {
    homeWin: number;
    draw: number;
    awayWin: number;
  } | null;
}

const NUMERIC_SIDE_FIELDS = [
  'possession', 'expectedGoals', 'shots', 'shotsOnTarget', 'touchesInBox', 'bigChances',
  'bigChancesMissed', 'yellowCards', 'corners', 'shotsOffTarget', 'blockedShots', 'hitWoodwork',
  'shotsInsideBox', 'shotsOutsideBox', 'xgOpenPlay', 'xgSetPlay', 'xgNonPenalty', 'xgOnTarget',
  'passes', 'ownHalf', 'oppositionHalf', 'throws', 'offsides', 'tackles', 'interceptions', 'blocks',
  'clearances', 'keeperSaves', 'duelsWon', 'redCards', 'foulsCommitted',
] as const;

const STRING_SIDE_FIELDS = [
  'accuratePasses', 'accurateLongBalls', 'accurateCrosses', 'groundDuelsWon', 'aerialDuelsWon',
  'successfulDribbles',
] as const;

const INITIAL_H2H_COUNT = 5;

// Garantit que tous les champs utilisés par l'interface existent, même si l'API
// ne renvoie pas encore certaines statistiques (match sans aperçu détaillé).
function withStatDefaults(data: MatchStats): MatchStats {
  const stats = { ...data } as unknown as Record<string, unknown>;
  for (const field of NUMERIC_SIDE_FIELDS) {
    const value = stats[field] as { home?: number; away?: number } | undefined;
    stats[field] = { home: value?.home ?? 0, away: value?.away ?? 0 };
  }
  for (const field of STRING_SIDE_FIELDS) {
    const value = stats[field] as { home?: string; away?: string } | undefined;
    stats[field] = { home: value?.home ?? '-', away: value?.away ?? '-' };
  }
  stats.events = Array.isArray(stats.events) ? stats.events : [];
  stats.availableStats = Array.isArray(stats.availableStats) ? stats.availableStats : [];
  stats.homeForm = typeof stats.homeForm === 'string' ? stats.homeForm : '';
  stats.awayForm = typeof stats.awayForm === 'string' ? stats.awayForm : '';
  stats.homeLineup = Array.isArray(stats.homeLineup) ? stats.homeLineup : [];
  stats.awayLineup = Array.isArray(stats.awayLineup) ? stats.awayLineup : [];
  stats.homeSubstitutes = Array.isArray(stats.homeSubstitutes) ? stats.homeSubstitutes : [];
  stats.awaySubstitutes = Array.isArray(stats.awaySubstitutes) ? stats.awaySubstitutes : [];
  stats.headToHead = Array.isArray(stats.headToHead) ? stats.headToHead : [];
  stats.standings = Array.isArray(stats.standings) ? stats.standings : [];
  return stats as unknown as MatchStats;
}

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

function formatH2HDate(date: string): string {
  const iso = date.includes('T') ? date : `${date}T12:00:00.000Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function eventMinuteValue(minute: number | string): number {
  const match = String(minute).match(/(\d+)(?:\+(\d+))?/);
  return match ? Number(match[1]) * 100 + Number(match[2] ?? 0) : Number.MAX_SAFE_INTEGER;
}

function eventLabel(type: string, period?: 'halftime' | 'fulltime', detail?: string): string {
  if (period === 'halftime') return 'Mi-temps';
  if (period === 'fulltime') return 'Fin du match';
  if (type.replace(/[\s_-]/g, '').toLowerCase().includes('card')) {
    return detail?.toLowerCase().includes('red') ? 'Carton rouge' : 'Carton jaune';
  }
  const labels: Record<string, string> = {
    goal: 'But',
    card: 'Carton',
    substitution: 'Remplacement',
    comment: 'Temps fort',
    half: 'Fin de période',
    addedtime: 'Temps additionnel',
    missedpenalty: 'Penalty manqué',
  };
  return labels[type.replace(/[\s_-]/g, '').toLowerCase()] ?? type;
}

function eventIcon(type: string, detail?: string): string {
  const normalized = type.replace(/[\s_-]/g, '').toLowerCase();
  if (normalized === 'goal') return '⚽';
  if (normalized.includes('card')) return /red/i.test(`${type} ${detail ?? ''}`) ? '🟥' : '🟨';
  if (normalized === 'substitution') return '↕';
  if (normalized === 'missedpenalty') return '❌';
  if (normalized === 'half' || normalized === 'addedtime') return '⏱';
  return '•';
}

export default function MatchStatisticsClient({ fixtureId }: { fixtureId: string }) {
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resume' | 'lineups' | 'stats' | 'h2h'>('resume');
  const [showAllH2H, setShowAllH2H] = useState(false);

  const fetchMatchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const response = await fetch(`/api/football/fixtures/${fixtureId}/statistics`, {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        setStats(withStatDefaults(data as MatchStats));
        setError(null);
      } else if (!silent) {
        setError('Impossible de charger les détails du match');
      }
    } catch (err) {
      if (silent) {
        // En cas d'échec d'actualisation silencieuse, les dernières données restent affichées.
        console.error('Silent match stats refresh failed:', err);
      } else {
        setError('Erreur de connexion');
        console.error('Error fetching match stats:', err);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    fetchMatchStats();
  }, [fetchMatchStats]);

  // Actualisation automatique des données du match : plus fréquente pendant le direct.
  const statusKey = (stats?.status ?? '').trim().toLocaleLowerCase('fr-FR');
  const isLiveMatch = statusKey === 'en direct' || statusKey === 'mi-temps';
  const [refreshKey] = useAutoRefresh(isLiveMatch ? LIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS);

  useEffect(() => {
    if (refreshKey === 0) return; // premier rendu : déjà chargé par l'effet dédié
    void fetchMatchStats(true);
  }, [refreshKey, fetchMatchStats]);

  const renderForm = (form: string) => {
    const results = (form || '').split('').filter(result => ['W', 'D', 'L'].includes(result));
    if (results.length === 0) {
      return <p className="text-sm text-gray-500">Forme récente non disponible.</p>;
    }
    const resultLabels: Record<string, { abbreviation: string; label: string; className: string }> = {
      W: { abbreviation: 'V', label: 'Victoire', className: 'bg-green-600' },
      D: { abbreviation: 'N', label: 'Nul', className: 'bg-yellow-600' },
      L: { abbreviation: 'D', label: 'Défaite', className: 'bg-red-600' },
    };
    return (
      <div className="flex gap-1">
        {results.map((result, index) => {
          const display = resultLabels[result];
          return (
            <div
              key={index}
              title={display.label}
              aria-label={display.label}
              className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold ${display.className}`}
            >
              {display.abbreviation}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStatRow = (label: string, homeValue: string | number, awayValue: string | number, field: string) => {
    const isAvailable = stats?.availableStats.includes(field) ?? false;
    return (
    <div className="flex items-center justify-between border-b border-gray-800 py-3">
      <span className="flex-1 text-center font-bold">{isAvailable ? homeValue : '—'}</span>
      <span className="flex-1 text-center text-sm text-gray-400">{label}</span>
      <span className="flex-1 text-center font-bold">{isAvailable ? awayValue : '—'}</span>
    </div>
    );
  };

  if (isLoading) {
    return (
      <div className="mt-6 flex items-center justify-center rounded-2xl border border-gray-800 bg-gray-900 p-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
        <p className="text-red-400">{error || 'Données non disponibles'}</p>
      </div>
    );
  }

  const homeTeamKey = normalizeTeamName(stats.homeTeam);
  const awayTeamKey = normalizeTeamName(stats.awayTeam);

  // Chaque confrontation est reclassée du point de vue de l'équipe à domicile du match actuel.
  const h2hRows = stats.headToHead.map((match) => {
    const homeKey = normalizeTeamName(match.homeTeam);
    const awayKey = normalizeTeamName(match.awayTeam);
    const homeSideIsCurrentHome = homeKey === homeTeamKey;
    const homeSideIsCurrentAway = homeKey === awayTeamKey;
    const awaySideIsCurrentHome = awayKey === homeTeamKey;
    const awaySideIsCurrentAway = awayKey === awayTeamKey;
    let outcome: 'home' | 'draw' | 'away' | null = null;
    if (match.homeScore != null && match.awayScore != null && (homeSideIsCurrentHome || awaySideIsCurrentHome)) {
      const currentHomeGoals = homeSideIsCurrentHome ? match.homeScore : match.awayScore;
      const currentAwayGoals = homeSideIsCurrentHome ? match.awayScore : match.homeScore;
      outcome = currentHomeGoals > currentAwayGoals ? 'home' : currentHomeGoals === currentAwayGoals ? 'draw' : 'away';
    }
    return { match, outcome, homeSideIsCurrentHome, homeSideIsCurrentAway, awaySideIsCurrentHome, awaySideIsCurrentAway };
  });

  const h2hSummary = h2hRows.reduce(
    (acc, row) => {
      if (row.outcome === 'home') acc.homeWins += 1;
      else if (row.outcome === 'draw') acc.draws += 1;
      else if (row.outcome === 'away') acc.awayWins += 1;
      if (row.match.homeScore != null && row.match.awayScore != null) {
        acc.scoredMatches += 1;
        acc.totalGoals += row.match.homeScore + row.match.awayScore;
      }
      return acc;
    },
    { homeWins: 0, draws: 0, awayWins: 0, scoredMatches: 0, totalGoals: 0 }
  );
  const h2hDecided = h2hSummary.homeWins + h2hSummary.draws + h2hSummary.awayWins;
  const h2hAverageGoals = h2hSummary.scoredMatches > 0
    ? (h2hSummary.totalGoals / h2hSummary.scoredMatches).toFixed(2).replace('.', ',')
    : null;
  const visibleH2H = showAllH2H ? h2hRows : h2hRows.slice(0, INITIAL_H2H_COUNT);

  return (
    <div className="mt-6">
      {stats.source === "cache" && (
        <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
          Le flux live FotMob est indisponible. Les dernières données PostgreSQL sont affichées et peuvent être obsolètes ; veuillez réessayer plus tard.
          {stats.cachedAt && <span className="ml-1">{new Date(stats.cachedAt).toLocaleString("fr-FR")}</span>}
        </p>
      )}
      {stats.coverageLevel === "lower" && stats.availableStats.length === 0 && (
        <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
          Toutes les statistiques sont indisponibles pour ce match.
        </p>
      )}
      {stats.coverageLevel === "lower" && stats.availableStats.length > 0 && (
        <p role="status" className="mb-5 rounded-lg border border-amber-700/60 bg-amber-950/40 p-4 text-sm text-amber-200">
          Couverture FotMob limitée pour ce match : certaines statistiques, compositions ou données récentes peuvent être indisponibles.
        </p>
      )}
      {/* Tabs */}
      <div className="mb-6 flex gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2 overflow-x-auto">
        {(['resume', 'lineups', 'stats', 'h2h'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {tab === 'resume' ? 'Résumé' : tab === 'lineups' ? 'Compositions' : tab === 'stats' ? 'Statistiques' : 'H2H'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'resume' && (
        <div className="space-y-6">
          {/* Odds */}
          {stats.odds && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-lg font-bold">Cotes</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-800 p-4 text-center">
                  <p className="mb-2 text-sm text-gray-400">{stats.homeTeam}</p>
                  <p className="text-2xl font-bold text-green-400">{stats.odds.homeWin.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-gray-800 p-4 text-center">
                  <p className="mb-2 text-sm text-gray-400">Nul</p>
                  <p className="text-2xl font-bold text-yellow-400">{stats.odds.draw.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-gray-800 p-4 text-center">
                  <p className="mb-2 text-sm text-gray-400">{stats.awayTeam}</p>
                  <p className="text-2xl font-bold text-green-400">{stats.odds.awayWin.toFixed(2)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Forme</h3>
            <div className="space-y-4">
              <div>
                <p className="mb-2 font-semibold">{stats.homeTeam}</p>
                {renderForm(stats.homeForm)}
              </div>
              <div>
                <p className="mb-2 font-semibold">{stats.awayTeam}</p>
                {renderForm(stats.awayForm)}
              </div>
            </div>
          </div>

          {/* Top players */}
          {Boolean(stats.topPlayers?.home?.length || stats.topPlayers?.away?.length) && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-lg font-bold">Joueurs clés</h3>
              <div className="grid gap-6 sm:grid-cols-2">
                {([
                  { team: stats.homeTeam, players: stats.topPlayers?.home ?? [], imageUrl: stats.homeImageUrl },
                  { team: stats.awayTeam, players: stats.topPlayers?.away ?? [], imageUrl: stats.awayImageUrl },
                ] as const).map(side => (
                  <div key={side.team}>
                    <p className="mb-3 flex items-center gap-2 font-semibold text-gray-300">
                      {side.imageUrl && (
                        <Image src={side.imageUrl} alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
                      )}
                      {side.team}
                    </p>
                    <div className="space-y-2">
                      {side.players.map((player, index) => (
                        <div
                          key={`${player.name}-${index}`}
                          className="flex items-center justify-between gap-3 border-b border-gray-800 py-2"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2 truncate font-semibold">
                            {player.imageUrl && (
                              <Image src={player.imageUrl} alt="" width={28} height={28} unoptimized className="h-7 w-7 shrink-0 rounded-full bg-gray-700 object-cover" />
                            )}
                            <span className="truncate">{player.name}</span>
                          </span>
                          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                            {player.position}
                          </span>
                          {player.rating && (
                            <span className="w-10 text-right font-bold text-green-400">{player.rating}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Événements</h3>
            {stats.events.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun événement disponible pour ce match.</p>
            ) : (
              <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-1/2 before:top-2 before:w-px before:-translate-x-1/2 before:bg-gray-700">
                {stats.events
                  .map((event, index) => ({ event, index }))
                  .sort((a, b) => eventMinuteValue(a.event.minute) - eventMinuteValue(b.event.minute) || a.index - b.index)
                  .map(({ event, index }) => {
                    const minute = String(event.minute).replace(/['′]$/, '');
                    const label = eventLabel(event.type, event.period, event.detail);
                    const content = (
                      <>
                        <p className="text-xs font-medium text-gray-400">
                          {label}{event.detail ? ` · ${event.detail}` : ''}
                        </p>
                        <div className="flex items-center gap-2">
                          {event.playerImageUrl && (
                            <Image
                              src={event.playerImageUrl}
                              alt=""
                              width={28}
                              height={28}
                              unoptimized
                              className="h-7 w-7 shrink-0 rounded-full bg-gray-700 object-cover"
                            />
                          )}
                          <p className="break-words font-semibold text-gray-100">{event.player}</p>
                        </div>
                        {(event.playerIn || event.playerOut) && (
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-400">
                            {event.playerIn && (
                              <span className="inline-flex items-center gap-1 text-green-400">
                                {event.playerInImageUrl && (
                                  <Image src={event.playerInImageUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5 rounded-full object-cover" />
                                )}
                                Entrée : {event.playerIn}
                              </span>
                            )}
                            {event.playerOut && (
                              <span className="inline-flex items-center gap-1 text-red-300">
                                {event.playerOutImageUrl && (
                                  <Image src={event.playerOutImageUrl} alt="" width={20} height={20} unoptimized className="h-5 w-5 rounded-full object-cover" />
                                )}
                                Sortie : {event.playerOut}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    );

                    if (!event.side) {
                      return (
                        <li key={`${event.minute}-${event.type}-${index}`} className="relative z-10 flex justify-center">
                          <div className="flex max-w-full items-center gap-2 rounded-full border border-gray-700 bg-gray-900 px-3 py-2 text-center">
                            <span aria-hidden="true">{eventIcon(event.type, event.detail)}</span>
                            <span className="text-xs font-bold text-green-400">{minute}&apos;</span>
                            <span className="text-sm text-gray-300">
                              {event.player === event.type || event.player === label ? label : event.player}
                            </span>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={`${event.minute}-${event.type}-${index}`}
                        className="relative z-10 grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-1 sm:gap-3"
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none absolute top-1/2 z-0 w-[calc(50%_-_1.5rem)] -translate-y-1/2 border-t border-gray-700 ${
                            event.side === 'home' ? 'left-0' : 'right-0'
                          }`}
                        />
                        <div className={`flex min-w-0 ${event.side === 'home' ? 'justify-end' : ''}`}>
                          {event.side === 'home' && (
                            <div className="relative z-10 max-w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-right text-sm">
                              {content}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-gray-600 bg-gray-900 text-sm" aria-hidden="true">
                            {eventIcon(event.type, event.detail)}
                          </span>
                          <span className="whitespace-nowrap text-[11px] font-bold text-green-400">{minute}&apos;</span>
                        </div>
                        <div className="min-w-0">
                          {event.side === 'away' && (
                            <div className="relative z-10 max-w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm">
                              {content}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ol>
            )}
          </div>
        </div>
      )}

      {activeTab === 'lineups' && (
        stats.homeLineup.length === 0 && stats.awayLineup.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
            <p className="text-sm text-gray-400">Compositions non disponibles pour ce match.</p>
          </div>
        ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Home Lineup */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-2 text-xl font-bold">{stats.homeTeam}</h3>
            <div className="space-y-2">
              {stats.homeLineup.map((player, index) => (
                <div key={index} className="flex items-center justify-between gap-2 border-b border-gray-800 py-2">
                  {player.imageUrl && (
                    <Image src={player.imageUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full bg-gray-700 object-cover" />
                  )}
                  <span className="w-8 font-bold text-green-400">{player.number || '-'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
                  <span className="w-12 text-sm text-gray-400">{player.position}</span>
                  {player.rating && <span className="w-10 text-right font-bold">{player.rating}</span>}
                </div>
              ))}
            </div>
            <h4 className="mt-6 mb-3 font-bold">Remplaçants</h4>
            <div className="space-y-2">
              {stats.homeSubstitutes.map((player, index) => (
                <div key={index} className="flex items-center justify-between gap-2 border-b border-gray-800 py-2">
                  {player.imageUrl && (
                    <Image src={player.imageUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full bg-gray-700 object-cover" />
                  )}
                  <span className="w-8 font-bold text-green-400">{player.number || '-'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
                  <span className="w-12 text-sm text-gray-400">{player.position}</span>
                  {player.rating && <span className="w-10 text-right font-bold">{player.rating}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Away Lineup */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-2 text-xl font-bold">{stats.awayTeam}</h3>
            <div className="space-y-2">
              {stats.awayLineup.map((player, index) => (
                <div key={index} className="flex items-center justify-between gap-2 border-b border-gray-800 py-2">
                  {player.imageUrl && (
                    <Image src={player.imageUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full bg-gray-700 object-cover" />
                  )}
                  <span className="w-8 font-bold text-green-400">{player.number || '-'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
                  <span className="w-12 text-sm text-gray-400">{player.position}</span>
                  {player.rating && <span className="w-10 text-right font-bold">{player.rating}</span>}
                </div>
              ))}
            </div>
            <h4 className="mt-6 mb-3 font-bold">Remplaçants</h4>
            <div className="space-y-2">
              {stats.awaySubstitutes.map((player, index) => (
                <div key={index} className="flex items-center justify-between gap-2 border-b border-gray-800 py-2">
                  {player.imageUrl && (
                    <Image src={player.imageUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full bg-gray-700 object-cover" />
                  )}
                  <span className="w-8 font-bold text-green-400">{player.number || '-'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{player.name}</span>
                  <span className="w-12 text-sm text-gray-400">{player.position}</span>
                  {player.rating && <span className="w-10 text-right font-bold">{player.rating}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        )
      )}

      {activeTab === 'stats' && (
        stats.availableStats.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
            <p className="text-sm text-gray-400">Statistiques détaillées non disponibles pour ce match.</p>
          </div>
        ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Overview Stats */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Aperçu</h3>
            {renderStatRow('Possession', `${stats.possession.home}%`, `${stats.possession.away}%`, 'possession')}
            {renderStatRow('xG', stats.expectedGoals.home, stats.expectedGoals.away, 'expectedGoals')}
            {renderStatRow('Tirs', stats.shots.home, stats.shots.away, 'shots')}
            {renderStatRow('Tirs cadrés', stats.shotsOnTarget.home, stats.shotsOnTarget.away, 'shotsOnTarget')}
            {renderStatRow('Touches surface', stats.touchesInBox.home, stats.touchesInBox.away, 'touchesInBox')}
            {renderStatRow('Grosses chances', stats.bigChances.home, stats.bigChances.away, 'bigChances')}
            {renderStatRow('Chances ratées', stats.bigChancesMissed.home, stats.bigChancesMissed.away, 'bigChancesMissed')}
            {renderStatRow('Passes précis', stats.accuratePasses.home, stats.accuratePasses.away, 'accuratePasses')}
            {renderStatRow('Cartons jaunes', stats.yellowCards.home, stats.yellowCards.away, 'yellowCards')}
            {renderStatRow('Corners', stats.corners.home, stats.corners.away, 'corners')}
          </div>

          {/* Shots */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Tirs</h3>
            {renderStatRow('Total tirs', stats.shots.home, stats.shots.away, 'shots')}
            {renderStatRow('Tirs hors cadre', stats.shotsOffTarget.home, stats.shotsOffTarget.away, 'shotsOffTarget')}
            {renderStatRow('Tirs cadrés', stats.shotsOnTarget.home, stats.shotsOnTarget.away, 'shotsOnTarget')}
            {renderStatRow('Tirs bloqués', stats.blockedShots.home, stats.blockedShots.away, 'blockedShots')}
            {renderStatRow('Sur poteau', stats.hitWoodwork.home, stats.hitWoodwork.away, 'hitWoodwork')}
            {renderStatRow('Dans la surface', stats.shotsInsideBox.home, stats.shotsInsideBox.away, 'shotsInsideBox')}
            {renderStatRow('Hors surface', stats.shotsOutsideBox.home, stats.shotsOutsideBox.away, 'shotsOutsideBox')}
          </div>

          {/* Expected Goals */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Buts attendus (xG)</h3>
            {renderStatRow('xG total', stats.expectedGoals.home, stats.expectedGoals.away, 'expectedGoals')}
            {renderStatRow('xG jeu ouvert', stats.xgOpenPlay.home, stats.xgOpenPlay.away, 'xgOpenPlay')}
            {renderStatRow('xG coups arrêtés', stats.xgSetPlay.home, stats.xgSetPlay.away, 'xgSetPlay')}
            {renderStatRow('xG non penalty', stats.xgNonPenalty.home, stats.xgNonPenalty.away, 'xgNonPenalty')}
            {renderStatRow('xG cadré (xGOT)', stats.xgOnTarget.home, stats.xgOnTarget.away, 'xgOnTarget')}
          </div>

          {/* Passes */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Passes</h3>
            {renderStatRow('Total passes', stats.passes.home, stats.passes.away, 'passes')}
            {renderStatRow('Passes précis', stats.accuratePasses.home, stats.accuratePasses.away, 'accuratePasses')}
            {renderStatRow('Moitié propre', stats.ownHalf?.home ?? '-', stats.ownHalf?.away ?? '-', 'ownHalf')}
            {renderStatRow('Moitié adverse', stats.oppositionHalf?.home ?? '-', stats.oppositionHalf?.away ?? '-', 'oppositionHalf')}
            {renderStatRow('Longs balls précis', stats.accurateLongBalls.home, stats.accurateLongBalls.away, 'accurateLongBalls')}
            {renderStatRow('Centres précis', stats.accurateCrosses.home, stats.accurateCrosses.away, 'accurateCrosses')}
            {renderStatRow('Touches', stats.throws.home, stats.throws.away, 'throws')}
            {renderStatRow('Hors-jeu', stats.offsides.home, stats.offsides.away, 'offsides')}
          </div>

          {/* Defence */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Défense</h3>
            {renderStatRow('Tacles', stats.tackles.home, stats.tackles.away, 'tackles')}
            {renderStatRow('Interceptions', stats.interceptions.home, stats.interceptions.away, 'interceptions')}
            {renderStatRow('Bloqués', stats.blocks.home, stats.blocks.away, 'blocks')}
            {renderStatRow('Dégagements', stats.clearances.home, stats.clearances.away, 'clearances')}
            {renderStatRow('Arrêts gardien', stats.keeperSaves.home, stats.keeperSaves.away, 'keeperSaves')}
          </div>

          {/* Duels */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Duels</h3>
            {renderStatRow('Duels gagnés', stats.duelsWon.home, stats.duelsWon.away, 'duelsWon')}
            {renderStatRow('Duels au sol', stats.groundDuelsWon.home, stats.groundDuelsWon.away, 'groundDuelsWon')}
            {renderStatRow('Duels aériens', stats.aerialDuelsWon.home, stats.aerialDuelsWon.away, 'aerialDuelsWon')}
            {renderStatRow('Dribbles réussis', stats.successfulDribbles.home, stats.successfulDribbles.away, 'successfulDribbles')}
          </div>

          {/* Discipline */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Discipline</h3>
            {renderStatRow('Cartons jaunes', stats.yellowCards.home, stats.yellowCards.away, 'yellowCards')}
            {renderStatRow('Cartons rouges', stats.redCards.home, stats.redCards.away, 'redCards')}
            {renderStatRow('Fautes commises', stats.foulsCommitted.home, stats.foulsCommitted.away, 'foulsCommitted')}
          </div>

          {/* Physical performance */}
          {(stats.distanceCovered || stats.numberOfSprints) && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-lg font-bold">Physique</h3>
              {renderStatRow(
                'Distance parcourue',
                stats.distanceCovered ? `${stats.distanceCovered.home} km` : '-',
                stats.distanceCovered ? `${stats.distanceCovered.away} km` : '-',
                'distanceCovered'
              )}
              {renderStatRow(
                'Distance en course',
                stats.runningDistance ? `${stats.runningDistance.home} km` : '-',
                stats.runningDistance ? `${stats.runningDistance.away} km` : '-',
                'runningDistance'
              )}
              {renderStatRow(
                'Distance en sprint',
                stats.sprintingDistance ? `${stats.sprintingDistance.home} km` : '-',
                stats.sprintingDistance ? `${stats.sprintingDistance.away} km` : '-',
                'sprintingDistance'
              )}
              {renderStatRow(
                'Nombre de sprints',
                stats.numberOfSprints?.home ?? '-',
                stats.numberOfSprints?.away ?? '-',
                'numberOfSprints'
              )}
            </div>
          )}
        </div>
        )
      )}

      {activeTab === 'h2h' && (
        <div className="space-y-6">
          {/* Head to Head */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Confrontations directes</h3>
              {h2hRows.length > 0 && (
                <span className="rounded-full border border-gray-800 bg-black/30 px-3 py-1 text-xs font-medium text-gray-400">
                  {h2hRows.length} confrontation{h2hRows.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {h2hRows.length === 0 ? (
              <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm text-gray-400">
                Aucune confrontation directe disponible.
              </p>
            ) : (
              <>
                {/* Résumé des confrontations (perspective de l'équipe à domicile) */}
                {h2hDecided > 0 && (
                  <div className="mb-6 rounded-xl border border-gray-800 bg-black/20 p-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-400">{stats.homeTeam}</p>
                        <p className="mt-1 text-2xl font-bold text-green-400">{h2hSummary.homeWins}</p>
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">
                          Victoire{h2hSummary.homeWins > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-400">Nuls</p>
                        <p className="mt-1 text-2xl font-bold text-yellow-400">{h2hSummary.draws}</p>
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">Égalités</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-400">{stats.awayTeam}</p>
                        <p className="mt-1 text-2xl font-bold text-red-400">{h2hSummary.awayWins}</p>
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">
                          Victoire{h2hSummary.awayWins > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div
                      className="mt-3 flex h-2 overflow-hidden rounded-full bg-gray-800"
                      role="img"
                      aria-label={`Répartition : ${h2hSummary.homeWins} victoire(s) ${stats.homeTeam}, ${h2hSummary.draws} match(s) nul(s), ${h2hSummary.awayWins} victoire(s) ${stats.awayTeam}`}
                    >
                      <div className="bg-green-600" style={{ width: `${(h2hSummary.homeWins / h2hDecided) * 100}%` }} />
                      <div className="bg-yellow-600" style={{ width: `${(h2hSummary.draws / h2hDecided) * 100}%` }} />
                      <div className="bg-red-600" style={{ width: `${(h2hSummary.awayWins / h2hDecided) * 100}%` }} />
                    </div>
                    {h2hAverageGoals && (
                      <p className="mt-3 text-center text-xs text-gray-500">
                        {h2hSummary.scoredMatches} match{h2hSummary.scoredMatches > 1 ? 's' : ''} avec score connu · moyenne de {h2hAverageGoals} buts par match
                      </p>
                    )}
                  </div>
                )}

                {/* Détail des confrontations */}
                <ul className="space-y-2">
                  {visibleH2H.map((row, index) => {
                    const { match } = row;
                    const badge = row.outcome === 'home'
                      ? { label: 'V', title: `Victoire de ${stats.homeTeam}`, className: 'bg-green-600' }
                      : row.outcome === 'draw'
                        ? { label: 'N', title: 'Match nul', className: 'bg-yellow-600' }
                        : row.outcome === 'away'
                          ? { label: 'D', title: `Victoire de ${stats.awayTeam}`, className: 'bg-red-600' }
                          : null;
                    return (
                      <li
                        key={`${match.date}-${index}`}
                        className="grid gap-2 rounded-lg border border-gray-800 bg-black/20 p-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center"
                      >
                        <time dateTime={match.date} className="text-xs text-gray-400">{formatH2HDate(match.date)}</time>
                        <div className="min-w-0">
                          <div className="flex items-center justify-center gap-2 sm:gap-3">
                            <span
                              className={`min-w-0 flex-1 truncate text-right text-sm ${
                                row.homeSideIsCurrentHome || row.awaySideIsCurrentHome ? 'font-bold text-white' : 'text-gray-300'
                              }`}
                            >
                              {match.homeTeam}
                            </span>
                            <span className="shrink-0 rounded bg-gray-800 px-2 py-1 text-sm font-bold tabular-nums text-white">
                              {match.homeScore ?? '-'}<span className="mx-1 text-gray-500">:</span>{match.awayScore ?? '-'}
                            </span>
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${
                                row.homeSideIsCurrentAway || row.awaySideIsCurrentAway ? 'font-bold text-white' : 'text-gray-300'
                              }`}
                            >
                              {match.awayTeam}
                            </span>
                          </div>
                          {match.competition && (
                            <p className="mt-1 truncate text-center text-xs text-gray-500">{match.competition}</p>
                          )}
                        </div>
                        <div className="flex justify-end">
                          {badge ? (
                            <span
                              title={badge.title}
                              aria-label={badge.title}
                              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600" title="Résultat non disponible">—</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {h2hRows.length > INITIAL_H2H_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllH2H(current => !current)}
                    aria-expanded={showAllH2H}
                    className="mt-3 text-sm font-semibold text-green-400 hover:text-green-300"
                  >
                    {showAllH2H ? 'Voir moins' : `Voir plus (${h2hRows.length - INITIAL_H2H_COUNT})`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Standings */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold">Classement</h3>
            {stats.standings.length === 0 ? (
              <p className="text-sm text-gray-400">Classement indisponible pour cette compétition.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-green-600">
                    <th className="px-2 py-2 text-left font-bold">#</th>
                    <th className="px-2 py-2 text-left font-bold">Équipe</th>
                    <th className="px-2 py-2 text-center font-bold">MJ</th>
                    <th className="px-2 py-2 text-center font-bold">G</th>
                    <th className="px-2 py-2 text-center font-bold">N</th>
                    <th className="px-2 py-2 text-center font-bold">P</th>
                    <th className="px-2 py-2 text-center font-bold">+/-</th>
                    <th className="px-2 py-2 text-center font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.standings.map((team, index) => (
                    <tr
                      key={index}
                      className={`border-b border-gray-800 ${
                        team.team === stats.homeTeam || team.team === stats.awayTeam
                          ? 'bg-gray-800'
                          : ''
                      }`}
                    >
                      <td className="px-2 py-2">{team.position}</td>
                      <td className="px-2 py-2 font-semibold">{team.team}</td>
                      <td className="px-2 py-2 text-center">{team.played}</td>
                      <td className="px-2 py-2 text-center">{team.won}</td>
                      <td className="px-2 py-2 text-center">{team.drawn}</td>
                      <td className="px-2 py-2 text-center">{team.lost}</td>
                      <td className="px-2 py-2 text-center">{team.goalDifference}</td>
                      <td className="px-2 py-2 text-center font-bold text-green-400">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
