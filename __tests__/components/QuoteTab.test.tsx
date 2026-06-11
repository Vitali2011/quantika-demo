/**
 * @jest-environment jsdom
 *
 * Behavioral tests for QuoteTab Copy button and error handling.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ToastProvider } from '@/components/ui/toast/toast-context';
import { ToastContainer } from '@/components/ui/toast/toast-container';

jest.mock('@/lib/csrf-client', () => ({
  csrfFetch: jest.fn(),
}));

jest.mock('@/components/audit-trail', () => ({
  __esModule: true,
  default: () => null,
}));

import { QuoteTab } from '@/components/match/QuoteTab';

function renderQuoteTab(props: Partial<React.ComponentProps<typeof QuoteTab>> = {}) {
  return render(
    <ToastProvider>
      <QuoteTab cargoEmailId="email-1" {...props} />
      <ToastContainer />
    </ToastProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve(null) })
  ) as jest.Mock;
  // jsdom doesn't provide clipboard — install a writable mock
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('QuoteTab — Copy button', () => {
  it('Copy is disabled when textarea is empty', () => {
    renderQuoteTab();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('Copy is enabled when textarea has content', async () => {
    const user = userEvent.setup();
    renderQuoteTab();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Rate: $15,000/day');
    expect(screen.getByRole('button', { name: 'Copy' })).not.toBeDisabled();
  });

  it('shows Copied ✓ after clicking Copy, reverts after 1.5s', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderQuoteTab();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Some draft text');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied ✓' })).toBeInTheDocument()
    );
    act(() => { jest.advanceTimersByTime(1500); });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    );
  });

  it('Copy is disabled when textarea is cleared', async () => {
    const user = userEvent.setup();
    renderQuoteTab();
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'text');
    await user.clear(textarea);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});

describe('QuoteTab — generateDraft error shows toast', () => {
  it('calls toast.error with the error message when API returns non-ok', async () => {
    const { csrfFetch } = await import('@/lib/csrf-client');
    (csrfFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'ai_error', message: 'Gemini credentials missing' }),
    });

    const user = userEvent.setup();
    const { getByRole, findAllByText } = renderQuoteTab({ cargoEmailId: 'email-1' });

    await user.click(getByRole('button', { name: 'Generate' }));

    // Toast renders the error message in the DOM (toast + inline error both show it)
    const matches = await findAllByText('Gemini credentials missing');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // Verify at least one is from the toast (data-variant="error")
    const toastEl = matches.find(el => el.closest('[data-variant="error"]'));
    expect(toastEl).toBeTruthy();
  });

  it('shows inline error text when API returns non-ok', async () => {
    const { csrfFetch } = await import('@/lib/csrf-client');
    (csrfFetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'ai_error', message: 'AI draft generation failed' }),
    });

    const user = userEvent.setup();
    renderQuoteTab({ cargoEmailId: 'email-1' });

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      // Inline error paragraph shows the message
      const errorEl = screen.getByText('AI draft generation failed', { selector: 'p' });
      expect(errorEl).toBeInTheDocument();
    });
  });
});
