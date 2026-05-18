import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import {
  listMatches,
  createMatch,
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const db = getStore().getDatabase();
    const searchParams = request.nextUrl.searchParams;

    const statusParam = searchParams.get('status');
    const status = statusParam && VALID_STATUSES.includes(statusParam as MatchStatus)
      ? (statusParam as MatchStatus)
      : undefined;

    const sortByParam = searchParams.get('sort_by');
    const sortBy = sortByParam === 'created_at' ? 'created_at' : 'score';

    const sortDirParam = searchParams.get('sort_dir');
    const sortDir = sortDirParam === 'asc' ? 'asc' : 'desc';

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const offsetParam = searchParams.get('offset');
    const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

    const matches = listMatches(db, { status, sortBy, sortDir, limit, offset });

    return NextResponse.json({ matches }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { cargo_id, vessel_id, score, reason, status, user_id } = body;

    if (!cargo_id || typeof cargo_id !== 'string' || cargo_id.trim() === '') {
      return NextResponse.json(
        { error: 'Field "cargo_id" is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (!vessel_id || typeof vessel_id !== 'string' || vessel_id.trim() === '') {
      return NextResponse.json(
        { error: 'Field "vessel_id" is required and cannot be empty' },
        { status: 400 }
      );
    }

    const db = getStore().getDatabase();

    const match = createMatch(db, {
      cargo_id,
      vessel_id,
      score: typeof score === 'number' ? score : 0,
      reason: typeof reason === 'string' ? reason : '{}',
      status: VALID_STATUSES.includes(status as MatchStatus) ? (status as MatchStatus) : undefined,
      user_id: user_id ?? null,
    });

    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
