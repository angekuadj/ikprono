import { query, queryOne } from "@/lib/pg";
import type { Fixture } from "@/lib/fixtures";

let schemaPromise: Promise<void> | undefined;

async function ensureCacheSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS espn_daily_cache (
          cache_key TEXT PRIMARY KEY,
          response JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS espn_fixture_cache (
          match_id TEXT PRIMARY KEY,
          fixture JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS espn_match_details_cache (
          match_id TEXT PRIMARY KEY,
          response JSONB NOT NULL,
          cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS espn_live_cache (
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

/** Réponse brute d'une journée ESPN, indexée par `<ligue>:<date>`. */
export async function saveEspnDailyResponse(
  cacheKey: string,
  response: unknown,
  fixtures: Fixture[] = []
): Promise<void> {
  await ensureCacheSchema();
  await query(
    `INSERT INTO espn_daily_cache (cache_key, response, cached_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET response = EXCLUDED.response, cached_at = NOW()`,
    [cacheKey, JSON.stringify(response)]
  );
  if (fixtures.length > 0) {
    await query(
      `INSERT INTO espn_fixture_cache (match_id, fixture, cached_at)
       SELECT entry.id, entry.fixture, NOW()
       FROM jsonb_to_recordset($1::jsonb) AS entry(id TEXT, fixture JSONB)
       ON CONFLICT (match_id) DO UPDATE SET fixture = EXCLUDED.fixture, cached_at = NOW()`,
      [JSON.stringify(fixtures.map(fixture => ({ id: fixture.id, fixture })))]
    );
  }
}

export async function loadEspnDailyResponse(cacheKey: string): Promise<{
  response: unknown;
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ response: unknown; cached_at: Date | string }>(
    "SELECT response, cached_at FROM espn_daily_cache WHERE cache_key = $1",
    [cacheKey]
  );
  if (!row) return null;
  return { response: row.response, cachedAt: new Date(row.cached_at).toISOString() };
}

export async function loadEspnCachedFixturesByIds(ids: string[]): Promise<Fixture[]> {
  if (ids.length === 0) return [];
  await ensureCacheSchema();
  const rows = await query<{ match_id: string; fixture: unknown }>(
    "SELECT match_id, fixture FROM espn_fixture_cache WHERE match_id = ANY($1::text[])",
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

/** Détail d'une rencontre ESPN (statistiques, plays, compositions). */
export async function saveEspnMatchDetails(matchId: string, response: unknown): Promise<void> {
  await ensureCacheSchema();
  await query(
    `INSERT INTO espn_match_details_cache (match_id, response, cached_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (match_id) DO UPDATE SET response = EXCLUDED.response, cached_at = NOW()`,
    [matchId, JSON.stringify(response)]
  );
}

export async function loadEspnMatchDetails(matchId: string): Promise<{
  response: unknown;
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ response: unknown; cached_at: Date | string }>(
    "SELECT response, cached_at FROM espn_match_details_cache WHERE match_id = $1",
    [matchId]
  );
  if (!row) return null;
  return { response: row.response, cachedAt: new Date(row.cached_at).toISOString() };
}

/** Dernières rencontres en direct connues, pour le repli hors ligne. */
export async function saveEspnLiveFixtures(fixtures: Fixture[]): Promise<void> {
  await ensureCacheSchema();
  await query(
    `INSERT INTO espn_live_cache (cache_key, fixtures, cached_at)
     VALUES ('latest', $1::jsonb, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET fixtures = EXCLUDED.fixtures, cached_at = NOW()`,
    [JSON.stringify(fixtures)]
  );
}

export async function loadEspnLiveFixtures(): Promise<{
  fixtures: Fixture[];
  cachedAt: string;
} | null> {
  await ensureCacheSchema();
  const row = await queryOne<{ fixtures: unknown; cached_at: Date | string }>(
    "SELECT fixtures, cached_at FROM espn_live_cache WHERE cache_key = 'latest'"
  );
  if (!row) return null;
  return {
    fixtures: Array.isArray(row.fixtures) ? row.fixtures.filter(isFixture) : [],
    cachedAt: new Date(row.cached_at).toISOString(),
  };
}
