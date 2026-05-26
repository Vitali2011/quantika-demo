import { NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { getIndexHistory } from '@/lib/market/market-indices-repository';
import { getBalticHistory } from '@/lib/market/baltic-repository';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' };
const BALTIC_CODES = new Set(['bdi', 'bci', 'bsi', 'bhsi']);

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const daysParam = searchParams.get('days');

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  let days = 30;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return NextResponse.json({ error: 'days must be positive integer' }, { status: 400 });
    }
    days = parsed;
  }

  const db = getStore().getDatabase();

  // Baltic dry bulk indices (BDI/BCI/BSI/BHSI) live in baltic_indices, not market_indices.
  // Serve them without the MARKET_BENCHMARK_FULL_ENABLED gate (same as /api/market/baltic-kpi).
  if (BALTIC_CODES.has(name.toLowerCase())) {
    const rows = getBalticHistory(db, name.toUpperCase(), days);
    const result = rows.map((row) => ({
      index_date: row.price_date,
      value: row.value,
      unit: 'points',
      source: row.source ?? '',
    }));
    return NextResponse.json(result, { headers: CACHE_HEADERS });
  }

  if (process.env.MARKET_BENCHMARK_FULL_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Market benchmark service not available' },
      { status: 503 },
    );
  }

  const rows = getIndexHistory(db, name, days);
  const result = rows.map((row) => ({
    index_date: row.index_date,
    value: row.value,
    unit: row.unit,
    source: row.source,
  }));

  return NextResponse.json(result, { headers: CACHE_HEADERS });
}
