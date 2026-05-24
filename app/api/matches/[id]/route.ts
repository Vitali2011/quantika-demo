import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { requireSession } from '@/lib/session';
import {
  getMatch,
  updateMatchStatus,
  updateMatchFreightRate,
} from '@/lib/matching/matches-repository';
import type { MatchStatus } from '@/lib/matching/matches-repository';
import { estimateFreightRate, computeEstimatedTce } from '@/lib/matching/tce-calculator';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: MatchStatus[] = ['shortlist', 'saved', 'dismissed', 'archived'];

function isFeatureEnabled(): boolean {
  return process.env.MATCHES_ENABLED === 'true';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json({ error: 'Feature disabled' }, { status: 503 });
  }

  try {
    const { id: idStr } = await context.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid match id' }, { status: 400 });
    }

    const db = getStore().getDatabase();
    const match = getMatch(db, id);

    // Return 404 for both missing matches and matches owned by other sessions
    if (!match || match.user_id !== sessionId) {
      return NextResponse.json({ error: `Match not found: ${id}` }, { status: 404 });
    }

    return NextResponse.json(match, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

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
    const { status, freight_rate_usd_per_mt } = body;

    const db = getStore().getDatabase();
    const existing = getMatch(db, id);

    if (!existing || existing.user_id !== sessionId) {
      return NextResponse.json(
        { error: `Match not found: ${id}` },
        { status: 404 }
      );
    }

    // Freight rate override path
    if (freight_rate_usd_per_mt !== undefined) {
      const rate = Number(freight_rate_usd_per_mt);
      if (!Number.isFinite(rate) || rate <= 0) {
        return NextResponse.json(
          { error: 'freight_rate_usd_per_mt must be a positive number' },
          { status: 400 }
        );
      }
      const freightEst = { rate, source: 'manual' as const, confidence: 1.0 };
      const tceEst = computeEstimatedTce(
        freightEst,
        existing.distance_nm ?? 0,
        existing.vessel_dwt ?? 0,
        0,
      );
      const updated = updateMatchFreightRate(db, id, rate, tceEst.tce_usd_per_day, 'manual');
      return NextResponse.json(updated, { status: 200 });
    }

    // Status update path
    if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status as MatchStatus)) {
      return NextResponse.json(
        { error: 'Field "status" is required and must be one of: shortlist, saved, dismissed, archived' },
        { status: 400 }
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
