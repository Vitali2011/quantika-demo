import { withSentryApiHandler } from '@/lib/sentry-api';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

jest.mock('@sentry/nextjs', () => ({
  getClient: jest.fn(),
  startSpan: jest.fn(),
  captureException: jest.fn(),
}));

const mockGetClient = Sentry.getClient as jest.Mock;
const mockStartSpan = Sentry.startSpan as jest.Mock;
const mockCaptureException = Sentry.captureException as jest.Mock;

const descriptor = { method: 'POST', path: '/api/ai/classify' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('withSentryApiHandler — no-op when Sentry client absent', () => {
  beforeEach(() => {
    mockGetClient.mockReturnValue(undefined);
  });

  it('calls the original handler directly without Sentry', async () => {
    const response = NextResponse.json({ ok: true });
    const handler = jest.fn().mockResolvedValue(response);
    const wrapped = withSentryApiHandler(handler, descriptor);

    const req = new Request('http://localhost/api/ai/classify', { method: 'POST' });
    const result = await wrapped(req);

    expect(result).toBe(response);
    expect(handler).toHaveBeenCalledWith(req);
    expect(mockStartSpan).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('does not call captureException on error when client absent', async () => {
    const error = new Error('handler error');
    const handler = jest.fn().mockRejectedValue(error);
    const wrapped = withSentryApiHandler(handler, descriptor);

    const req = new Request('http://localhost/api/ai/classify', { method: 'POST' });
    await expect(wrapped(req)).rejects.toThrow('handler error');
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});

describe('withSentryApiHandler — active Sentry client', () => {
  beforeEach(() => {
    mockGetClient.mockReturnValue({ dsn: 'https://test@sentry.io/1' });
    // startSpan executes the callback immediately
    mockStartSpan.mockImplementation((_spanCtx: unknown, cb: () => unknown) => cb());
  });

  it('creates a span with correct op and name', async () => {
    const response = NextResponse.json({ ok: true });
    const handler = jest.fn().mockResolvedValue(response);
    const wrapped = withSentryApiHandler(handler, descriptor);

    const req = new Request('http://localhost/api/ai/classify', { method: 'POST' });
    await wrapped(req);

    expect(mockStartSpan).toHaveBeenCalledWith(
      { op: 'http.server', name: 'POST /api/ai/classify' },
      expect.any(Function),
    );
  });

  it('returns the handler result unchanged', async () => {
    const response = NextResponse.json({ count: 42 }, { status: 200 });
    const handler = jest.fn().mockResolvedValue(response);
    const wrapped = withSentryApiHandler(handler, descriptor);

    const req = new Request('http://localhost/api/ai/classify', { method: 'POST' });
    const result = await wrapped(req);

    expect(result).toBe(response);
  });

  it('captures exception and re-throws on handler error', async () => {
    const error = new Error('route blew up');
    const handler = jest.fn().mockRejectedValue(error);
    const wrapped = withSentryApiHandler(handler, descriptor);

    const req = new Request('http://localhost/api/ai/classify', { method: 'POST' });
    await expect(wrapped(req)).rejects.toThrow('route blew up');

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      tags: { route: '/api/ai/classify', method: 'POST' },
    });
  });

  it('passes all arguments to the handler (context params)', async () => {
    const response = NextResponse.json({ id: 'sc-1' });
    const handler = jest.fn().mockResolvedValue(response);
    const wrapped = withSentryApiHandler(handler, { method: 'GET', path: '/api/demo-scenarios/[id]' });

    const req = new Request('http://localhost/api/demo-scenarios/sc-1');
    const ctx = { params: Promise.resolve({ id: 'sc-1' }) };
    await wrapped(req, ctx);

    expect(handler).toHaveBeenCalledWith(req, ctx);
  });
});
