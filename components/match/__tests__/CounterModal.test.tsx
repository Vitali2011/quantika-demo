/**
 * @jest-environment jsdom
 *
 * TDD tests for CounterModal — Issue #617
 * Verifies: Counter button opens modal, rate input present, submit calls API,
 * close dismisses, error state handled.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { CounterModal } from '../CounterModal';

jest.mock('@/lib/csrf-client', () => ({
  csrfFetch: jest.fn(),
}));

import { csrfFetch } from '@/lib/csrf-client';
const mockCsrfFetch = csrfFetch as jest.Mock;

const defaultProps = {
  matchDbId: 42,
  onSuccess: jest.fn(),
};

function renderModal(props = {}) {
  return render(<CounterModal {...defaultProps} {...props} />);
}

describe('CounterModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Trigger button ────────────────────────────────────────────────────────────

  it('renders the Counter trigger button enabled (not disabled)', () => {
    renderModal();
    const btn = screen.getByTestId('counter-button');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('modal is not visible initially', () => {
    renderModal();
    expect(screen.queryByTestId('counter-dialog')).not.toBeInTheDocument();
  });

  // ── Opening modal ─────────────────────────────────────────────────────────────

  it('opens modal when Counter button is clicked', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    expect(screen.getByTestId('counter-dialog')).toBeInTheDocument();
  });

  it('counter-rate input is present in the modal', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    expect(screen.getByTestId('counter-rate-input')).toBeInTheDocument();
  });

  it('counter-rate input accepts numeric value', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    const input = screen.getByTestId('counter-rate-input');
    await userEvent.clear(input);
    await userEvent.type(input, '18.50');
    // type="number" normalizes trailing zeros
    expect((input as HTMLInputElement).value).toBe('18.5');
  });

  // ── Submit ────────────────────────────────────────────────────────────────────

  it('submit button is present in the modal', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    expect(screen.getByTestId('counter-submit')).toBeInTheDocument();
  });

  it('calls API on submit with counterRate', async () => {
    mockCsrfFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    const input = screen.getByTestId('counter-rate-input');
    await userEvent.clear(input);
    await userEvent.type(input, '22');
    fireEvent.click(screen.getByTestId('counter-submit'));
    await waitFor(() =>
      expect(mockCsrfFetch).toHaveBeenCalledWith(
        '/api/matches/42/counter',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"counterRate":22'),
        }),
      ),
    );
  });

  it('closes dialog and calls onSuccess after successful submit', async () => {
    const onSuccess = jest.fn();
    mockCsrfFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    renderModal({ onSuccess });
    fireEvent.click(screen.getByTestId('counter-button'));
    const input = screen.getByTestId('counter-rate-input');
    await userEvent.clear(input);
    await userEvent.type(input, '15');
    fireEvent.click(screen.getByTestId('counter-submit'));
    await waitFor(() => expect(screen.queryByTestId('counter-dialog')).not.toBeInTheDocument());
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error message when API returns non-ok response', async () => {
    mockCsrfFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Counter failed' }),
    });
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    const input = screen.getByTestId('counter-rate-input');
    await userEvent.clear(input);
    await userEvent.type(input, '10');
    fireEvent.click(screen.getByTestId('counter-submit'));
    await waitFor(() => expect(screen.getByTestId('counter-error')).toBeInTheDocument());
  });

  it('shows error message on network failure', async () => {
    mockCsrfFetch.mockRejectedValueOnce(new Error('Network error'));
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    const input = screen.getByTestId('counter-rate-input');
    await userEvent.clear(input);
    await userEvent.type(input, '10');
    fireEvent.click(screen.getByTestId('counter-submit'));
    await waitFor(() => expect(screen.getByTestId('counter-error')).toBeInTheDocument());
  });

  it('does not submit when counterRate is empty', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    fireEvent.click(screen.getByTestId('counter-submit'));
    expect(mockCsrfFetch).not.toHaveBeenCalled();
  });

  // ── Close behavior ────────────────────────────────────────────────────────────

  it('closes modal when close button is clicked', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    expect(screen.getByTestId('counter-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('counter-close'));
    expect(screen.queryByTestId('counter-dialog')).not.toBeInTheDocument();
  });

  it('closes modal on Escape key', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('counter-dialog')).not.toBeInTheDocument();
  });

  it('closes modal on backdrop click', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    fireEvent.click(screen.getByTestId('counter-backdrop'));
    expect(screen.queryByTestId('counter-dialog')).not.toBeInTheDocument();
  });

  // ── Accessibility ─────────────────────────────────────────────────────────────

  it('dialog has role=dialog and aria-modal=true', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('counter-button'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
