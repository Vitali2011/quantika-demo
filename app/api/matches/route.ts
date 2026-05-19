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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

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
    const limitParsed = limitParam ? parseInt(limitParam, 10) : undefined;
    const limit = limitParsed !== undefined && !isNaN(limitParsed) && limitParsed > 0 ? limitParsed : undefined;

    const offsetParam = searchParams.get('offset');
    const offsetParsed = offsetParam ? parseInt(offsetParam, 10) : undefined;
    const offset = offsetParsed !== undefined && !isNaN(offsetParsed) && offsetParsed >= 0 ? offsetParsed : undefined;

    const cargoTypes = searchParams.getAll('cargo_type');
    const route = searchParams.get('route') ?? undefined;

    const laycanFrom = searchParams.get('laycan_from');
    const laycanTo = searchParams.get('laycan_to');
    const _laycanFromMs = laycanFrom ? new Date(laycanFrom).getTime() : undefined;
    const _laycanToMs = laycanTo ? new Date(laycanTo).getTime() : undefined;
    const laycanFromMs = _laycanFromMs !== undefined && !isNaN(_laycanFromMs) ? _laycanFromMs : undefined;
    const laycanToMs = _laycanToMs !== undefined && !isNaN(_laycanToMs) ? _laycanToMs : undefined;

    const scoreMinParam = searchParams.get('score_min');
    const scoreMin = scoreMinParam !== null && !isNaN(Number(scoreMinParam)) ? Number(scoreMinParam) : undefined;

    const dwtMinParam = searchParams.get('dwt_min');
    const _dwtMin = dwtMinParam ? parseInt(dwtMinParam, 10) : undefined;
    const dwtMin = _dwtMin !== undefined && !isNaN(_dwtMin) ? _dwtMin : undefined;
    const dwtMaxParam = searchParams.get('dwt_max');
    const _dwtMax = dwtMaxParam ? parseInt(dwtMaxParam, 10) : undefined;
    const dwtMax = _dwtMax !== undefined && !isNaN(_dwtMax) ? _dwtMax : undefined;

    // Reverse / out-of-domain range validation (return 400, not silently empty).
    if (dwtMin !== undefined && dwtMax !== undefined && dwtMin > dwtMax) {
      return NextResponse.json(
        { error: 'dwt_min must be <= dwt_max' },
        { status: 400 }
      );
    }
    if (laycanFromMs !== undefined && laycanToMs !== undefined && laycanFromMs > laycanToMs) {
      return NextResponse.json(
        { error: 'laycan_from must be <= laycan_to' },
        { status: 400 }
      );
    }
    if (scoreMin !== undefined && (scoreMin < 0 || scoreMin > 100)) {
      return NextResponse.json(
        { error: 'score_min must be between 0 and 100' },
        { status: 400 }
      );
    }

    const matches = listMatches(db, {
      status,
      sortBy,
      sortDir,
      limit,
      offset,
      cargo_type: cargoTypes,
      route,
      laycan_from: laycanFromMs,
      laycan_to: laycanToMs,
      score_min: scoreMin,
      dwt_min: dwtMin,
      dwt_max: dwtMax,
    });

    return NextResponse.json({ matches }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const {
      cargo_id,
      vessel_id,
      score,
      reason,
      status,
      user_id,
      reason_structured,
      cargo_type,
      load_port,
      discharge_port,
      laycan_start,
      laycan_end,
      vessel_dwt,
    } = body;

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
      score: typeof score === 'number' && isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      reason: typeof reason === 'string' ? reason : '{}',
      status: VALID_STATUSES.includes(status as MatchStatus) ? (status as MatchStatus) : undefined,
      user_id: user_id ?? null,
      reason_structured: reason_structured ?? null,
      cargo_type: cargo_type ?? null,
      load_port: load_port ?? null,
      discharge_port: discharge_port ?? null,
      laycan_start: laycan_start ?? null,
      laycan_end: laycan_end ?? null,
      vessel_dwt: vessel_dwt ?? null,
    });

    return NextResponse.json(match, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
