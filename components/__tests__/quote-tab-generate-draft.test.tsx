/**
 * @jest-environment jsdom
 *
 * PI2 — #351: QuoteTab "Generate" button must POST to /api/ai/draft-quote
 * and populate the draft textarea with the returned text.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuoteTab } from '@/components/match/QuoteTab';

function mockFetchResponses(draftText: string) {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/market/benchmark')) {
      return Promise.resolve({
        ok: false,
        json: async () => null,
      } as Response);
    }
    if (String(url).includes('/api/ai/draft-quote')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ draft: draftText }),
      } as Response);
    }
    return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QuoteTab — Generate Draft button (fix #351)', () => {
  it('shows Generate button when cargoEmailId is provided', () => {
    mockFetchResponses('');
    render(<QuoteTab cargoEmailId="email-001" />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('shows Generate button as disabled when cargoEmailId is absent', () => {
    mockFetchResponses('');
    render(<QuoteTab />);
    const btn = screen.getByRole('button', { name: /generate/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it('POSTs to /api/ai/draft-quote with emailId on click', async () => {
    const draftText = 'Dear Captain, we offer USD 15/MT for the cargo.';
    mockFetchResponses(draftText);
    render(<QuoteTab cargoEmailId="email-abc" />);

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

  it('populates the draft textarea with the API response', async () => {
    const draftText = 'Dear Captain, we offer USD 15/MT for the cargo.';
    mockFetchResponses(draftText);
    render(<QuoteTab cargoEmailId="email-abc" />);

    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue(draftText);
    });
  });

  it('shows error message when API fails', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/api/ai/draft-quote')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Service unavailable' }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
    });

    render(<QuoteTab cargoEmailId="email-abc" />);
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByText('Service unavailable')).toBeInTheDocument();
    });
  });

  it('Send Quote is disabled when draft textarea is empty', () => {
    mockFetchResponses('');
    render(<QuoteTab cargoEmailId="email-001" />);
    const sendBtn = screen.getByRole('button', { name: /send quote/i });
    expect(sendBtn).toBeDisabled();
  });

  it('Send Quote is enabled after draft textarea is filled', () => {
    mockFetchResponses('');
    render(<QuoteTab cargoEmailId="email-001" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'USD 15/MT' } });
    const sendBtn = screen.getByRole('button', { name: /send quote/i });
    expect(sendBtn).not.toBeDisabled();
  });
});
