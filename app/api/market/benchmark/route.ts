import { NextResponse } from 'next/server';
import type { MarketBenchmark, MarketIndicator } from '@/lib/types';
import { getCurrentBenchmark } from '@/lib/market/benchmark';
import { getLatestIndex } from '@/lib/market/market-indices-repository';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { getStore } from '@/lib/session-store';

const VALID_INDICATORS: ReadonlySet<string> = new Set<MarketIndicator>([
  'TOEPFER_TMI',
  'DREWRY_BREAKBULK',
  'BHSI',
  'BUNKER_ROTTERDAM',
  'EUA',
]);

/** Indicators sourced from the market_indices DB table (live data). */
const DB_INDICATORS = new Set<MarketIndicator>(['BHSI', 'TOEPFER_TMI']);

/** Maps API indicator name to market_indices.index_name. */
const MARKET_INDEX_NAME: Partial<Record<MarketIndicator, string>> = {
  BHSI: 'bhsi',
  TOEPFER_TMI: 'tmi',
};

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Intentionally public endpoint — returns only public commodity data (no PII).
 * No session check by design: equivalent to what public scrapers provide.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const indicator = searchParams.get('indicator');

  if (!indicator || !VALID_INDICATORS.has(indicator)) {
    return NextResponse.json(
      { error: 'Missing or invalid indicator. Use ?indicator=TOEPFER_TMI' },
      { status: 400 },
    );
  }

  const typedIndicator = indicator as MarketIndicator;
  let benchmark: MarketBenchmark | null = null;

  // DB-first lookup for BHSI and TOEPFER_TMI from market_indices (live data)
  if (DB_INDICATORS.has(typedIndicator)) {
    const db = getStore().getDatabase();
    const indexName = MARKET_INDEX_NAME[typedIndicator];
    if (indexName) {
      const row = getLatestIndex(db, indexName);
      if (row) {
        const ageMs = Date.now() - new Date(row.index_date).getTime();
        benchmark = {
          indicator: typedIndicator,
          value: row.value,
          unit: typedIndicator === 'TOEPFER_TMI' ? 'USD/day' : 'index',
          period: row.index_date,
          sourceUrl: row.source,
          fetchedAt: new Date().toISOString(),
          stale: ageMs > STALE_THRESHOLD_MS,
        };
      }
    }
  } else if (typedIndicator === 'BUNKER_ROTTERDAM') {
    const db = getStore().getDatabase();
    const row = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
    if (row) {
      benchmark = {
        indicator: typedIndicator,
        value: row.price_usd_per_mt,
        unit: 'USD/MT',
        period: row.price_date,
        sourceUrl: row.source,
        fetchedAt: new Date().toISOString(),
      };
    }
  } else if (typedIndicator === 'EUA') {
    const db = getStore().getDatabase();
    const row = getLatestEuaPrice(db);
    if (row) {
      benchmark = {
        indicator: typedIndicator,
        value: row.price_eur_per_tco2,
        unit: 'EUR/tCO₂',
        period: row.price_date,
        sourceUrl: row.source,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  // Fallback: scraper for TOEPFER_TMI, null for others
  if (!benchmark) {
    benchmark = await getCurrentBenchmark(typedIndicator);
  }

  if (!benchmark) {
    return NextResponse.json(
      { error: `No benchmark data available for ${indicator}` },
      { status: 404 },
    );
  }

  return NextResponse.json(benchmark, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
