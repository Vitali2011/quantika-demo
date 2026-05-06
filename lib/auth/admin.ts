/**
 * Admin auth helper — shared-secret model mirroring CRON_SECRET pattern.
 *
 * Endpoints under /api/admin/* validate an X-Admin-Token header against
 * the ADMIN_TOKEN env var. This is the same shape as the cron heartbeat
 * (X-Cron-Secret) and the WhatsApp internal ingest (QUANTIKA_INTERNAL_TOKEN)
 * patterns already used elsewhere in the codebase.
 *
 * Behaviour:
 * - ADMIN_TOKEN unset on server         → return 500 NextResponse (misconfigured server)
 * - X-Admin-Token header missing/wrong  → return 401 NextResponse
 * - Valid header                        → return null (caller proceeds)
 *
 * Usage:
 *
 *   export async function POST(req: NextRequest) {
 *     const denied = requireAdmin(req);
 *     if (denied) return denied;
 *     // ... handler logic
 *   }
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN not configured on server' },
      { status: 500 },
    );
  }

  const provided = req.headers.get('X-Admin-Token');
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing X-Admin-Token header' },
      { status: 401 },
    );
  }

  return null;
}
