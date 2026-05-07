import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { getStore } from '@/lib/session-store';
import { reportSyncStarted, reportSyncFailure } from '@/lib/knowledge/governance';
import { KNOWLEDGE_REGISTRY } from '@/lib/knowledge/bootstrap';
import { requireAdmin } from '@/lib/auth/admin';

/**
 * POST /api/admin/knowledge/refresh
 *
 * Manual trigger endpoint for refreshing a knowledge source.
 * Spawns a background process to run the refresh script.
 *
 * Auth: requires X-Admin-Token header matching ADMIN_TOKEN env var
 * (same shared-secret pattern as /api/admin/cron-heartbeat).
 *
 * Request body:
 * - slug: string (required) - must match a slug in KNOWLEDGE_REGISTRY
 *
 * Response (202 Accepted):
 * - sync_log_id: number - ID of the created sync log entry
 * - slug: string - echoed back
 * - status: 'started'
 * - message: string - confirmation message
 *
 * Error responses:
 * - 400 Bad Request: missing slug, invalid slug, or slug not in registry
 * - 500 Internal Server Error: failed to start refresh process
 *
 * SECURITY:
 * - Slug is validated against KNOWLEDGE_REGISTRY whitelist before use
 * - Uses child_process.spawn with array args (NOT exec) to prevent shell injection
 * - No user input is passed directly to shell
 */

// Build whitelist set for O(1) lookup
const VALID_SLUGS = new Set(KNOWLEDGE_REGISTRY.map((r) => r.slug));

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Input validation: slug is required
  const { slug } = body;

  // Empty/falsy check
  if (!slug || typeof slug !== 'string' || slug.trim() === '') {
    return NextResponse.json(
      { error: 'slug is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  // Whitelist validation (SECURITY CRITICAL)
  if (!VALID_SLUGS.has(slug)) {
    return NextResponse.json(
      { error: `Unknown slug: ${slug}. Must be one of: ${Array.from(VALID_SLUGS).join(', ')}` },
      { status: 400 }
    );
  }

  // Get database and create sync log entry
  const db = getStore().getDb();
  let syncLogId: number;

  try {
    syncLogId = reportSyncStarted(db, slug);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create sync log entry', details: String(error) },
      { status: 500 }
    );
  }

  // Spawn refresh process in background (fire-and-forget)
  // SECURITY: Using spawn with array args prevents shell injection
  // The slug is already validated against whitelist above
  //
  // FINDING-004: previously a failed spawn() (binary not found, OOM) only
  // logged to console and still returned 202 — but the sync_log row stayed
  // in status='running' forever (until the next reportSyncStarted aborted
  // it via KG-2 defense). That was a real production hole when "next call"
  // never came. Now we close the row immediately and return 503.
  try {
    const child = spawn('npm', ['run', 'knowledge:refresh', '--', slug], {
      detached: true,
      stdio: 'ignore',
    });

    // Detach the child process so it continues after parent exits
    child.unref();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Failed to spawn refresh process for ${slug}:`, err);

    // Close the sync_log row immediately so it doesn't sit as 'running' forever.
    // KG-2 abort-orphan-on-next-start logic stays as defense-in-depth, but this
    // patch closes the hole explicitly.
    try {
      reportSyncFailure(db, syncLogId, err);
    } catch (closeErr) {
      console.error(
        `Additionally failed to close sync_log id=${syncLogId} after spawn failure:`,
        closeErr,
      );
    }

    return NextResponse.json(
      {
        error: `Failed to start refresh process: ${err.message}`,
        sync_log_id: syncLogId,
        slug,
        status: 'failed',
      },
      { status: 503 },
    );
  }

  // Return 202 Accepted immediately
  return NextResponse.json(
    {
      sync_log_id: syncLogId,
      slug,
      status: 'started',
      message: `Refresh job started for ${slug}`,
    },
    { status: 202 }
  );
}
