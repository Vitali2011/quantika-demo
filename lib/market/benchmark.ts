import type { MarketBenchmark, MarketIndicator } from '@/lib/types';
import { fetchToepferTmi } from './toepfer-scraper';
import { getTmiBenchmarkFromDb } from './tmi-benchmark-fallback';
import { getStore } from '@/lib/session-store';

/** TTL for cached market benchmark entries: 7 days in milliseconds. */
const BENCHMARK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** In-memory cache keyed by indicator — avoids DB dependency in serverless contexts. */
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
  if (indicator === 'TOEPFER_TMI') {
    fetched = await fetchToepferTmi();
  }

  if (fetched) {
    memCache.set(indicator, { benchmark: fetched, cachedAt: Date.now() });
    return fetched;
  }

  // Return stale cache if available rather than null
  if (cached) {
    return cached.benchmark;
  }

  // For TOEPFER_TMI: fall back to DB value when scraper is unavailable
  if (indicator === 'TOEPFER_TMI') {
    try {
      const dbFallback = getTmiBenchmarkFromDb(getStore().getDatabase());
      if (dbFallback) {
        return dbFallback;
      }
    } catch {
      // DB unavailable — continue to null
    }
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
