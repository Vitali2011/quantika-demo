/**
 * POST /api/integrations/pipedrive/webhook
 *
 * Receives Pipedrive webhook events, verifies the HMAC-SHA256 signature,
 * and persists a notification record asynchronously.
 *
 * Security model (mirrors WhatsApp webhook handler):
 *   1. Check PIPEDRIVE_WEBHOOK_SECRET is present → 500 if missing.
 *   2. Reject empty bodies → 400.
 *   3. Compute HMAC-SHA256 of raw body bytes and compare with
 *      x-pipedrive-signature header (hex) using a timing-safe comparison.
 *      → 401 if missing or invalid.
 *   4. Fire-and-forget DB write via setImmediate so we respond < 500ms.
 *   5. Return 200.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/session-store';
import { writeNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipedriveWebhookPayload {
  event: string;
  meta?: {
    action?: string;
    object?: string;
    [key: string]: unknown;
  };
  current?: Record<string, unknown>;
  previous?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  // timingSafeEqual requires same-length Buffers; pad/truncate won't happen
  // for valid hex but we must guard against length mismatch to avoid throws.
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Ensure the secret is configured — misconfiguration should surface as 500.
  const secret = process.env.PIPEDRIVE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[pipedrive webhook] PIPEDRIVE_WEBHOOK_SECRET is not set');
    return new Response(JSON.stringify({ error: 'server misconfiguration' }), { status: 500 });
  }

  // 2. Read raw body text.
  const rawBody = await req.text();

  // 3. Guard against empty body.
  if (!rawBody) {
    return new Response(JSON.stringify({ error: 'missing body' }), { status: 400 });
  }

  // 4. Verify HMAC signature.
  const signature = req.headers.get('x-pipedrive-signature');
  if (!signature) {
    return new Response('Unauthorized', { status: 401 });
  }

  let signatureValid = false;
  try {
    signatureValid = verifySignature(rawBody, signature, secret);
  } catch {
    // e.g. odd-length hex in header — treat as invalid
    signatureValid = false;
  }

  if (!signatureValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 5. Parse JSON payload.
  let payload: PipedriveWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PipedriveWebhookPayload;
  } catch {
    console.error('[pipedrive webhook] JSON parse error');
    // Still acknowledge receipt to prevent Pipedrive retrying bad payloads.
    return new Response('OK', { status: 200 });
  }

  // 6. Persist notification asynchronously — do not block the response.
  setImmediate(() => {
    try {
      const db = getStore().getDb();
      writeNotification(db, {
        source: 'pipedrive',
        event: payload.event ?? 'unknown',
        payload: rawBody,
      });
    } catch (err) {
      console.error('[pipedrive webhook] failed to write notification', err);
    }
  });

  return new Response('OK', { status: 200 });
}
