import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { getRoiSummary } from '@/lib/analytics/roi-metrics';

/**
 * GET /api/analytics/roi?days=90
 *
 * Returns ROI summary for the specified lookback period.
 *
 * Query params:
 * - days: number (optional, default 90) - lookback period in days
 *
 * Feature flag: ROI_GUARANTEE_ENABLED
 */
export async function GET(request: NextRequest) {
  // Check feature flag
  if (process.env.ROI_GUARANTEE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 503 });
  }

  try {
    const store = getStore();
    const db = store.getDatabase();

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get('days');

    let days = 90; // default

    if (daysParam !== null) {
      const parsed = parseInt(daysParam, 10);
      if (isNaN(parsed)) {
        return NextResponse.json({ error: 'Invalid days parameter: must be a number' }, { status: 400 });
      }
      if (parsed < 0) {
        return NextResponse.json({ error: 'Invalid days parameter: cannot be negative' }, { status: 400 });
      }
      days = parsed;
    }

    // Default platform cost (can be made configurable later)
    const platformCostUsdPerVoyage = 99;

    const summary = getRoiSummary(db, platformCostUsdPerVoyage, days);

    return NextResponse.json(summary, { status: 200 });
  } catch (error: any) {
    console.error('GET /api/analytics/roi error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
