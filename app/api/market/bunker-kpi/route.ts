import { NextResponse } from 'next/server';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { getStore } from '@/lib/session-store';

const VALID_GRADES = new Set(['VLSFO', 'MGO']);
const DEFAULT_PORT = 'NLRTM';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const grade = searchParams.get('grade')?.toUpperCase();

  if (!grade || !VALID_GRADES.has(grade)) {
    return NextResponse.json(
      { error: 'Missing or invalid grade. Use ?grade=VLSFO|MGO' },
      { status: 400 },
    );
  }

  const db = getStore().getDatabase();
  const row = getLatestBunkerPrice(db, DEFAULT_PORT, grade);

  if (!row) {
    return NextResponse.json(
      { error: `No data available for ${grade}` },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { value: row.price_usd_per_mt, unit: 'USD/mt', period: row.price_date },
    { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } },
  );
}
