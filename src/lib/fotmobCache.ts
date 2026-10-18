import { pool, query, queryOne } from "@/lib/pg";
import type { Fixture, FixtureStanding } from "@/lib/fixtures";

let schemaPromise: Promise<void> | undefined;

async function ensureCacheSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS fotmob_daily_cache (
          match_date TEXT PRIMARY KEY,
          response JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS fotmob_fixture_cache (
          match_id TEXT PRIMARY KEY,
          match_date TEXT NOT NULL,
          fixture JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS fotmob_match_details_cache (
          match_id TEXT PRIMARY KEY,
          response JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS fotmob_standings_cache (
          league_id TEXT PRIMARY KEY,
          standings JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS fotmob_live_cache (
          cache_key TEXT PRIMARY KEY,
          fixtures JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

function isFixture(value: unknown): value is Fixture {
  return typeof value === "object" && value !== null
    && "id" in value && typeof value.id === "string"
    && "date" in value && typeof value.date === "string"
    && "homeTeam" in value && typeof value.homeTeam === "string"
    && "awayTeam" in value && typeof value.awayTeam === "string"
    && "league" in value && typeof value.league === "string";
}

export async function saveFotMobDailyResponse(
  date: string,
  response: unknown,
  fixtures: Fixture[]
): Promise<void> {
  await ensureCacheSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO fotmob_daily_cache (match_date, response, cached_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (match_date) DO UPDATE SET response = EXCLUDED.response, cached_at = NOW()`,
      [date, JSON.stringify(response)]
    );
    if (fixtures.length > 0) {
      await client.query(
        `INSERT INTO fotmob_fixture_cache (match_id, match_date, fixture, cached_at)
         SELECT entry.id, entry.date, entry.fixture, NOW()
         FROM jsonb_to_recordset($1::jsonb) AS entry(id TEXT, date TEXT, fixture JSONB)
         ON CONFLICT (match_id) DO UPDATE
         SET match_date = EXCLUDED.match_date, fixture = EXCLUDED.fixture, cached_at = NOW()`,
        [JSON.stringify(fixtures.map(fixture => ({
          id: fixture.id,
          date: fixture.date,
          fixture,
        })))]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadFotMobDailyResponse(date: string): Promise<{
  response: unknown;
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ response: unknown; cached_at: Date | string }>(
    "SELECT response, cached_at FROM fotmob_daily_cache WHERE match_date = $1",
    [date]
  );
  if (!row) return null;
  return { response: row.response, cachedAt: new Date(row.cached_at).toISOString() };
}

export async function saveFotMobMatchDetails(matchId: string, response: unknown): Promise<void> {
  await ensureCacheSchema();
  await query(
    `INSERT INTO fotmob_match_details_cache (match_id, response, cached_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (match_id) DO UPDATE SET response = EXCLUDED.response, cached_at = NOW()`,
    [matchId, JSON.stringify(response)]
  );
}

export async function loadFotMobMatchDetails(matchId: string): Promise<{
  response: unknown;
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ response: unknown; cached_at: Date | string }>(
    "SELECT response, cached_at FROM fotmob_match_details_cache WHERE match_id = $1",
    [matchId]
  );
  if (!row) return null;
  return { response: row.response, cachedAt: new Date(row.cached_at).toISOString() };
}

export async function saveFotMobStandings(leagueId: string, standings: FixtureStanding[]): Promise<void> {
  await ensureCacheSchema();
  await query(
    `INSERT INTO fotmob_standings_cache (league_id, standings, cached_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (league_id) DO UPDATE SET standings = EXCLUDED.standings, cached_at = NOW()`,
    [leagueId, JSON.stringify(standings)]
  );
}

export async function loadFotMobStandings(leagueId: string): Promise<{
  standings: FixtureStanding[];
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ standings: unknown; cached_at: Date | string }>(
    "SELECT standings, cached_at FROM fotmob_standings_cache WHERE league_id = $1",
    [leagueId]
  );
  if (!row) return null;
  return {
    standings: Array.isArray(row.standings) ? row.standings.filter(isFixtureStanding) : [],
    cachedAt: new Date(row.cached_at).toISOString(),
  };
}

function isFixtureStanding(value: unknown): value is FixtureStanding {
  return typeof value === "object"
    && value !== null
    && "team" in value && typeof value.team === "string"
    && "position" in value && typeof value.position === "number"
    && "played" in value && typeof value.played === "number"
    && "won" in value && typeof value.won === "number"
    && "drawn" in value && typeof value.drawn === "number"
    && "lost" in value && typeof value.lost === "number"
    && "goalsFor" in value && typeof value.goalsFor === "number"
    && "goalsAgainst" in value && typeof value.goalsAgainst === "number"
    && "goalDifference" in value && typeof value.goalDifference === "number"
    && "points" in value && typeof value.points === "number";
}

export async function saveFotMobLiveFixtures(fixtures: Fixture[]): Promise<void> {
  await ensureCacheSchema();
  await query(
    `INSERT INTO fotmob_live_cache (cache_key, fixtures, cached_at)
     VALUES ('latest', $1::jsonb, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET fixtures = EXCLUDED.fixtures, cached_at = NOW()`,
    [JSON.stringify(fixtures)]
  );
}

export async function loadFotMobLiveFixtures(): Promise<{
  fixtures: Fixture[];
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ fixtures: unknown; cached_at: Date | string }>(
    "SELECT fixtures, cached_at FROM fotmob_live_cache WHERE cache_key = 'latest'"
  );
  if (!row) return null;
  const fixtures = Array.isArray(row.fixtures) ? row.fixtures.filter(isFixture) : [];
  return { fixtures, cachedAt: new Date(row.cached_at).toISOString() };
}

export async function loadFotMobFixturesByIds(ids: string[]): Promise<Fixture[]> {
  if (ids.length === 0) return [];
  await ensureCacheSchema();
  const rows = await query<{ match_id: string; fixture: unknown }>(
    "SELECT match_id, fixture FROM fotmob_fixture_cache WHERE match_id = ANY($1::text[])",
    [ids]
  );
  const byId = new Map<string, Fixture>();
  for (const row of rows) {
    if (isFixture(row.fixture)) byId.set(row.match_id, row.fixture);
  }
  return ids.flatMap(id => {
    const fixture = byId.get(id);
    return fixture ? [fixture] : [];
  });
}
