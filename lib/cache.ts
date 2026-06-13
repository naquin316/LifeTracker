import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// A small writable SQLite DB for caching Google API responses, kept separate
// from the read-only locations mirror so re-syncing never clobbers the cache.
const CACHE_PATH =
  process.env.CACHE_DB ?? path.join(process.cwd(), "data", "cache.db");

let _db: Database.Database | null = null;

function getCacheDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  _db = new Database(CACHE_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      ns TEXT NOT NULL,
      k  TEXT NOT NULL,
      v  TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (ns, k)
    );
  `);
  return _db;
}

/** Read a cached JSON value, or null if absent/expired. */
export function cacheGet<T>(ns: string, key: string, maxAgeSec?: number): T | null {
  const row = getCacheDb()
    .prepare(`SELECT v, created_at FROM kv WHERE ns = ? AND k = ?`)
    .get(ns, key) as { v: string; created_at: number } | undefined;
  if (!row) return null;
  if (maxAgeSec != null) {
    const age = Math.floor(Date.now() / 1000) - row.created_at;
    if (age > maxAgeSec) return null;
  }
  try {
    return JSON.parse(row.v) as T;
  } catch {
    return null;
  }
}

/** Store a JSON value under (ns, key). */
export function cacheSet(ns: string, key: string, value: unknown): void {
  getCacheDb()
    .prepare(
      `INSERT INTO kv (ns, k, v, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(ns, k) DO UPDATE SET v = excluded.v, created_at = excluded.created_at`,
    )
    .run(ns, key, JSON.stringify(value), Math.floor(Date.now() / 1000));
}

/**
 * Get-or-compute helper: returns the cached value if present, otherwise runs
 * `fn`, caches its result, and returns it. A null/undefined result is not
 * cached (so transient failures can be retried).
 */
export async function cached<T>(
  ns: string,
  key: string,
  fn: () => Promise<T>,
  maxAgeSec?: number,
): Promise<T> {
  const hit = cacheGet<T>(ns, key, maxAgeSec);
  if (hit !== null) return hit;
  const value = await fn();
  if (value !== null && value !== undefined) cacheSet(ns, key, value);
  return value;
}
