import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { listSources } from '@/lib/knowledge/governance';

/**
 * GET /api/admin/knowledge-status
 *
 * Returns the health status of all knowledge sources registered in the system,
 * along with a summary of fresh/stale/failed counts.
 *
 * Auth: TODO - In Phase 1, this endpoint is temporarily open for development.
 * Production deployment requires admin session middleware (to be added in later phase).
 *
 * Response:
 * - sources: Array of SourceRow with health_signal computed
 * - summary: { fresh, stale, failed, total }
 * - last_check: ISO timestamp of this request
 */
export async function GET(req: NextRequest) {
  // TODO: Add admin auth check - await requireAdmin(req)
  // For Phase 1, allowing unauthenticated access for development/testing

  const db = getStore().getDb();
  const sources = listSources(db);

  const summary = sources.reduce(
    (acc, s) => {
      acc.total++;
      if (s.health_signal === 'ok') {
        acc.fresh++;
      } else if (s.health_signal === 'overdue' || s.health_signal === 'never_synced') {
        acc.stale++;
      } else if (s.health_signal === 'failing') {
        acc.failed++;
      }
      return acc;
    },
    { fresh: 0, stale: 0, failed: 0, total: 0 }
  );

  return NextResponse.json({
    sources,
    summary,
    last_check: new Date().toISOString(),
  });
}
