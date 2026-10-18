export type FixtureSport = "football" | "basketball" | "tennis";

export interface FixtureCards {
  home: { yellow: number; red: number; corners: number };
  away: { yellow: number; red: number; corners: number };
}

export interface FixtureStanding {
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
}

export interface LiveFixtureStatistics {
  shots: number | null;
  shotsOnTarget: number | null;
  corners: number | null;
  cards: number | null;
}

export interface Fixture {
  id: string;
  sport: FixtureSport;
  date: string;
  time: string;
  league: string;
  location?: string;
  competition?: string;
  homeTeam: string;
  awayTeam: string;
  homeImageUrl?: string;
  awayImageUrl?: string;
  matchId?: string;
  homeScore?: string;
  awayScore?: string;
  score?: string;
  status?: string;
  liveDisplay?: string;
  matchCards?: FixtureCards;
  liveStatistics?: LiveFixtureStatistics;
  odds?: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
}

export interface FixtureOption {
  id: string;
  name: string;
  season?: string;
}

export interface FixtureCatalogResponse {
  options: FixtureOption[];
}

export type FixtureResponse = {
  fixtures: Fixture[];
  errors?: Partial<Record<FixtureSport, string>>;
};
