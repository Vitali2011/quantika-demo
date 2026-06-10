/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { csrfFetch } from '@/lib/csrf-client';
import { QUOTE_UPDATE_EVENT } from '@/lib/jobs/event-emitter';

jest.mock('@/lib/csrf-client');
const mockToastError = jest.fn();
jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ error: mockToastError, success: jest.fn() }),
}));

// ── Mock EventSource (not in jsdom) ─────────────────────────────────────────

interface FakeEsInstance {
  fire: (type: string, data: unknown) => void;
}
let lastMockEs: FakeEsInstance | null = null;

class FakeEventSource {
  private _listeners: Record<string, Array<(e: { data: string }) => void>> = {};
  constructor(_url: string) {
    lastMockEs = {
      fire: (type, data) => {
        (this._listeners[type] ?? []).forEach(h =>
          h({ data: JSON.stringify(data) }),
        );
      },
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
  lastMockEs = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('renders a draft after SSE quote-update done event (PI2 behavioral)', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 202,
    headers: { get: () => 'application/json' },
    json: async () => ({ jobId: 'j1', status: 'queued' }),
  });
  render(<DraftQuoteCard emailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /draft quote/i }));

  // Wait for POST to complete and EventSource to be created
  await waitFor(() => expect(lastMockEs).not.toBeNull());

  // Fire SSE done event
  act(() => {
    lastMockEs!.fire(QUOTE_UPDATE_EVENT, {
      id: 'j1',
      status: 'done',
      result: 'Dear Sirs, ...',
    });
  });

  await waitFor(() =>
    expect(screen.getByDisplayValue(/Dear Sirs/)).toBeInTheDocument(),
  );
});

it('fires a toast with a friendly message on an empty-body error', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 504,
    headers: { get: () => 'application/json' },
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  });
  render(<DraftQuoteCard emailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /draft quote/i }));
  await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  expect(mockToastError.mock.calls[0][0]).not.toContain('Unexpected end of JSON input');
});
