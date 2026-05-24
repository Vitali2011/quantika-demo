import { NextResponse } from 'next/server';
import { getLatestBalticIndex } from '@/lib/market/baltic-repository';
import { getStore } from '@/lib/session-store';

const VALID_CODES = new Set(['BDI', 'BCI', 'BSI', 'BHSI']);

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.toUpperCase();

  if (!code || !VALID_CODES.has(code)) {
    return NextResponse.json(
      { error: 'Missing or invalid code. Use ?code=BDI|BCI|BSI|BHSI' },
      { status: 400 },
    );
  }

  const db = getStore().getDatabase();
  const row = getLatestBalticIndex(db, code);

  if (!row) {
    return NextResponse.json(
      { error: `No data available for ${code}` },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { value: row.value, unit: 'points', period: row.price_date },
    { headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=1800' } },
  );
}
