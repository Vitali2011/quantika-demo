import { NextResponse } from 'next/server';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { FALLBACK_EUA_EUR_PER_TCO2 } from '@/lib/constants';
import { getStore } from '@/lib/session-store';

export async function GET(): Promise<NextResponse> {
  const db = getStore().getDatabase();
  const row = getLatestEuaPrice(db, 'spot');

  // getLatestEuaPrice returns null when there is no row OR the latest row is
  // stale (> EUA_STALE_DAYS). Surface a fallback value + stale flag rather than
  // a hard 404 so the dashboard widget can degrade gracefully (mirrors the
  // benchmark route's `stale` contract).
  if (!row) {
    return NextResponse.json(
      { value: FALLBACK_EUA_EUR_PER_TCO2, unit: '€/tCO₂', period: null, stale: true },
      { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } },
    );
  }

  return NextResponse.json(
    { value: row.price_eur_per_tco2, unit: '€/tCO₂', period: row.price_date, stale: false },
    { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } },
  );
}
