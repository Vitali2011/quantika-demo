import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { listCharterers, upsertCharterer } from '@/lib/market/charterers-repository';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Input Contract:
 * - Feature flag OFF → 503 with {error: "feature disabled"}
 * - GET: list charterers, optional ?tier= filter
 * - POST: create charterer (body: {name, tier, require_lc?, notes?})
 * - POST: missing name/tier → 400 validation error
 * - POST: invalid tier → 400 validation error
 * - POST: empty name → 400 validation error
 */

function isFeatureEnabled(): boolean {
  return process.env.CHARTERER_CREDIT_ENABLED === 'true';
}

export async function GET(request?: NextRequest): Promise<NextResponse> {
  if (!isFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Feature disabled' },
      { status: 503 }
    );
  }

  try {
    const db = getStore().getDatabase();
    const tier = request?.nextUrl.searchParams.get('tier') ?? undefined;

    const charterers = listCharterers(db, tier);

    return NextResponse.json({ charterers }, { status: 200 });
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

  try {
    const body = await request.json();
    const { name, tier, require_lc, notes } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Field "name" is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (!tier || typeof tier !== 'string') {
      return NextResponse.json(
        { error: 'Field "tier" is required' },
        { status: 400 }
      );
    }

    // Validate tier enum
    const validTiers = ['blue-chip', 'second', 'weak'];
    if (!validTiers.includes(tier)) {
      return NextResponse.json(
        { error: `Field "tier" must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      );
    }

    const db = getStore().getDatabase();
    const id = randomBytes(16).toString('hex');

    upsertCharterer(db, {
      id,
      name: name.trim(),
      tier,
      payment_history: '[]',
      require_lc: require_lc ?? 0,
      notes: notes ?? null,
    });

    const charterer = {
      id,
      name: name.trim(),
      tier,
      payment_history: '[]',
      require_lc: require_lc ?? 0,
      notes: notes ?? null,
    };

    return NextResponse.json(charterer, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
