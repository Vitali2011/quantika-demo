/**
 * POST /api/admin/cron-heartbeat
 *
 * Heartbeat endpoint for cron jobs to report successful execution.
 * Stores (cron_name, last_seen_at) in knowledge_sources.metadata.
 *
 * Auth: requires X-Cron-Secret header matching CRON_SECRET env var.
 *
 * Input contract:
 * - Missing/empty/null cron_name → 400
 * - Missing X-Cron-Secret header → 401
 * - Invalid X-Cron-Secret → 401
 * - Valid request → 200, stores heartbeat timestamp in metadata
 * - Duplicate calls → last write wins (timestamp updated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/session-store';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: verify X-Cron-Secret header
  const cronSecret = req.headers.get('X-Cron-Secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on server' },
      { status: 500 }
    );
  }

  if (!cronSecret || cronSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing X-Cron-Secret header' },
      { status: 401 }
    );
  }

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { cron_name } = body;

  // Validate cron_name
  if (!cron_name || typeof cron_name !== 'string' || cron_name.trim() === '') {
    return NextResponse.json(
      { error: 'cron_name is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  // Store heartbeat timestamp
  const lastSeenAt = new Date().toISOString();
  const db = getStore().getDb();

  try {
    // Store heartbeat in knowledge_sources.metadata for the OFAC source
    // (using OFAC as the canonical source for sanctions cron tracking)
    const source = db.prepare(`
      SELECT metadata FROM knowledge_sources WHERE slug = ?
    `).get('ofac') as any;

    let metadata: any = {};
    if (source?.metadata) {
      try {
        metadata = JSON.parse(source.metadata);
      } catch {
        metadata = {};
      }
    }

    // Initialize cron_heartbeats structure if needed
    if (!metadata.cron_heartbeats) {
      metadata.cron_heartbeats = {};
    }

    // Update heartbeat timestamp
    metadata.cron_heartbeats[cron_name] = lastSeenAt;

    // Write back to database
    const updateResult = db.prepare(`
      UPDATE knowledge_sources
      SET metadata = ?, updated_at = CURRENT_TIMESTAMP
      WHERE slug = ?
    `).run(JSON.stringify(metadata), 'ofac');

    // FINDING-003: if the canonical 'ofac' source row doesn't exist (e.g.
    // bootstrap not run), the UPDATE silently affects 0 rows and we used to
    // return 200 OK — heartbeat lost without any signal to monitoring.
    // Now: return 404 so the caller / cron job alerts loudly.
    if (updateResult.changes === 0) {
      return NextResponse.json(
        {
          error: 'Unknown source slug — heartbeat not stored. Run knowledge bootstrap first.',
          slug: 'ofac',
          cron_name,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      cron_name,
      last_seen_at: lastSeenAt,
    });
  } catch (error) {
    // L-8: log server-side, do not reflect the raw error string to the client.
    console.error('[cron-heartbeat] failed to store heartbeat:', error);
    return NextResponse.json(
      { error: 'Failed to store heartbeat' },
      { status: 500 }
    );
  }
}
