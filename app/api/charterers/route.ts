import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { listCharterers, upsertCharterer } from '@/lib/market/charterers-repository';
import { sanitizeText } from '@/lib/sanitize-text';
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
 *
 * Auth: gated by middleware demo_auth cookie. Charterers are shared reference
 * data (not session-scoped), so no handler-level session_id check.
 */

function isFeatureEnabled(): boolean {
  return process.env.CHARTERER_CREDIT_ENABLED === 'true';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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
    // L-8: log the real error server-side, return a generic message to the client.
    console.error('[charterers] request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
    const validTiers = ['blue-chip', 'second', 'weak'] as const;
    type ChartererTier = typeof validTiers[number];
    if (!validTiers.includes(tier as 'blue-chip' | 'second' | 'weak')) {
      return NextResponse.json(
        { error: `Field "tier" must be one of: ${validTiers.join(', ')}` },
        { status: 400 }
      );
    }

    const db = getStore().getDatabase();
    const id = randomBytes(16).toString('hex');

    const sanitizedName = sanitizeText(name.trim());
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Field "name" is required and cannot be empty' },
        { status: 400 }
      );
    }
    const sanitizedNotes = notes != null ? sanitizeText(String(notes)) : null;

    upsertCharterer(db, {
      id,
      name: sanitizedName,
      tier: tier as ChartererTier,
      payment_history: '[]',
      require_lc: require_lc ?? 0,
      notes: sanitizedNotes,
    });

    const charterer = {
      id,
      name: sanitizedName,
      tier: tier as ChartererTier,
      payment_history: '[]',
      require_lc: require_lc ?? 0,
      notes: sanitizedNotes,
    };

    return NextResponse.json(charterer, { status: 201 });
  } catch (error) {
    // L-8: log the real error server-side, return a generic message to the client.
    console.error('[charterers] request failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
