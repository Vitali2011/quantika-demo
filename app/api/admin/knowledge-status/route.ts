import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { listSources } from '@/lib/knowledge/governance';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * GET /api/admin/knowledge-status
 *
 * Returns the health status of all knowledge sources registered in the system,
 * along with a summary of fresh/stale/failed counts.
 *
 * Auth: requires X-Admin-Token header matching ADMIN_TOKEN env var
 * (same shared-secret pattern as /api/admin/cron-heartbeat).
 *
 * Response:
 * - sources: Array of SourceRow with health_signal computed
 * - summary: { fresh, stale, failed, total }
 * - last_check: ISO timestamp of this request
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

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
