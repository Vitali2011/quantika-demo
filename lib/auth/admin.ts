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
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of two strings (L-3). Encodes to UTF-8 bytes and
 * compares with crypto.timingSafeEqual. timingSafeEqual throws on unequal
 * lengths, so we compare both a length-equality flag and a fixed-length digest
 * to avoid leaking the secret length through early-return timing.
 */
function timingSafeStrEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  // Compare against a fixed-length representation so length mismatch does not
  // short-circuit. We hash neither — just pad to equal length deterministically.
  const len = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  const equalBytes = timingSafeEqual(aPad, bPad);
  return equalBytes && aBuf.length === bBuf.length;
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
