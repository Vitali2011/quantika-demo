/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { csrfFetch } from '@/lib/csrf-client';

jest.mock('@/lib/csrf-client');
const mockToastError = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ error: mockToastError, success: jest.fn() }) }));

beforeEach(() => jest.clearAllMocks());

it('renders a draft on a 200 response', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ draft: 'Dear Sirs, ...' }),
  });
  render(<DraftQuoteCard emailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /draft quote/i }));
  await waitFor(() => expect(screen.getByDisplayValue(/Dear Sirs/)).toBeInTheDocument());
});

it('fires a toast with a friendly message on an empty-body error', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: false, status: 504,
    headers: { get: () => 'application/json' },
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  });
  render(<DraftQuoteCard emailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /draft quote/i }));
  await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  expect(mockToastError.mock.calls[0][0]).not.toContain('Unexpected end of JSON input');
});
