import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import { getMatch } from '@/lib/matching/matches-repository';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  try {
    const { id: idStr } = await context.params;
    const matchId = parseInt(idStr, 10);
    if (isNaN(matchId) || matchId < 1) {
      return NextResponse.json({ error: 'Invalid match id' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { counterRate } = body as Record<string, unknown>;
    if (counterRate === undefined || counterRate === null) {
      return NextResponse.json({ error: 'counterRate is required' }, { status: 400 });
    }
    const rate = typeof counterRate === 'string' ? parseFloat(counterRate) : Number(counterRate);
    if (!isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: 'counterRate must be a positive number' }, { status: 400 });
    }

    const db = getStore().getDatabase();

    const match = getMatch(db, matchId);
    if (!match || match.user_id !== sessionId) {
      return NextResponse.json({ error: `Match not found: ${matchId}` }, { status: 404 });
    }

    const result = db
      .prepare(
        `INSERT INTO counter_offers (match_id, user_id, counter_rate, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(matchId, sessionId, rate, Date.now());

    return NextResponse.json({ id: result.lastInsertRowid, matchId, counterRate: rate }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
