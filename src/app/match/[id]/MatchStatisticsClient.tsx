'use client';

import Image from 'next/image';
import { useState, useEffect, useCallback } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useLanguage } from '@/context/LanguageContext';
import {
  MARKET_ESTIMATES,
  type MarketEstimate,
} from '@/lib/marketEstimates';
import {
  readMarketSelections,
  isMarketEstimateId,
  subscribeToMarketSelections,
  toggleFixtureMarketSelection,
  type MarketSelectionsByFixture,
} from '@/lib/marketSelections';
import type { Fixture } from '@/lib/fixtures';

const LIVE_REFRESH_INTERVAL_MS = 15_000;
const IDLE_REFRESH_INTERVAL_MS = 60_000;

interface MatchStats {
  source?: "fotmob" | "cache";
  cachedAt?: string;
  availableStats: string[];
  date: string;
  competition: string;
  fixtureId: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
  status: string;
  lineupType: string;
  homeFormation: string;
  awayFormation: string;
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
  comments: Array<{
    minute: string;
    text: string;
    side?: 'home' | 'away';
  }>;
  recap?: {
    title: string;
    description: string;
    summary?: string;
    url?: string;
  };
  momentum: Array<{
    minute: number;
    value: number;
  }>;
  homeLineup: Array<{
    number: number;
    name: string;
    position: string;
    rating?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
  }>;
  awayLineup: Array<{
    number: number;
    name: string;
    position: string;
    rating?: string;
    imageUrl?: string;
    x?: number;
    y?: number;
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
  homeUnavailablePlayers: Array<{
    name: string;
    type: string;
    expectedReturn?: string;
    imageUrl?: string;
  }>;
  awayUnavailablePlayers: Array<{
    name: string;
    type: string;
    expectedReturn?: string;
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
  recentMatches: Array<{
    team: string;
    matches: Array<{
      date: string;
      competition: string;
      homeTeam: string;
      awayTeam: string;
      homeScore: number | null;
      awayScore: number | null;
      score: string;
    }>;
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
const UPCOMING_FIXTURES_DAYS = 14;

function isMarketEstimateArray(value: unknown): value is MarketEstimate[] {
  return Array.isArray(value) && value.every(market =>
    typeof market === 'object' &&
    market !== null &&
    'market' in market &&
    typeof market.market === 'string' &&
    isMarketEstimateId(market.market) &&
    'estimatedRate' in market &&
    typeof market.estimatedRate === 'number' &&
    Number.isFinite(market.estimatedRate) &&
    market.estimatedRate > 0 &&
    market.estimatedRate <= 100 &&
    'sampleSize' in market &&
    typeof market.sampleSize === 'number' &&
    Number.isSafeInteger(market.sampleSize) &&
    market.sampleSize >= 5
  );
}

interface UpcomingFixture {
  date: string;
  time: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  status?: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
}

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
  stats.comments = Array.isArray(stats.comments) ? stats.comments : [];
  stats.momentum = Array.isArray(stats.momentum)
    ? stats.momentum.filter(point =>
      typeof point?.minute === 'number'
      && point.minute >= 0
      && Number.isFinite(point.minute)
      && typeof point.value === 'number'
      && Number.isFinite(point.value)
    )
    : [];
  stats.availableStats = Array.isArray(stats.availableStats) ? stats.availableStats : [];
  stats.lineupType = typeof stats.lineupType === 'string' ? stats.lineupType : '';
  stats.homeForm = typeof stats.homeForm === 'string' ? stats.homeForm : '';
  stats.awayForm = typeof stats.awayForm === 'string' ? stats.awayForm : '';
  stats.homeLineup = Array.isArray(stats.homeLineup) ? stats.homeLineup : [];
  stats.awayLineup = Array.isArray(stats.awayLineup) ? stats.awayLineup : [];
  stats.homeSubstitutes = Array.isArray(stats.homeSubstitutes) ? stats.homeSubstitutes : [];
  stats.awaySubstitutes = Array.isArray(stats.awaySubstitutes) ? stats.awaySubstitutes : [];
  stats.homeUnavailablePlayers = Array.isArray(stats.homeUnavailablePlayers) ? stats.homeUnavailablePlayers : [];
  stats.awayUnavailablePlayers = Array.isArray(stats.awayUnavailablePlayers) ? stats.awayUnavailablePlayers : [];
  stats.headToHead = Array.isArray(stats.headToHead) ? stats.headToHead : [];
  stats.recentMatches = Array.isArray(stats.recentMatches) ? stats.recentMatches : [];
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
  const { language, text } = useLanguage();
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resume' | 'lineups' | 'probable' | 'stats' | 'h2h' | 'comments' | 'form'>('resume');
  const [showAllH2H, setShowAllH2H] = useState(false);
  const [upcomingFixtures, setUpcomingFixtures] = useState<UpcomingFixture[]>([]);
  const [isLoadingUpcomingFixtures, setIsLoadingUpcomingFixtures] = useState(false);
  const [upcomingFixturesError, setUpcomingFixturesError] = useState<string | null>(null);
  const [hasLoadedUpcomingFixtures, setHasLoadedUpcomingFixtures] = useState(false);
  const [marketEstimates, setMarketEstimates] = useState<MarketEstimate[]>([]);
  const [marketEstimatesLoading, setMarketEstimatesLoading] = useState(false);
  const [marketEstimatesError, setMarketEstimatesError] = useState('');
  const [marketSelections, setMarketSelections] = useState<MarketSelectionsByFixture>({});
  const [marketBasketError, setMarketBasketError] = useState('');

  const fetchMatchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const response = await fetch(`/api/football/fixtures/${fixtureId}/statistics`, {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        const nextStats = withStatDefaults(data as MatchStats);
        setStats(nextStats);
        if (nextStats.comments.length === 0) setActiveTab(current => current === 'comments' ? 'resume' : current);
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
    const controller = new AbortController();
    setMarketEstimatesLoading(true);
    setMarketEstimatesError('');
    fetch(`/api/football/fixtures/${encodeURIComponent(fixtureId)}/market-estimates`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const payload: unknown = await response.json();
        if (
          !response.ok ||
          typeof payload !== 'object' ||
          payload === null ||
          !('markets' in payload) ||
          !isMarketEstimateArray(payload.markets)
        ) {
          const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : text('Impossible de charger les estimations de marchés.', 'Unable to load market estimates.');
          throw new Error(message);
        }
        setMarketEstimates(payload.markets);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setMarketEstimatesError(
          error instanceof Error
            ? error.message
            : text('Impossible de charger les estimations de marchés.', 'Unable to load market estimates.')
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketEstimatesLoading(false);
      });
    return () => controller.abort();
  }, [fixtureId, text]);

  useEffect(() => {
    const syncMarketSelections = () => {
      try {
        setMarketSelections(readMarketSelections());
        setMarketBasketError('');
      } catch (error) {
        setMarketBasketError(
          error instanceof Error
            ? error.message
            : text('Impossible de lire les marchés sélectionnés.', 'Unable to read selected markets.')
        );
      }
    };
    syncMarketSelections();
    return subscribeToMarketSelections(syncMarketSelections);
  }, [text]);

  const toggleDetailMarket = (estimate: MarketEstimate) => {
    if (!stats || stats.status !== 'Prévu') return;
    const fixture: Fixture = {
      id: stats.fixtureId,
      matchId: stats.fixtureId,
      sport: 'football',
      date: stats.date,
      time: stats.time,
      league: stats.competition,
      competition: stats.competition,
      homeTeam: stats.homeTeam,
      awayTeam: stats.awayTeam,
      homeImageUrl: stats.homeImageUrl,
      awayImageUrl: stats.awayImageUrl,
      status: stats.status,
      ...(stats.homeScore !== undefined && stats.awayScore !== undefined
        ? { score: `${stats.homeScore} - ${stats.awayScore}` }
        : {}),
    };
    try {
      toggleFixtureMarketSelection(fixture, estimate);
      setMarketBasketError('');
    } catch (error) {
      setMarketBasketError(
        error instanceof Error
          ? text(error.message, error.message === 'Le panier est limité à 20 matchs.'
            ? 'The basket is limited to 20 matches.'
            : error.message)
          : text('Impossible d’enregistrer ce marché.', 'Unable to save this market.')
      );
    }
  };

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

  useEffect(() => {
    if (activeTab !== 'form' || hasLoadedUpcomingFixtures) return;
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const end = new Date(today.getTime() + (UPCOMING_FIXTURES_DAYS - 1) * 86_400_000);
    const to = end.toISOString().slice(0, 10);
    const controller = new AbortController();

    const loadUpcomingFixtures = async () => {
      setIsLoadingUpcomingFixtures(true);
      setUpcomingFixturesError(null);
      try {
        const response = await fetch(
          `/api/sports/fixtures?from=${from}&to=${to}&sport=football`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(text('Impossible de charger les prochains matchs.', 'Unable to load upcoming matches.'));
        }
        const data = await response.json() as { fixtures?: UpcomingFixture[] };
        setUpcomingFixtures(Array.isArray(data.fixtures) ? data.fixtures : []);
        setHasLoadedUpcomingFixtures(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setUpcomingFixturesError(
          error instanceof Error
            ? error.message
            : text('Erreur lors du chargement des prochains matchs.', 'Failed to load upcoming matches.')
        );
      } finally {
        if (!controller.signal.aborted) setIsLoadingUpcomingFixtures(false);
      }
    };

    void loadUpcomingFixtures();
    return () => controller.abort();
  }, [activeTab, hasLoadedUpcomingFixtures, text]);

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
  const hasProbableLineup =
    /predicted|probable/i.test(stats.lineupType) &&
    (stats.homeLineup.length > 0 ||
      stats.awayLineup.length > 0 ||
      stats.homeUnavailablePlayers.length > 0 ||
      stats.awayUnavailablePlayers.length > 0);
  const tabs: Array<{ id: typeof activeTab; label: string }> = [
    { id: 'resume', label: text('Résumé', 'Overview') },
    { id: 'lineups', label: text('Compositions', 'Lineups') },
    ...(hasProbableLineup
      ? [{
        id: 'probable' as const,
        label: isLiveMatch
          ? text('Composition définitive', 'Confirmed lineup')
          : text('Composition probable', 'Predicted lineup'),
      }]
      : []),
    { id: 'stats', label: text('Statistiques', 'Statistics') },
    {
      id: 'comments',
      label: isLiveMatch
        ? text('Commentaires', 'Comments')
        : text('Récapitulatif', 'Recap'),
    },
    { id: 'form', label: text('Forme', 'Form') },
    { id: 'h2h', label: 'H2H' },
  ];
  const recentMatchesForTeam = (teamName: string) => {
    const teamHistory = stats.recentMatches.find(
      history => normalizeTeamName(history.team) === normalizeTeamName(teamName)
    );
    return [...(teamHistory?.matches ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  };
  const nextFixtureForTeam = (teamName: string) => {
    const normalizedTeam = normalizeTeamName(teamName);
    return upcomingFixtures
      .filter(fixture =>
        fixture.status === 'Prévu'
        && (
          normalizeTeamName(fixture.homeTeam) === normalizedTeam
          || normalizeTeamName(fixture.awayTeam) === normalizedTeam
        )
      )
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
  };
  const momentum = stats.momentum.filter(point =>
    Number.isFinite(point.minute) && point.minute >= 0 && Number.isFinite(point.value)
  );
  const momentumMaximumMinute = momentum.reduce(
    (maximum, point) => Math.max(maximum, point.minute),
    1
  );
  const momentumPath = momentum.length > 0
    ? [
      `M ${12 + (momentum[0].minute / momentumMaximumMinute) * 576} 100`,
      ...momentum.map(point => {
        const x = 12 + (point.minute / momentumMaximumMinute) * 576;
        const y = 100 - (Math.max(-100, Math.min(100, point.value)) / 100) * 82;
        return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }),
      `L ${12 + (momentum[momentum.length - 1].minute / momentumMaximumMinute) * 576} 100 Z`,
    ].join(' ')
    : '';
  const formatPlayerAvailability = (type: string) => {
    switch (type.toLowerCase()) {
      case 'injury':
        return text('Blessure', 'Injury');
      case 'suspension':
        return text('Suspension', 'Suspension');
      default:
        return text('Indisponible', 'Unavailable');
    }
  };
  const formatExpectedReturn = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(date);
  };
  const renderPitchPlayers = (players: MatchStats['homeLineup'], side: 'home' | 'away') =>
    players.map((player, index) => {
      const x = typeof player.x === 'number'
        ? player.x
        : (index + 1) / (players.length + 1);
      const y = typeof player.y === 'number'
        ? player.y
        : 0.5;
      const left = side === 'home' ? 4 + x * 42 : 54 + (1 - x) * 42;
      const top = 5 + y * 90;
      return (
        <div
          key={`${side}-${player.number}-${player.name}`}
          title={`${player.number ? `${player.number} · ` : ''}${player.name}${player.position ? ` · ${player.position}` : ''}`}
          className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center sm:w-24"
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          {player.imageUrl ? (
            <Image
              src={player.imageUrl}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-9 w-9 rounded-full border-2 border-white bg-gray-200 object-cover shadow-md sm:h-11 sm:w-11"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-gray-800 text-xs font-bold shadow-md sm:h-11 sm:w-11">
              {player.number || '—'}
            </span>
          )}
          <span className="mt-1 max-w-full truncate rounded bg-gray-950/75 px-1.5 py-0.5 text-[10px] font-medium text-white shadow sm:text-xs">
            {player.number ? `${player.number} ` : ''}{player.name}
          </span>
        </div>
      );
    });
  const renderUnavailablePlayers = (players: MatchStats['homeUnavailablePlayers']) =>
    players.length === 0 ? (
      <p className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-400">
        {text('Aucun joueur indisponible signalé.', 'No unavailable players reported.')}
      </p>
    ) : (
      <ul className="divide-y divide-gray-800">
        {players.map((player, index) => (
          <li key={`${player.name}-${index}`} className="flex items-center gap-3 py-3">
            {player.imageUrl ? (
              <Image
                src={player.imageUrl}
                alt=""
                width={36}
                height={36}
                unoptimized
                className="h-9 w-9 rounded-full bg-gray-800 object-cover"
              />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-800 text-sm" aria-hidden="true">
                +
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{player.name}</p>
              <p className="text-sm text-gray-400">
                {formatPlayerAvailability(player.type)}
                {player.expectedReturn && ` · ${formatExpectedReturn(player.expectedReturn)}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    );

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
          Le flux live est indisponible. Les dernières données sont affichées et peuvent être obsolètes ; veuillez réessayer plus tard.
          {stats.cachedAt && <span className="ml-1">{new Date(stats.cachedAt).toLocaleString("fr-FR")}</span>}
        </p>
      )}
      {/* Tabs */}
      <div className="mb-6 flex gap-2 rounded-xl border border-gray-800 bg-gray-900 p-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-green-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'resume' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5" aria-label={text('Marchés et estimations indicatives', 'Markets and indicative estimates')}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-white">{text('Marchés du match', 'Match markets')}</h3>
                <p className="mt-1 text-xs text-gray-400">
                  {text('Estimations historiques · pas des cotes bookmaker', 'Historical estimates · not bookmaker odds')}
                </p>
              </div>
              {stats.status !== 'Prévu' && (
                <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-1 text-[10px] text-gray-400">
                  {text('Sélection disponible avant le match', 'Selections available before kickoff')}
                </span>
              )}
            </div>
            {marketBasketError && <p role="alert" className="mt-3 text-xs text-red-300">{marketBasketError}</p>}
            {marketEstimatesError && <p role="alert" className="mt-3 text-xs text-amber-300">{marketEstimatesError}</p>}
            {marketEstimatesLoading ? (
              <p role="status" className="mt-4 text-sm text-gray-400">{text('Calcul des estimations…', 'Calculating estimates…')}</p>
            ) : marketEstimates.length > 0 ? (
              <>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">1X2</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'home-win', label: '1' },
                      { id: 'draw', label: 'N' },
                      { id: 'away-win', label: '2' },
                    ] as const).map(market => {
                      const estimate = marketEstimates.find(item => item.market === market.id);
                      const selected = (marketSelections[stats.fixtureId] ?? []).some(item => item.market === market.id);
                      return (
                        <button
                          key={market.id}
                          type="button"
                          disabled={!estimate || stats.status !== 'Prévu'}
                          aria-pressed={selected}
                          title={estimate
                            ? `${estimate.estimatedRate}% ${text('sur', 'across')} ${estimate.sampleSize} ${text('matchs historiques', 'historical matches')}`
                            : text('Historique insuffisant', 'Insufficient history')}
                          onClick={() => estimate && toggleDetailMarket(estimate)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                            selected
                              ? 'border-fuchsia-700 bg-fuchsia-950/40 text-fuchsia-100'
                              : estimate
                                ? 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                                : 'cursor-not-allowed border-gray-800 bg-gray-950/50 text-gray-600'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          <span className="font-semibold">{market.label}</span>
                          <span className="font-bold text-white">{estimate ? `≈${(100 / estimate.estimatedRate).toFixed(2)}` : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {text('Autres marchés', 'Other markets')}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MARKET_ESTIMATES.filter(market =>
                      !['home-win', 'draw', 'away-win'].includes(market.id)
                    ).map(market => {
                      const estimate = marketEstimates.find(item => item.market === market.id);
                      const selected = (marketSelections[stats.fixtureId] ?? []).some(item => item.market === market.id);
                      return (
                        <button
                          key={market.id}
                          type="button"
                          disabled={!estimate || stats.status !== 'Prévu'}
                          aria-pressed={selected}
                          title={estimate
                            ? `${estimate.estimatedRate}% ${text('sur', 'across')} ${estimate.sampleSize} ${text('matchs historiques', 'historical matches')}`
                            : text('Historique insuffisant', 'Insufficient history')}
                          onClick={() => estimate && toggleDetailMarket(estimate)}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                            selected
                              ? 'border-fuchsia-700 bg-fuchsia-950/40 text-fuchsia-100'
                              : estimate
                                ? 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                                : 'cursor-not-allowed border-gray-800 bg-gray-950/50 text-gray-600'
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          <span>{text(market.label, market.labelEn)}</span>
                          <span className="shrink-0 font-bold text-white">{estimate ? `≈${(100 / estimate.estimatedRate).toFixed(2)}` : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {Boolean(marketSelections[stats.fixtureId]?.length) && (
                  <p className="mt-3 text-xs text-fuchsia-300">
                    {text(
                      `${marketSelections[stats.fixtureId].length} sélection(s) de ce match dans votre panier.`,
                      `${marketSelections[stats.fixtureId].length} pick(s) from this match in your basket.`
                    )}
                  </p>
                )}
              </>
            ) : (
              !marketEstimatesError && (
                <p className="mt-4 text-sm text-gray-400">
                  {text('Historique insuffisant pour estimer les marchés.', 'Not enough history to estimate markets.')}
                </p>
              )
            )}
          </section>

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

      {activeTab === 'probable' && hasProbableLineup && (
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {isLiveMatch
                    ? text('Compositions définitives', 'Confirmed lineups')
                    : text('Compositions probables', 'Predicted lineups')}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  {isLiveMatch
                    ? text('Composition publiée pour ce match en direct.', 'Lineup published for this live match.')
                    : text('Estimations fournies, susceptibles de changer avant le coup d’envoi.', 'Estimates provided; they may change before kick-off.')}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                isLiveMatch
                  ? 'border-green-300/20 bg-green-300/10 text-green-100'
                  : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
              }`}>
                {isLiveMatch ? text('Définitive', 'Confirmed') : text('Probable', 'Predicted')}
              </span>
            </div>

            <div className="overflow-x-auto p-4 sm:p-6">
              <div
                className="relative mx-auto h-[440px] min-w-[680px] max-w-5xl overflow-hidden rounded-xl border-2 border-white/40 bg-[#34764b] sm:h-[540px]"
                aria-label={text('Terrain et compositions probables', 'Pitch and predicted lineups')}
              >
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,.2) 50%)', backgroundSize: '20% 100%' }} />
                <div className="absolute inset-y-0 left-1/2 border-l-2 border-white/40" />
                <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
                <div className="absolute left-0 top-1/2 h-[46%] w-[14%] -translate-y-1/2 border-2 border-l-0 border-white/40" />
                <div className="absolute right-0 top-1/2 h-[46%] w-[14%] -translate-y-1/2 border-2 border-r-0 border-white/40" />
                <div className="absolute left-0 top-1/2 h-[22%] w-[5%] -translate-y-1/2 border-2 border-l-0 border-white/40" />
                <div className="absolute right-0 top-1/2 h-[22%] w-[5%] -translate-y-1/2 border-2 border-r-0 border-white/40" />
                {renderPitchPlayers(stats.homeLineup, 'home')}
                {renderPitchPlayers(stats.awayLineup, 'away')}
              </div>
            </div>

            <div className="grid gap-4 border-t border-gray-800 p-4 sm:grid-cols-2 sm:p-6">
              {[{
                name: stats.homeTeam,
                formation: stats.homeFormation,
                players: stats.homeLineup,
              }, {
                name: stats.awayTeam,
                formation: stats.awayFormation,
                players: stats.awayLineup,
              }].map(team => (
                <div key={team.name} className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3">
                  <span className="font-semibold text-white">{team.name}</span>
                  <span className="text-sm text-gray-400">
                    {text('Formation', 'Formation')}: {team.formation || '—'}
                    {team.players.length > 0 && ` · ${team.players.length} ${text('joueurs', 'players')}`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-red-400/20 bg-red-400/10 text-red-300" aria-hidden="true">+</span>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {text('Joueurs blessés ou indisponibles', 'Injured or unavailable players')}
                </h2>
                <p className="text-sm text-gray-400">
                  {text('Informations signalées dans la fiche du match.', 'Information reported in the match details.')}
                </p>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {[{
                name: stats.homeTeam,
                players: stats.homeUnavailablePlayers,
              }, {
                name: stats.awayTeam,
                players: stats.awayUnavailablePlayers,
              }].map(team => (
                <div key={team.name} className="rounded-2xl border border-gray-800 bg-gray-900 px-5">
                  <h3 className="border-b border-gray-800 py-4 font-bold text-white">{team.name}</h3>
                  {renderUnavailablePlayers(team.players)}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'stats' && (
        stats.availableStats.length === 0 && momentum.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
            <p className="text-sm text-gray-400">Statistiques détaillées non disponibles pour ce match.</p>
          </div>
        ) : (
        <div className="space-y-6">
          {momentum.length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold">{text('Dynamique du match', 'Match momentum')}</h3>
                <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-500" />
                    {stats.homeTeam}
                  </span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    {stats.awayTeam}
                  </span>
                </div>
              </div>
              <svg
                viewBox="0 0 600 220"
                role="img"
                aria-label={text('Graphique de dynamique du match', 'Match momentum chart')}
                className="h-auto w-full overflow-visible"
              >
                <defs>
                  <clipPath id={`momentum-home-${stats.fixtureId}`}>
                    <rect x="0" y="0" width="600" height="100" />
                  </clipPath>
                  <clipPath id={`momentum-away-${stats.fixtureId}`}>
                    <rect x="0" y="100" width="600" height="100" />
                  </clipPath>
                </defs>
                <line x1="12" y1="18" x2="588" y2="18" stroke="#374151" strokeDasharray="4 5" />
                <line x1="12" y1="100" x2="588" y2="100" stroke="#6b7280" />
                <line x1="12" y1="182" x2="588" y2="182" stroke="#374151" strokeDasharray="4 5" />
                {momentum.length > 1 ? (
                  <>
                    <path d={momentumPath} fill="#22c55e" fillOpacity="0.72" clipPath={`url(#momentum-home-${stats.fixtureId})`} />
                    <path d={momentumPath} fill="#f43f5e" fillOpacity="0.72" clipPath={`url(#momentum-away-${stats.fixtureId})`} />
                    <path
                      d={momentum.map((point, index) => {
                        const x = 12 + (point.minute / momentumMaximumMinute) * 576;
                        const y = 100 - (Math.max(-100, Math.min(100, point.value)) / 100) * 82;
                        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
                      }).join(' ')}
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </>
                ) : (
                  <circle
                    cx={12 + (momentum[0].minute / momentumMaximumMinute) * 576}
                    cy={100 - (Math.max(-100, Math.min(100, momentum[0].value)) / 100) * 82}
                    r="4"
                    fill="#e5e7eb"
                  />
                )}
                <text x="12" y="210" fill="#9ca3af" fontSize="12">0′</text>
                <text x="588" y="210" fill="#9ca3af" fontSize="12" textAnchor="end">
                  {Math.round(momentumMaximumMinute)}′
                </text>
              </svg>
            </section>
          )}
          {stats.availableStats.length > 0 && (
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
          )}
        </div>
        )
      )}

      {activeTab === 'comments' && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
          <h3 className="mb-5 text-lg font-bold">
            {isLiveMatch
              ? text('Commentaires du match', 'Match comments')
              : text('Récapitulatif du match', 'Match recap')}
          </h3>
          {stats.comments.length > 0 ? (
            <ol className="space-y-4">
              {stats.comments.map((comment, index) => (
                <li key={`${comment.minute}-${index}`} className="flex gap-4 border-l-2 border-green-500 pl-4">
                  {comment.minute && (
                    <time className="min-w-12 pt-0.5 text-sm font-semibold text-green-400">
                      {comment.minute.includes("'") ? comment.minute : `${comment.minute}′`}
                    </time>
                  )}
                  <p className="text-sm leading-6 text-gray-200">{comment.text}</p>
                </li>
              ))}
            </ol>
          ) : !isLiveMatch && stats.recap ? (
            <article className="rounded-xl border border-gray-800 bg-black/20 p-4 sm:p-5">
              {stats.recap.title && <h4 className="mb-2 font-semibold text-white">{stats.recap.title}</h4>}
              {(stats.recap.summary || stats.recap.description) && (
                <p className="whitespace-pre-line text-sm leading-6 text-gray-300">
                  {stats.recap.summary || stats.recap.description}
                </p>
              )}
            </article>
          ) : (
            <p className="rounded-lg border border-gray-800 bg-black/20 p-4 text-sm text-gray-400">
              {text(
                'Aucun commentaire texte n’est fourni par l’API pour ce match.',
                'The API does not provide text commentary for this match.'
              )}
            </p>
          )}
        </section>
      )}

      {activeTab === 'form' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-bold">{text('Derniers matchs', 'Recent matches')}</h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {[stats.homeTeam, stats.awayTeam].map(teamName => {
                const teamMatches = recentMatchesForTeam(teamName);
                return (
                  <div key={teamName} className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
                    <h3 className="mb-3 font-semibold text-white">{teamName}</h3>
                    {teamMatches.length > 0 ? (
                      <ol className="space-y-2">
                        {teamMatches.map((match, index) => {
                          const isHome = normalizeTeamName(match.homeTeam) === normalizeTeamName(teamName);
                          const opponent = isHome ? match.awayTeam : match.homeTeam;
                          const ownScore = isHome ? match.homeScore : match.awayScore;
                          const opponentScore = isHome ? match.awayScore : match.homeScore;
                          const result = ownScore === null || opponentScore === null
                            ? 'unknown'
                            : ownScore > opponentScore ? 'win' : ownScore === opponentScore ? 'draw' : 'loss';
                          const resultStyle = result === 'win'
                            ? 'bg-emerald-600'
                            : result === 'loss'
                              ? 'bg-red-600'
                              : 'bg-gray-500';
                          return (
                            <li key={`${match.date}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                              <div className="min-w-0 flex-1 text-right">
                                <p className="truncate text-sm text-gray-200">{isHome ? teamName : opponent}</p>
                                <p className="text-xs text-gray-500">{formatH2HDate(match.date)}</p>
                              </div>
                              <span className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-bold text-white ${resultStyle}`}>
                                {match.homeScore} - {match.awayScore}
                              </span>
                              <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
                                {isHome ? opponent : teamName}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="text-sm text-gray-400">
                        {text('Aucun résultat récent fourni.', 'No recent results available.')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-bold">{text('Prochain match', 'Next match')}</h2>
            {isLoadingUpcomingFixtures ? (
              <p role="status" className="text-sm text-gray-400">
                {text('Chargement des prochains matchs…', 'Loading upcoming matches…')}
              </p>
            ) : upcomingFixturesError ? (
              <p role="alert" className="text-sm text-red-400">{upcomingFixturesError}</p>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {[stats.homeTeam, stats.awayTeam].map(teamName => {
                  const fixture = nextFixtureForTeam(teamName);
                  if (!fixture) {
                    return (
                      <div key={teamName} className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
                        <h3 className="mb-2 font-semibold text-white">{teamName}</h3>
                        <p className="text-sm text-gray-400">
                          {text('Aucun match prévu trouvé dans les 14 prochains jours.', 'No scheduled match found in the next 14 days.')}
                        </p>
                      </div>
                    );
                  }
                  const homeSide = normalizeTeamName(fixture.homeTeam) === normalizeTeamName(teamName);
                  const rivalName = homeSide ? fixture.awayTeam : fixture.homeTeam;
                  const teamImage = homeSide ? fixture.homeImageUrl : fixture.awayImageUrl;
                  const rivalImage = homeSide ? fixture.awayImageUrl : fixture.homeImageUrl;
                  return (
                    <div key={teamName} className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
                      <p className="mb-3 text-center text-sm text-gray-400">{fixture.league}</p>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                          {teamImage && <Image src={teamImage} alt="" width={36} height={36} unoptimized className="h-9 w-9 object-contain" />}
                          <span className="line-clamp-2 text-sm font-semibold">{teamName}</span>
                        </div>
                        <div className="shrink-0 text-center">
                          <p className="font-bold">{fixture.time || '—'}</p>
                          <p className="mt-1 text-xs text-gray-400">{formatH2HDate(fixture.date)}</p>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                          {rivalImage && <Image src={rivalImage} alt="" width={36} height={36} unoptimized className="h-9 w-9 object-contain" />}
                          <span className="line-clamp-2 text-sm font-semibold">{rivalName}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
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
