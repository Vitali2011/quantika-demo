import { NextResponse } from 'next/server';
import type { MarketBenchmark, MarketIndicator } from '@/lib/types';
import { getCurrentBenchmark } from '@/lib/market/benchmark';
import { getLatestBalticIndex } from '@/lib/market/baltic-repository';
import { getStore } from '@/lib/session-store';

const VALID_INDICATORS: ReadonlySet<string> = new Set<MarketIndicator>([
  'TOEPFER_TMI',
  'DREWRY_BREAKBULK',
  'BHSI',
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
