/**
 * @jest-environment jsdom
 *
 * PI2 — #360 follow-up: Benchmark section removed entirely (ui-quote-cleanup).
 * These tests confirm no benchmark UI renders regardless of fetch outcome.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuoteTab } from '@/components/match/QuoteTab';
import { ToastProvider } from '@/components/ui/toast/toast-context';
import { ToastContainer } from '@/components/ui/toast/toast-container';

function renderWithToast(ui: React.ReactElement) {
  return render(
    <ToastProvider>{ui}<ToastContainer /></ToastProvider>
  );
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QuoteTab — Benchmark section removed (ui-quote-cleanup)', () => {
  it('does not render Benchmark heading', () => {
    renderWithToast(<QuoteTab />);
    expect(screen.queryByText(/benchmark/i)).not.toBeInTheDocument();
  });

  it('does not render a source link', () => {
    renderWithToast(<QuoteTab />);
    expect(screen.queryByText('source')).not.toBeInTheDocument();
  });

  it('does not fetch /api/market/benchmark', () => {
    renderWithToast(<QuoteTab />);
    const calls = (global.fetch as jest.Mock).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some(u => u.includes('/api/market/benchmark'))).toBe(false);
  });
});
