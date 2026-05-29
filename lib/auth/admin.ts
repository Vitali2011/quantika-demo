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
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of two strings (L-3). Both sides are hashed to a
 * fixed-width sha256 digest first, then compared with crypto.timingSafeEqual.
 * Hashing collapses inputs of any length to equal-width (32-byte) digests, so the
 * comparison is constant-time REGARDLESS of input length — the previous pad-to-
 * max(len) approach leaked the secret length through length-dependent work, a
 * timing oracle. Equal digest widths also mean timingSafeEqual never throws.
 * sha256 of distinct strings differs with overwhelming probability, so digest
 * equality is equivalent to string equality for this auth check.
 */
function timingSafeStrEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN not configured on server' },
      { status: 500 },
    );
  }

  const provided = req.headers.get('X-Admin-Token');
  if (!provided || !timingSafeStrEqual(provided, expected)) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing X-Admin-Token header' },
      { status: 401 },
    );
  }

  return null;
}
