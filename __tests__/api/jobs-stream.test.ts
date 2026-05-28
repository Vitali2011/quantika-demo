import { GET } from '@/app/api/jobs/stream/route';
import { requireSession } from '@/lib/session';
import { NextRequest } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

const mockRequireSession = requireSession as jest.Mock;

describe('GET /api/jobs/stream', () => {
  it('returns 401 without auth', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireSession.mockReturnValue(NextResponse.json({ error: 'No session' }, { status: 401 }));
    const req = new NextRequest('http://localhost/api/jobs/stream');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns SSE response with correct headers when authenticated', async () => {
    mockRequireSession.mockReturnValue({ session: {}, sessionId: 'test-sid' });
    const controller = new AbortController();
    const req = new NextRequest('http://localhost/api/jobs/stream', { signal: controller.signal });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    controller.abort();
  });

  it('includes x-accel-buffering: no header', async () => {
    mockRequireSession.mockReturnValue({ session: {}, sessionId: 'test-sid-2' });
    const controller = new AbortController();
    const req = new NextRequest('http://localhost/api/jobs/stream', { signal: controller.signal });
    const res = await GET(req);
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    controller.abort();
  });

  it('returns 200 even when signal is already aborted (regression #626 — no 503)', async () => {
    mockRequireSession.mockReturnValue({ session: {}, sessionId: 'test-sid-3' });
    const controller = new AbortController();
    controller.abort(); // abort BEFORE the handler runs
    const req = new NextRequest('http://localhost/api/jobs/stream', { signal: controller.signal });
    const res = await GET(req);
    // Route must return a valid Response (200+SSE), never throw/503
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('stream body starts with SSE connected comment when not pre-aborted', async () => {
    mockRequireSession.mockReturnValue({ session: {}, sessionId: 'test-sid-4' });
    const controller = new AbortController();
    const req = new NextRequest('http://localhost/api/jobs/stream', { signal: controller.signal });
    const res = await GET(req);
    expect(res.body).not.toBeNull();
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain(': connected');
    controller.abort();
    reader.cancel();
  });
});
