import type { NextRequest } from 'next/server';
import { verifyWebhookSignature } from '@/lib/whatsapp/signature';
import { getWhatsAppClient } from '@/lib/whatsapp/client';
import { routeIncomingMessage } from '@/lib/whatsapp/router';
import type { WhatsAppWebhookPayload } from '@/lib/whatsapp/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();

  // BUG-A1-2: guard against empty/missing body before signature verification
  if (!rawBody) {
    return new Response(JSON.stringify({ error: 'missing body' }), { status: 400 });
  }

  const signature = req.headers.get('x-hub-signature-256') ?? '';
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? '';

  if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    console.error('[whatsapp webhook] JSON parse error');
    return new Response('OK', { status: 200 });
  }

  const client = getWhatsAppClient();

  // Fire-and-forget: Meta requires 200 within 5s
  void (async () => {
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        try {
          const messages = change.value.messages ?? [];
          for (const msg of messages) {
            try {
              if (client) {
                await routeIncomingMessage(msg, client);
              } else {
                console.warn('[whatsapp webhook] no client configured, skipping message', msg.id);
              }
            } catch (err) {
              console.error('[whatsapp webhook] message handler error, continuing batch', msg.id, err);
            }
          }
        } catch (err) {
          // BUG-D6: malformed change (e.g. null value) must not abort remaining changes
          console.error('[whatsapp webhook] change processing error, skipping change', err);
        }
      }
    }
  })();

  return new Response('OK', { status: 200 });
}
