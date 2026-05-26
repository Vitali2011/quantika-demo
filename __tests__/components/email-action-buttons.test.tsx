/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('@/lib/csrf-client', () => ({
  csrfFetch: jest.fn(),
}));

import { csrfFetch } from '@/lib/csrf-client';
import { EmailActionButtons } from '@/components/email/EmailActionButtons';

const mockCsrfFetch = csrfFetch as jest.MockedFunction<typeof csrfFetch>;

function makeOkResponse(body: object) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function makeErrResponse(body: object) {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EmailActionButtons — PI2 behavioral (#484)', () => {
  it('renders Accept, Edit, Reject buttons', () => {
    render(<EmailActionButtons emailId="email-1" />);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('Accept click — calls POST /api/email/action with action=accept', async () => {
    mockCsrfFetch.mockResolvedValueOnce(makeOkResponse({ ok: true, status: 'RESPONDED' }) as never);
    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-1" />);

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/email/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ emailId: 'email-1', action: 'accept' }),
      })
    );
  });

  it('Accept click — shows "Action recorded" after success', async () => {
    mockCsrfFetch.mockResolvedValueOnce(makeOkResponse({ ok: true, status: 'RESPONDED' }) as never);
    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-1" />);

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(screen.getByText('Action recorded')).toBeInTheDocument()
    );
  });

  it('Reject click — calls POST /api/email/action with action=reject', async () => {
    mockCsrfFetch.mockResolvedValueOnce(makeOkResponse({ ok: true, status: 'INFO_ONLY' }) as never);
    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-42" />);

    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(mockCsrfFetch).toHaveBeenCalledWith(
      '/api/email/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ emailId: 'email-42', action: 'reject' }),
      })
    );
  });

  it('Reject click — shows "Action recorded" after success', async () => {
    mockCsrfFetch.mockResolvedValueOnce(makeOkResponse({ ok: true, status: 'INFO_ONLY' }) as never);
    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-42" />);

    await user.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(screen.getByText('Action recorded')).toBeInTheDocument()
    );
  });

  it('Edit click — does not call API (navigation-only action)', async () => {
    // jsdom cannot spy on location.assign; E2E covers actual navigation.
    // This verifies Edit does not trigger the csrfFetch path.
    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-7" />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(mockCsrfFetch).not.toHaveBeenCalled();
  });

  it('buttons are disabled while Accept action is in flight', async () => {
    let resolve: (v: unknown) => void;
    const pending = new Promise((res) => { resolve = res; });
    mockCsrfFetch.mockReturnValueOnce(pending as never);

    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-1" />);

    const acceptBtn = screen.getByRole('button', { name: 'Accept' });
    await user.click(acceptBtn);

    // All buttons disabled while busy
    expect(screen.getByRole('button', { name: /Accepting/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    resolve!(makeOkResponse({ ok: true, status: 'RESPONDED' }));
  });

  it('API error — shows error state without crashing', async () => {
    mockCsrfFetch.mockResolvedValueOnce(makeErrResponse({ error: 'Unauthorized' }) as never);
    const user = userEvent.setup();
    render(<EmailActionButtons emailId="email-1" />);

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    // Buttons should be re-enabled after error
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled()
    );
  });
});
