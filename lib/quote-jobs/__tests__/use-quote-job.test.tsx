/**
 * @jest-environment jsdom
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useQuoteJob } from '@/lib/quote-jobs/use-quote-job';
import { QUOTE_UPDATE_EVENT } from '@/lib/jobs/event-emitter';

jest.mock('@/lib/csrf-client', () => ({ csrfFetch: jest.fn() }));
import { csrfFetch } from '@/lib/csrf-client';

// ── Mock EventSource (not in jsdom) ──────────────────────────────────────────

interface FakeEsInstance {
  fire: (type: string, data: unknown) => void;
  close: () => void;
}
let lastFakeEs: FakeEsInstance | null = null;

class FakeEventSource {
  private _listeners: Record<string, Array<(e: { data: string }) => void>> = {};
  constructor(_url: string) {
    lastFakeEs = {
      fire: (type, data) => {
        (this._listeners[type] ?? []).forEach(h =>
          h({ data: JSON.stringify(data) }),
        );
      },
      close: () => {},
    };
  }
  addEventListener(type: string, handler: (e: { data: string }) => void) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }
  removeEventListener() {}
  close() {}
}

beforeAll(() => {
  (global as unknown as Record<string, unknown>).EventSource = FakeEventSource;
});

beforeEach(() => {
  jest.clearAllMocks();
  lastFakeEs = null;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function enqueueResponse(jobId: string) {
  return {
    ok: true,
    status: 202,
    headers: { get: () => 'application/json' },
    json: async () => ({ jobId, status: 'queued' }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useQuoteJob', () => {
  it('starts idle and exposes start()', () => {
    const { result } = renderHook(() => useQuoteJob('e1'));
    expect(result.current.state).toBe('idle');
    expect(typeof result.current.start).toBe('function');
  });

  it('transitions queued → done via SSE quote-update event', async () => {
    (csrfFetch as jest.Mock).mockResolvedValueOnce(enqueueResponse('j1'));

    const { result } = renderHook(() => useQuoteJob('e1'));

    await act(async () => {
      await result.current.start();
    });

    // After POST: state should be queued (SSE not fired yet)
    expect(result.current.state).toBe('queued');
    expect(lastFakeEs).not.toBeNull();

    // Fire SSE done event
    await act(async () => {
      lastFakeEs!.fire(QUOTE_UPDATE_EVENT, {
        id: 'j1',
        status: 'done',
        result: 'Dear Sirs, indicative rate USD 18/mt.',
      });
    });

    expect(result.current.state).toBe('done');
    expect(result.current.draft).toBe('Dear Sirs, indicative rate USD 18/mt.');
    expect(result.current.error).toBe('');
  });

  it('transitions queued → processing → done via SSE', async () => {
    (csrfFetch as jest.Mock).mockResolvedValueOnce(enqueueResponse('j2'));

    const { result } = renderHook(() => useQuoteJob('e2'));

    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('queued');

    await act(async () => {
      lastFakeEs!.fire(QUOTE_UPDATE_EVENT, { id: 'j2', status: 'processing' });
    });
    expect(result.current.state).toBe('processing');

    await act(async () => {
      lastFakeEs!.fire(QUOTE_UPDATE_EVENT, {
        id: 'j2',
        status: 'done',
        result: 'Final draft.',
      });
    });
    expect(result.current.state).toBe('done');
    expect(result.current.draft).toBe('Final draft.');
  });

  it('sets error state when SSE reports error', async () => {
    (csrfFetch as jest.Mock).mockResolvedValueOnce(enqueueResponse('j3'));

    const { result } = renderHook(() => useQuoteJob('e3'));
    await act(async () => { await result.current.start(); });

    await act(async () => {
      lastFakeEs!.fire(QUOTE_UPDATE_EVENT, {
        id: 'j3',
        status: 'error',
        error: 'claude CLI exited with status 1',
      });
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('claude CLI exited with status 1');
  });

  it('sets error state when the POST itself fails', async () => {
    (csrfFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'server_error', message: 'Service unavailable' }),
    });

    const { result } = renderHook(() => useQuoteJob('e4'));
    await act(async () => { await result.current.start(); });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toContain('Service unavailable');
    // EventSource must not have been created when POST fails
    expect(lastFakeEs).toBeNull();
  });

  it('falls back to polling status endpoint when no SSE event arrives (fake timers)', async () => {
    jest.useFakeTimers();

    (csrfFetch as jest.Mock)
      .mockResolvedValueOnce(enqueueResponse('j5'))       // enqueue POST
      .mockResolvedValueOnce({                            // status GET poll
        ok: true,
        json: async () => ({ status: 'done', result: 'Polled draft.' }),
      });

    const { result } = renderHook(() => useQuoteJob('e5'));

    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('queued');

    // Advance past the 8s SSE timeout — triggers startPolling → immediate doPoll
    await act(async () => {
      jest.advanceTimersByTime(8_001);
      // Flush the async doPoll promise
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state).toBe('done');
    expect(result.current.draft).toBe('Polled draft.');

    jest.useRealTimers();
  });

  it('polling fallback delivers draft via csrfFetch when SSE absent (CSRF-protected /api/ai/* endpoint)', async () => {
    // Regression test for prod bug #58639:
    // doPoll was calling plain fetch() on /api/ai/draft-quote/status — a CSRF-protected
    // endpoint under /api/ai/*. Middleware returns 403 without X-CSRF-Token header.
    // !res.ok silently swallowed the 403, so the hook never delivered the draft.
    // Fix: use csrfFetch (adds X-CSRF-Token header) in doPoll.
    jest.useFakeTimers();

    (csrfFetch as jest.Mock)
      .mockResolvedValueOnce(enqueueResponse('j-csrf'))          // enqueue POST
      .mockResolvedValueOnce({                                    // status GET poll
        ok: true,
        json: async () => ({ status: 'done', result: 'CSRF-safe draft.' }),
      });

    // Intentionally do NOT mock global.fetch — if the hook calls plain fetch(),
    // it throws/rejects, gets silently caught, and the hook stays in 'queued'.
    const savedFetch = global.fetch;
    (global as unknown as Record<string, unknown>).fetch = undefined;

    const { result } = renderHook(() => useQuoteJob('e-csrf'));
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('queued');

    // Advance past 8s SSE timeout → startPolling fires → immediate doPoll
    await act(async () => {
      jest.advanceTimersByTime(8_001);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.state).toBe('done');
    expect(result.current.draft).toBe('CSRF-safe draft.');

    (global as unknown as Record<string, unknown>).fetch = savedFetch;
    jest.useRealTimers();
  });

  it('retry() resets state and re-enqueues', async () => {
    (csrfFetch as jest.Mock)
      .mockResolvedValueOnce(enqueueResponse('j6'))
      .mockResolvedValueOnce(enqueueResponse('j7'));

    const { result } = renderHook(() => useQuoteJob('e6'));

    // First run → error
    await act(async () => { await result.current.start(); });
    await act(async () => {
      lastFakeEs!.fire(QUOTE_UPDATE_EVENT, { id: 'j6', status: 'error', error: 'fail' });
    });
    expect(result.current.state).toBe('error');

    // Retry → re-enqueues, state resets to queued
    await act(async () => { await result.current.retry(); });

    expect(result.current.state).toBe('queued');
    expect(result.current.error).toBe('');
    expect(csrfFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores SSE events for a different jobId', async () => {
    (csrfFetch as jest.Mock).mockResolvedValueOnce(enqueueResponse('j8'));

    const { result } = renderHook(() => useQuoteJob('e8'));
    await act(async () => { await result.current.start(); });

    // Fire event for a different job id
    await act(async () => {
      lastFakeEs!.fire(QUOTE_UPDATE_EVENT, {
        id: 'j-other',
        status: 'done',
        result: 'Should not arrive',
      });
    });

    // State must not change
    expect(result.current.state).toBe('queued');
    expect(result.current.draft).toBe('');
  });
});
