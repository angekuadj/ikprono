import { Pool, type PoolConfig, type QueryResultRow } from "pg";

function poolConfig(): PoolConfig {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  return {
    host: process.env.PGHOST ?? "/var/run/postgresql",
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE ?? "fotmob",
    user: process.env.PGUSER ?? "angek",
    password: process.env.PGPASSWORD,
    max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

const globalPool = globalThis as typeof globalThis & { __ikpronoFotMobPool?: Pool };

if (!globalPool.__ikpronoFotMobPool) {
  const pool = new Pool(poolConfig());
  pool.on("error", error => {
    console.error("Unexpected idle PostgreSQL cache connection error.", error);
  });
  globalPool.__ikpronoFotMobPool = pool;
}

export const pool = globalPool.__ikpronoFotMobPool;

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const result = await pool.query<T>(sql, params as never[]);
  return result.rows[0];
}
