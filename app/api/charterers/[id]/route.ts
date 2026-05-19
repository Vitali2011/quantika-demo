import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import {
  getCharterer,
  upsertCharterer,
  deleteCharterer,
} from '@/lib/market/charterers-repository';

export const dynamic = 'force-dynamic';

/**
 * Input Contract:
 * - Feature flag OFF → 503 with {error: "feature disabled"}
 * - GET: returns charterer by id or 404
 * - PUT: updates charterer or 404
 * - DELETE: deletes charterer or 404
 * - Empty id → 404 or routing error
 *
 * Auth: gated by middleware demo_auth cookie. Charterers are shared reference
 * data (not session-scoped), so no handler-level session_id check.
 */

function isFeatureEnabled(): boolean {
  return process.env.CHARTERER_CREDIT_ENABLED === 'true';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const db = getStore().getDatabase();

    const charterer = getCharterer(db, id);

    if (!charterer) {
      return NextResponse.json(
        { error: 'Charterer not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(charterer, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const db = getStore().getDatabase();

    // Check if charterer exists
    const existing = getCharterer(db, id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Charterer not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, tier, payment_history, require_lc, notes } = body;

    // Validate tier if provided
    if (tier !== undefined) {
      const validTiers = ['blue-chip', 'second', 'weak'];
      if (!validTiers.includes(tier)) {
        return NextResponse.json(
          { error: `Field "tier" must be one of: ${validTiers.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Update with new values or keep existing
    upsertCharterer(db, {
      id,
      name: name ?? existing.name,
      tier: tier ?? existing.tier,
      payment_history: payment_history ?? existing.payment_history,
      require_lc: require_lc !== undefined ? require_lc : existing.require_lc,
      notes: notes !== undefined ? notes : existing.notes,
    });

    const updated = getCharterer(db, id);

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const db = getStore().getDatabase();

    // Check if charterer exists
    const existing = getCharterer(db, id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Charterer not found' },
        { status: 404 }
      );
    }

    deleteCharterer(db, id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
