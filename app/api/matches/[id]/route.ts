import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import {
  getMatch,
  updateMatchStatus,
} from '@/lib/matching/matches-repository';
import type { MatchStatus } from '@/lib/matching/matches-repository';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];

function isFeatureEnabled(): boolean {
  return process.env.MATCHES_ENABLED === 'true';
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const { id: idStr } = await context.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json(
        { error: 'Invalid match id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status as MatchStatus)) {
      return NextResponse.json(
        { error: 'Field "status" is required and must be one of: shortlist, saved, dismissed, archived' },
        { status: 400 }
      );
    }

    const db = getStore().getDatabase();

    const existing = getMatch(db, id);
    if (!existing) {
      return NextResponse.json(
        { error: `Match not found: ${id}` },
        { status: 404 }
      );
    }

    const updated = updateMatchStatus(db, id, status as MatchStatus);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    if (error instanceof Error && /Invalid transition/i.test(error.message)) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
