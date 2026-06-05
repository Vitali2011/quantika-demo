/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DismissableDemoBadge } from '../DismissableDemoBadge';

beforeEach(() => {
  localStorage.clear();
});

describe('DismissableDemoBadge', () => {
  it('renders "Demo data" text and dismiss button when not dismissed', () => {
    render(<DismissableDemoBadge storageKey="test-badge" />);
    expect(screen.getByTestId('demo-data-badge')).toBeInTheDocument();
    expect(screen.getByTestId('demo-data-badge')).toHaveTextContent(/demo data/i);
    expect(screen.getByTestId('dismiss-demo-badge')).toBeInTheDocument();
  });

  it('hides the badge after clicking dismiss', async () => {
    render(<DismissableDemoBadge storageKey="test-badge" />);
    expect(screen.getByTestId('demo-data-badge')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('dismiss-demo-badge'));
    });

    expect(screen.queryByTestId('demo-data-badge')).not.toBeInTheDocument();
  });

  it('persists dismissed state to localStorage on dismiss', async () => {
    render(<DismissableDemoBadge storageKey="test-badge" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('dismiss-demo-badge'));
    });

    expect(localStorage.getItem('test-badge')).toBe('dismissed');
  });

  it('starts dismissed when localStorage key is already set', async () => {
    localStorage.setItem('already-dismissed', 'dismissed');

    await act(async () => {
      render(<DismissableDemoBadge storageKey="already-dismissed" />);
    });

    expect(screen.queryByTestId('demo-data-badge')).not.toBeInTheDocument();
  });

  it('uses custom data-testid when provided', () => {
    render(
      <DismissableDemoBadge storageKey="custom-key" data-testid="passport-demo-badge" />
    );
    expect(screen.getByTestId('passport-demo-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-data-badge')).not.toBeInTheDocument();
  });

  it('independent keys are dismissed independently', async () => {
    const { unmount } = render(<DismissableDemoBadge storageKey="key-a" data-testid="badge-a" />);
    render(<DismissableDemoBadge storageKey="key-b" data-testid="badge-b" />);

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('dismiss-demo-badge')[0]);
    });

    expect(screen.queryByTestId('badge-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('badge-b')).toBeInTheDocument();
    unmount();
  });
});
