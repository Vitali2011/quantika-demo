import { NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';
import { listSources } from '@/lib/knowledge/governance';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const db = getStore().getDatabase();
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
      { fresh: 0, stale: 0, failed: 0, total: 0 },
    );

    const status = summary.failed > 0 ? 'degraded' : 'healthy';
    const httpStatus = summary.failed > 0 ? 503 : 200;

    return NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
        sources_total: summary.total,
        sources_fresh: summary.fresh,
        sources_stale: summary.stale,
        sources_failed: summary.failed,
      },
      { status: httpStatus },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
