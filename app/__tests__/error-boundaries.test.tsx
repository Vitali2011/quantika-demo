/**
 * @jest-environment jsdom
 *
 * Phase 2a — test-author persona (cold context).
 * Contract: per-route error.tsx components must:
 *   1. Render contextual fallback text (mentions route name)
 *   2. Call captureException(error) on mount
 *   3. Call reset() when retry button is clicked
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

import { captureException } from '@sentry/nextjs';
const mockCaptureException = captureException as jest.Mock;

import DashboardError from '@/app/dashboard/error';
import MatchesError from '@/app/matches/error';
import PscError from '@/app/psc/error';
import CharterersError from '@/app/charterers/error';
import ProcessingError from '@/app/processing/error';

function makeError(message = 'test error') {
  return Object.assign(new Error(message), { digest: 'test-digest' });
}

beforeEach(() => {
  mockCaptureException.mockClear();
});

describe('Dashboard error boundary', () => {
  it('renders contextual fallback mentioning dashboard', () => {
    render(<DashboardError error={makeError()} reset={jest.fn()} />);
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });

  it('calls captureException with the error on mount', () => {
    const error = makeError();
    render(<DashboardError error={error} reset={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('renders retry button and calls reset on click', () => {
    const reset = jest.fn();
    render(<DashboardError error={makeError()} reset={reset} />);
    const btn = screen.getByRole('button', { name: /попробовать снова/i });
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('Matches error boundary', () => {
  it('renders contextual fallback mentioning matches', () => {
    render(<MatchesError error={makeError()} reset={jest.fn()} />);
    expect(screen.getByText(/match/i)).toBeInTheDocument();
  });

  it('calls captureException with the error on mount', () => {
    const error = makeError();
    render(<MatchesError error={error} reset={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('renders retry button and calls reset on click', () => {
    const reset = jest.fn();
    render(<MatchesError error={makeError()} reset={reset} />);
    const btn = screen.getByRole('button', { name: /попробовать снова/i });
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('PSC error boundary', () => {
  it('renders contextual fallback mentioning psc', () => {
    render(<PscError error={makeError()} reset={jest.fn()} />);
    expect(screen.getByText(/psc/i)).toBeInTheDocument();
  });

  it('calls captureException with the error on mount', () => {
    const error = makeError();
    render(<PscError error={error} reset={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('renders retry button and calls reset on click', () => {
    const reset = jest.fn();
    render(<PscError error={makeError()} reset={reset} />);
    const btn = screen.getByRole('button', { name: /попробовать снова/i });
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('Charterers error boundary', () => {
  it('renders contextual fallback mentioning charterers', () => {
    render(<CharterersError error={makeError()} reset={jest.fn()} />);
    expect(screen.getByText(/charter/i)).toBeInTheDocument();
  });

  it('calls captureException with the error on mount', () => {
    const error = makeError();
    render(<CharterersError error={error} reset={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('renders retry button and calls reset on click', () => {
    const reset = jest.fn();
    render(<CharterersError error={makeError()} reset={reset} />);
    const btn = screen.getByRole('button', { name: /попробовать снова/i });
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('Processing error boundary', () => {
  it('renders contextual fallback mentioning processing', () => {
    render(<ProcessingError error={makeError()} reset={jest.fn()} />);
    expect(screen.getByText(/processing/i)).toBeInTheDocument();
  });

  it('calls captureException with the error on mount', () => {
    const error = makeError();
    render(<ProcessingError error={error} reset={jest.fn()} />);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it('renders retry button and calls reset on click', () => {
    const reset = jest.fn();
    render(<ProcessingError error={makeError()} reset={reset} />);
    const btn = screen.getByRole('button', { name: /попробовать снова/i });
    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
