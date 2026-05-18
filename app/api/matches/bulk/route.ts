import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import { requireAdmin } from '@/lib/auth/admin';
import {
  getMatch,
  updateMatchStatus,
} from '@/lib/matching/matches-repository';
import type { MatchStatus, StoredMatch } from '@/lib/matching/matches-repository';

export const dynamic = 'force-dynamic';

const BULK_PATCH_VALID_TARGET_STATUSES: MatchStatus[] = ['saved', 'dismissed', 'archived'];

function isFeatureEnabled(): boolean {
  return process.env.MATCHES_ENABLED === 'true';
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 503 });
  }

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids, status } = body as { ids?: unknown; status?: unknown };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Field "ids" must be a non-empty array' }, { status: 400 });
  }

  if (
    typeof status !== 'string' ||
    !BULK_PATCH_VALID_TARGET_STATUSES.includes(status as MatchStatus)
  ) {
    return NextResponse.json(
      { error: `Field "status" must be one of: ${BULK_PATCH_VALID_TARGET_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const targetStatus = status as MatchStatus;
  const db = getStore().getDatabase();

  const txn = db.transaction(() => {
    const updated: StoredMatch[] = [];

    for (const id of ids) {
      const existing = getMatch(db, id as number);
      if (!existing) {
        throw { code: 'NOT_FOUND', id };
      }
      try {
        const updatedMatch = updateMatchStatus(db, id as number, targetStatus);
        updated.push(updatedMatch);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Invalid transition')) {
          throw { code: 'INVALID_TRANSITION', id };
        }
        throw err;
      }
    }

    return updated;
  });

  try {
    const updated = txn();
    return NextResponse.json({ updated }, { status: 200 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; id: number };
      if (e.code === 'NOT_FOUND') {
        return NextResponse.json({ error: `Match not found: ${e.id}` }, { status: 404 });
      }
      if (e.code === 'INVALID_TRANSITION') {
        return NextResponse.json(
          { error: `Invalid status transition for match ${e.id}`, failed_id: e.id },
          { status: 400 }
        );
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 503 });
  }

  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  const adminResult = requireAdmin(request);
  if (adminResult instanceof NextResponse) return adminResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids } = body as { ids?: unknown };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Field "ids" must be a non-empty array' }, { status: 400 });
  }

  const db = getStore().getDatabase();

  const txn = db.transaction(() => {
    for (const id of ids) {
      const existing = getMatch(db, id as number);
      if (!existing) {
        throw { code: 'NOT_FOUND', id };
      }
      db.prepare('DELETE FROM matches WHERE id = ?').run(id as number);
    }
    return ids as number[];
  });

  try {
    const deleted = txn();
    return NextResponse.json({ deleted }, { status: 200 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; id: number };
      if (e.code === 'NOT_FOUND') {
        return NextResponse.json(
          { error: `Match not found: ${e.id}`, missing_id: e.id },
          { status: 404 }
        );
      }
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
