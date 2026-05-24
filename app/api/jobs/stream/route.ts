import { type NextRequest } from 'next/server';
import { requireSession } from '@/lib/session';
import { NextResponse } from 'next/server';
import { jobEvents } from '@/lib/jobs/event-emitter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authResult = requireSession(req);
  if (authResult instanceof NextResponse) return authResult;
  const { sessionId } = authResult;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: { type: string; data: unknown }) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
          );
        } catch {
          // stream already closed
        }
      };

      controller.enqueue(encoder.encode(': connected\n\n'));

      const off = jobEvents.subscribe(sessionId, send);

      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(hb);
        }
      }, 25000);

      req.signal.addEventListener('abort', () => {
        off();
        clearInterval(hb);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
