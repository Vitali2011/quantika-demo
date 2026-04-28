import { createHash } from 'crypto';

export interface OsMatch {
  id: string;
  caption: string;
  score: number;
  datasets: string[];
  properties: Record<string, string[]>;
}

const OS_API_BASE = 'https://api.opensanctions.org';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SANCTION_THRESHOLD = 0.85;

function hashQuery(name: string, dataset: string): string {
  return createHash('sha256').update(`${dataset}:${name}`).digest('hex');
}

function getDb(): import('better-sqlite3').Database | null {
  try {
    // Lazy import to avoid issues in test environments without DB
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStore } = require('../session-store') as { getStore: () => { getDatabase: () => import('better-sqlite3').Database } };
    return getStore().getDatabase();
  } catch {
    return null;
  }
}

function getCached(queryHash: string): OsMatch[] | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare<[string], { response_json: string; fetched_at: number }>(
      'SELECT response_json, fetched_at FROM opensanctions_cache WHERE query_hash = ?'
    ).get(queryHash);
    if (!row) return null;
    if (Date.now() - row.fetched_at > CACHE_TTL_MS) {
      db.prepare('DELETE FROM opensanctions_cache WHERE query_hash = ?').run(queryHash);
      return null;
    }
    return JSON.parse(row.response_json) as OsMatch[];
  } catch {
    return null;
  }
}

function setCache(queryHash: string, matches: OsMatch[]): void {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      'INSERT OR REPLACE INTO opensanctions_cache (query_hash, response_json, fetched_at) VALUES (?, ?, ?)'
    ).run(queryHash, JSON.stringify(matches), Date.now());
  } catch {
    // Cache write failure is non-fatal
  }
}

export async function searchOpenSanctions(name: string, dataset = 'default'): Promise<OsMatch[]> {
  const queryHash = hashQuery(name, dataset);

  const cached = getCached(queryHash);
  if (cached !== null) return cached;

  try {
    const response = await fetch(`${OS_API_BASE}/match/${dataset}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: {
          'q-0': { schema: 'Vessel', properties: { name: [name] } },
        },
      }),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      responses: Record<string, { results: OsMatch[] }>;
    };

    const matches = data.responses?.['q-0']?.results ?? [];
    setCache(queryHash, matches);
    return matches;
  } catch {
    return [];
  }
}

export async function checkVesselSanctions(
  vesselName: string,
  _imo?: string,
): Promise<{ sanctioned: boolean; matches: OsMatch[]; sources: string[] }> {
  const matches = await searchOpenSanctions(vesselName);
  const positiveMatches = matches.filter(m => m.score >= SANCTION_THRESHOLD);
  const sanctioned = positiveMatches.length > 0;
  const sources = Array.from(new Set(positiveMatches.flatMap(m => m.datasets)));
  return { sanctioned, matches, sources };
}
