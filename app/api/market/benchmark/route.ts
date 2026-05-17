import { NextResponse } from 'next/server';
import type { MarketBenchmark, MarketIndicator } from '@/lib/types';
import { getCurrentBenchmark } from '@/lib/market/benchmark';
import { getLatestBalticIndex } from '@/lib/market/baltic-repository';
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

/** Indicators sourced from the baltic_indices DB table (static seed). */
const DB_INDICATORS = new Set<MarketIndicator>(['BHSI', 'TOEPFER_TMI']);

function rowToMarketBenchmark(
  row: { value: number; price_date: string; source: string },
  indicator: MarketIndicator,
): MarketBenchmark {
  return {
    indicator,
    value: row.value,
    unit: indicator === 'TOEPFER_TMI' ? 'USD/day' : 'index',
    period: row.price_date,
    sourceUrl: row.source,
    fetchedAt: new Date().toISOString(),
  };
}

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

  // DB-first lookup for BHSI and TOEPFER_TMI (server-only, uses better-sqlite3)
  if (DB_INDICATORS.has(typedIndicator)) {
    const db = getStore().getDatabase();
    const row = getLatestBalticIndex(db, typedIndicator);
    if (row) {
      benchmark = rowToMarketBenchmark(row, typedIndicator);
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
