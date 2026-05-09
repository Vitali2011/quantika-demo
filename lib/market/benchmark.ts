import type { MarketBenchmark, MarketIndicator } from '@/lib/types';
import { fetchToepferTmi } from './toepfer-scraper';
import { getLatestBalticIndex } from './baltic-repository';
import { getStore } from '@/lib/session-store';

/** TTL for cached market benchmark entries: 7 days in milliseconds. */
const BENCHMARK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** In-memory cache keyed by indicator — avoids repeated DB reads in serverless contexts. */
const memCache = new Map<MarketIndicator, { benchmark: MarketBenchmark; cachedAt: number }>();

/** @internal Test helper — clears the in-memory cache. */
export function _clearCacheForTesting(): void {
  memCache.clear();
}

function isFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < BENCHMARK_TTL_MS;
}

/**
 * Returns the latest benchmark for the given indicator.
 *
 * - BHSI: reads from baltic_indices DB; returns null if not found.
 * - TOEPFER_TMI: reads from baltic_indices DB; falls back to fetchToepferTmi() if not found.
 * - DREWRY_BREAKBULK: no source available, returns null.
 *
 * Reads from in-memory cache first; fetches fresh if stale or missing.
 */
export async function getCurrentBenchmark(
  indicator: MarketIndicator,
): Promise<MarketBenchmark | null> {
  const cached = memCache.get(indicator);
  if (cached && isFresh(cached.cachedAt)) {
    return cached.benchmark;
  }

  let fetched: MarketBenchmark | null = null;

  if (indicator === 'BHSI' || indicator === 'TOEPFER_TMI') {
    const db = getStore().getDatabase();
    const row = getLatestBalticIndex(db, indicator);

    if (row) {
      fetched = {
        indicator,
        value: row.value,
        unit: indicator === 'TOEPFER_TMI' ? 'USD/day' : 'index',
        period: row.price_date,
        sourceUrl: row.source,
        fetchedAt: new Date().toISOString(),
      };
    } else if (indicator === 'TOEPFER_TMI') {
      // Fallback to scraper when DB has no row
      fetched = await fetchToepferTmi();
    }
    // For BHSI with no DB row: fetched stays null (no scraper fallback)
  }
  // DREWRY_BREAKBULK: no data source, fetched stays null

  if (fetched) {
    memCache.set(indicator, { benchmark: fetched, cachedAt: Date.now() });
    return fetched;
  }

  // Return stale cache if available rather than null
  if (cached) {
    return cached.benchmark;
  }

  return null;
}

/**
 * Formats a benchmark as a human-readable reference string.
 * Example: "Toepfer TMI Apr 2026 — $12,683/day TCE"
 */
export function formatBenchmarkReference(benchmark: MarketBenchmark): string {
  const formattedValue = benchmark.value.toLocaleString('en-US');
  return `Toepfer TMI ${benchmark.period} — $${formattedValue}/day TCE`;
}
