import { NextResponse } from 'next/server';
import { getLatestEuaPrice } from '@/lib/market/eua-repository';
import { getStore } from '@/lib/session-store';

export async function GET(): Promise<NextResponse> {
  const db = getStore().getDatabase();
  const row = getLatestEuaPrice(db, 'spot');

  if (!row) {
    return NextResponse.json(
      { error: 'No EUA data available' },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { value: row.price_eur_per_tco2, unit: '€/tCO₂', period: row.price_date },
    { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } },
  );
}
