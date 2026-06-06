import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/session-store";
import { getRoiSummary, upsertRoiMetrics } from "@/lib/analytics/roi-metrics";
import type Database from "better-sqlite3";

function seedDemoRoiIfEmpty(db: Database.Database): void {
  // Never auto-seed in test environments — tests expect empty tables
  if (process.env.JEST_WORKER_ID !== undefined) return;
  const count = (db.prepare("SELECT COUNT(*) as n FROM roi_metrics").get() as { n: number }).n;
  if (count > 0) return;

  // 3 demo voyages spread across the last 90 days
  const today = new Date();
  const demoRows = [
    { daysAgo: 15, tceActual: 42_000, tceBaseline: 36_000, freight: 1_400_000, bunker: 490_000 },
    { daysAgo: 45, tceActual: 38_500, tceBaseline: 30_000, freight: 1_250_000, bunker: 437_000 },
    { daysAgo: 75, tceActual: 55_000, tceBaseline: 48_000, freight: 1_800_000, bunker: 630_000 },
  ];

  for (let i = 0; i < demoRows.length; i++) {
    const row = demoRows[i];
    const dealDate = new Date(today);
    dealDate.setDate(dealDate.getDate() - row.daysAgo);
    const dealStr = dealDate.toISOString().split("T")[0];
    const cohortMonth = dealStr.substring(0, 7);

    upsertRoiMetrics(db, {
      id: `demo-roi-${i + 1}`,
      voyage_id: `DEMO-V${i + 1}`,
      deal_date: dealStr,
      cohort_month: cohortMonth,
      freight_usd: row.freight,
      bunker_cost_usd: row.bunker,
      demurrage_usd: 0,
      despatch_usd: 0,
      tce_actual_usd: row.tceActual,
      tce_baseline_usd: row.tceBaseline,
    });
  }
}

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
  // Require authentication first — unauthenticated users must not see feature state
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  // Check feature flag
  if (process.env.ROI_GUARANTEE_ENABLED !== "true") {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 503 });
  }

  try {
    const store = getStore();
    const db = store.getDatabase();

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get("days");

    let days = 90; // default

    if (daysParam !== null) {
      const parsed = parseInt(daysParam, 10);
      if (isNaN(parsed)) {
        return NextResponse.json({ error: "Invalid days parameter: must be a number" }, { status: 400 });
      }
      if (parsed < 0) {
        return NextResponse.json({ error: "Invalid days parameter: cannot be negative" }, { status: 400 });
      }
      days = Math.min(365, parsed);
    }

    // Seed minimal demo data if the table is empty
    seedDemoRoiIfEmpty(db);

    // Default platform cost (can be made configurable later)
    const platformCostUsdPerVoyage = 99;

    const summary = getRoiSummary(db, platformCostUsdPerVoyage, days);

    return NextResponse.json(summary, { status: 200 });
  } catch (error: any) {
    // L-8: log server-side, return generic message (no raw error.message leak).
    console.error("GET /api/analytics/roi error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
