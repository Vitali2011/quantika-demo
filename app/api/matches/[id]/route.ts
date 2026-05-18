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

function checkAuth(request: NextRequest): NextResponse | null {
  const authResult = requireSession(request);
  // If requireSession returned a truthy non-session value (e.g. a 401 NextResponse), return it
  if (authResult && !((authResult as { session?: unknown }).session)) {
    return authResult as NextResponse;
  }
  // If undefined or session object, proceed (skip auth or auth passed)
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const { id: idStr } = await context.params;
    const id = parseInt(idStr, 10);

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
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
