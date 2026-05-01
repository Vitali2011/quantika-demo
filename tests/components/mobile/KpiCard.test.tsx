/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { KpiCard, fetchWithTimeout } from '@/components/market/KpiCard';

describe('KpiCard', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('renders Unavailable when url=null', () => {
    render(<KpiCard label="Bunker" url={null} unit="USD/t" />);
    expect(screen.getByTestId('kpi-unavailable')).toBeTruthy();
    expect(screen.getByText(/Unavailable/)).toBeTruthy();
  });

  it('renders OK state when fetch succeeds', async () => {
    const f = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ value: 1234, unit: 'USD/day', period: 'Apr 2026' }),
    }) as unknown as typeof fetch;

    await act(async () => {
      render(<KpiCard label="TMI" url="/api/x" unit="USD/day" fetchImpl={f} />);
    });
    await waitFor(() => expect(screen.queryByTestId('kpi-ok')).toBeTruthy());
    expect(screen.getByText('1,234')).toBeTruthy();
  });

  it('falls back to Unavailable when fetch is non-OK', async () => {
    const f = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    await act(async () => {
      render(<KpiCard label="TMI" url="/api/x" unit="USD/day" fetchImpl={f} />);
    });
    await waitFor(() => expect(screen.queryByTestId('kpi-unavailable')).toBeTruthy());
  });

  it('falls back to Unavailable when fetch rejects', async () => {
    const f = jest.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;
    await act(async () => {
      render(<KpiCard label="TMI" url="/api/x" unit="USD/day" fetchImpl={f} />);
    });
    await waitFor(() => expect(screen.queryByTestId('kpi-unavailable')).toBeTruthy());
  });

  it('fetchWithTimeout aborts after the configured timeout', async () => {
    let aborted = false;
    const f = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        (init.signal as AbortSignal).addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }) as unknown as typeof fetch;

    const result = await fetchWithTimeout('/api/slow', 50, f);
    expect(result).toBeNull();
    expect(aborted).toBe(true);
  });

  it('returns null from fetchWithTimeout when timing out', async () => {
    const f = jest.fn().mockImplementation((_u: string, init: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        (init.signal as AbortSignal).addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }) as unknown as typeof fetch;

    const result = await fetchWithTimeout('/api/x', 30, f);
    expect(result).toBeNull();
  });

  it('shows Retry button in Unavailable state when url is provided', async () => {
    const f = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    await act(async () => {
      render(<KpiCard label="BHSI" url="/api/x" unit="index" fetchImpl={f} />);
    });
    await waitFor(() => expect(screen.queryByTestId('kpi-retry')).toBeTruthy());
  });

  it('does not show Retry when url=null (no point retrying nothing)', () => {
    render(<KpiCard label="EUA" url={null} unit="EUR/t" />);
    expect(screen.queryByTestId('kpi-retry')).toBeNull();
  });
});
