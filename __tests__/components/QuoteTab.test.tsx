/**
 * @jest-environment jsdom
 *
 * Behavioral tests for QuoteTab Save Draft and Send Quote handlers.
 * PI2: tests real click → handler → toast (ToastProvider + ToastContainer rendering).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
});

describe('QuoteTab — Save Draft + Send Quote handlers', () => {
  it('Save Draft click shows "Сохранено" toast', async () => {
    const user = userEvent.setup();
    renderQuoteTab();

    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Сохранено')
    );
  });

  it('Save Draft persists draft text to sessionStorage', async () => {
    const user = userEvent.setup();
    renderQuoteTab({ cargoEmailId: 'email-42' });

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Rate: $15,000/day');

    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    expect(sessionStorage.getItem('quote_draft_email-42')).toBe('Rate: $15,000/day');
  });

  it('Send Quote click shows "Отправлено" toast when draft is non-empty', async () => {
    const user = userEvent.setup();
    renderQuoteTab();

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Demo quote text');

    await user.click(screen.getByRole('button', { name: 'Send Quote' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Отправлено')
    );
  });

  it('Send Quote is disabled when draft is empty', () => {
    renderQuoteTab();
    expect(screen.getByRole('button', { name: 'Send Quote' })).toBeDisabled();
  });

  it('Send Quote is disabled when blockSend=true even with draft', async () => {
    const user = userEvent.setup();
    renderQuoteTab({
      confidence: {
        level: 'uncertain',
        blockSend: true,
        blockedFields: ['port'],
        fieldConfidences: [],
      },
    });

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Some quote text');

    expect(screen.getByRole('button', { name: 'Send Quote' })).toBeDisabled();
  });
});
