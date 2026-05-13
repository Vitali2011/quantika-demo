import { NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { getIndexHistory } from '@/lib/market/market-indices-repository';

export async function GET(_req: Request): Promise<NextResponse> {
  const db = getStore().getDatabase();
  const rows = getIndexHistory(db, 'tmi', 7);
  if (!rows.length) {
    return NextResponse.json({ error: 'No TMI data' }, { status: 404 });
  }
  const latest = rows[0];
  return NextResponse.json({
    value: latest.value,
    date: latest.index_date,
    unit: latest.unit,
  });
}
