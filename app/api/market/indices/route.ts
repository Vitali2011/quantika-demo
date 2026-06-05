import { NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { getIndexHistory } from '@/lib/market/market-indices-repository';
import { getBalticHistory } from '@/lib/market/baltic-repository';
import { getBunkerHistory } from '@/lib/market/bunker-repository';
import { getEuaHistory } from '@/lib/market/eua-repository';

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' };
const BALTIC_CODES = new Set(['bdi', 'bci', 'bsi', 'bhsi']);
const BUNKER_CODES = new Set(['vlsfo', 'mgo']);
const BUNKER_PORT = 'NLRTM';

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
    days = Math.min(365, parsed);
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

  // Bunker grades (VLSFO/MGO) live in bunker_prices at NLRTM.
  // Served without flag gate — same commodity data used by /api/market/bunker-kpi.
  if (BUNKER_CODES.has(name.toLowerCase())) {
    const grade = name.toUpperCase();
    const rows = getBunkerHistory(db, BUNKER_PORT, grade, days);
    const result = rows.map((row) => ({
      index_date: row.price_date,
      value: row.price_usd_per_mt,
      unit: 'USD/mt',
      source: row.source ?? '',
    }));
    return NextResponse.json(result, { headers: CACHE_HEADERS });
  }

  // EUA (EU Allowance) lives in eua_prices.
  // Served without flag gate — same commodity data used by /api/market/eua-kpi.
  if (name.toLowerCase() === 'eua') {
    const rows = getEuaHistory(db, 'spot', days);
    const result = rows.map((row) => ({
      index_date: row.price_date,
      value: row.price_eur_per_tco2,
      unit: '€/tCO₂',
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
