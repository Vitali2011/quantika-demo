/**
 * @jest-environment jsdom
 *
 * PI2 — #351: QuoteTab "Generate" button must enqueue a job and display the
 * draft delivered via SSE quote-update event.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuoteTab } from '@/components/match/QuoteTab';
import { ToastProvider } from '@/components/ui/toast/toast-context';
import { ToastContainer } from '@/components/ui/toast/toast-container';
import { QUOTE_UPDATE_EVENT } from '@/lib/jobs/event-emitter';

function renderWithToast(ui: React.ReactElement) {
  return render(
    <ToastProvider>{ui}<ToastContainer /></ToastProvider>
  );
}

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

// ── Fetch mock helpers ───────────────────────────────────────────────────────

const TEST_JOB_ID = 'test-job-1';

function mockFetchResponses() {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/ai/draft-quote')) {
      return Promise.resolve({
        ok: true,
        status: 202,
        headers: {
          get: (k: string) =>
            k.toLowerCase().includes('content-type') ? 'application/json' : null,
        },
        json: async () => ({ jobId: TEST_JOB_ID, status: 'queued' }),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  lastMockEs = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuoteTab — Generate Draft button (async job flow)', () => {
  it('shows Generate button when cargoEmailId is provided', () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="email-001" />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('shows Generate button as disabled when cargoEmailId is absent', () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab />);
    const btn = screen.getByRole('button', { name: /generate/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('POSTs to /api/ai/draft-quote with emailId on click', async () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="email-abc" />);

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ai/draft-quote',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ emailId: 'email-abc' }),
        }),
      );
    });
  });

  it('populates the draft textarea after SSE quote-update event (PI2 behavioral)', async () => {
    const draftText = 'Dear Captain, we offer USD 15/MT for the cargo.';
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="email-abc" />);

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    // Wait for POST to complete and EventSource to be created
    await waitFor(() => expect(lastMockEs).not.toBeNull());

    // Fire SSE done event — this is what delivers the draft to the UI
    act(() => {
      lastMockEs!.fire(QUOTE_UPDATE_EVENT, {
        id: TEST_JOB_ID,
        status: 'done',
        result: draftText,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(draftText);
    });
  });

  it('shows error message when POST fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/ai/draft-quote')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: {
            get: (k: string) =>
              k.toLowerCase().includes('content-type') ? 'application/json' : null,
          },
          json: async () => ({ error: 'Service unavailable' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    renderWithToast(<QuoteTab cargoEmailId="email-abc" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByText('Service unavailable', { selector: 'p' })).toBeInTheDocument();
    });
  });

  it('shows Retry button after error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: (k: string) =>
          k.toLowerCase().includes('content-type') ? 'application/json' : null,
      },
      json: async () => ({ error: 'ai_error', message: 'Failed' }),
    } as unknown as Response);

    renderWithToast(<QuoteTab cargoEmailId="email-abc" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('shows a friendly message (not raw SyntaxError) when the response body is empty', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/ai/draft-quote')) {
        return Promise.resolve({
          ok: false,
          status: 504,
          headers: {
            get: (k: string) =>
              k.toLowerCase().includes('content-type') ? 'application/json' : null,
          },
          json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });
    renderWithToast(<QuoteTab cargoEmailId="e1" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      const errP = document.querySelector('p.text-red-600');
      expect(errP).not.toBeNull();
      expect(errP?.textContent).not.toContain('Unexpected end of JSON input');
      expect(errP?.textContent?.toLowerCase()).toMatch(/timed out/);
    });
  });

  it('shows a friendly message (not raw SyntaxError) when response is HTML', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/ai/draft-quote')) {
        return Promise.resolve({
          ok: false,
          status: 502,
          headers: {
            get: (k: string) =>
              k.toLowerCase().includes('content-type') ? 'text/html' : null,
          },
          json: async () => { throw new SyntaxError("Unexpected token '<'"); },
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });
    renderWithToast(<QuoteTab cargoEmailId="e1" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      const errP = document.querySelector('p.text-red-600');
      expect(errP).not.toBeNull();
      expect(errP?.textContent).not.toContain('Unexpected token');
      expect(errP?.textContent?.toLowerCase()).toMatch(/unavailable/);
    });
  });

  it('includes matchId in the enqueue POST body when matchId prop is set', async () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="e1" matchId="54332" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls;
      const draftCall = calls.find((c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('/api/ai/draft-quote'),
      );
      expect(draftCall).toBeTruthy();
      const sentBody = JSON.parse((draftCall![1] as { body: string }).body);
      expect(sentBody.matchId).toBe('54332');
    });
  });

  it('omits matchId from body when matchId prop is absent', async () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="email-abc" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls;
      const draftCall = calls.find((c: unknown[]) =>
        typeof c[0] === 'string' && (c[0] as string).includes('/api/ai/draft-quote'),
      );
      expect(draftCall).toBeTruthy();
      const sentBody = JSON.parse((draftCall![1] as { body: string }).body);
      expect(sentBody.matchId).toBeUndefined();
    });
  });

  it('does not render a Benchmark section', () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="email-001" />);
    expect(screen.queryByText(/benchmark/i)).not.toBeInTheDocument();
  });

  it('does not render an Audit Trail section', () => {
    mockFetchResponses();
    renderWithToast(<QuoteTab cargoEmailId="email-001" />);
    expect(screen.queryByText(/audit trail/i)).not.toBeInTheDocument();
  });
});
