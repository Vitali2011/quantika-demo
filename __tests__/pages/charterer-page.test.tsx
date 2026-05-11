/**
 * @jest-environment jsdom
 *
 * TDD: RED phase — Charterer credit card page smoke test
 * Tests that the page renders without error when feature flag is on/off
 *
 * Input Contract:
 * - NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED !== 'true' → show "Feature not enabled"
 * - Valid id with charterer data → show name, tier, require_lc, payment_history, notes
 * - Non-existent id → show error message
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js hooks and components
jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

describe('Charterer page', () => {
  const originalEnv = process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED;

  afterEach(() => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = originalEnv;
  });

  // RED test: renders "Feature not enabled" when flag is off
  it('renders feature disabled message when flag is off', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'false';

    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    expect(screen.getByText(/feature not enabled/i)).toBeInTheDocument();
  });

  // RED test: renders without error when flag is on (smoke test)
  it('renders without error when feature enabled', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'c1' });

    // Mock fetch to return charterer data
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'c1',
            name: 'Cargill',
            tier: 'blue-chip',
            payment_history: '[]',
            require_lc: 0,
            notes: 'Top tier charterer',
            created_at: '2026-05-11',
          }),
      })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;

    // Smoke test: should render without throwing
    expect(() => {
      render(<ChartererPage />);
    }).not.toThrow();
  });

  // RED test: renders error message for non-existent charterer
  it('renders error message when charterer not found', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'unknown' });

    // Mock fetch to return 404
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Charterer not found' }),
      })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    // Wait for async state updates
    await waitFor(() => {
      expect(screen.getByText('Charterer not found')).toBeInTheDocument();
    });
  });
});
