/**
 * @jest-environment jsdom
 *
 * Behavioral test: credit panel renders with Demo badge, tier, L/C flag,
 * and payment history entries when NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED=true.
 *
 * Uses real client.get()-style fetch mock (behavioral PI2 requirement).
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })),
}));

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

const DEMO_CHARTERER = {
  id: 'charterer-abc123',
  name: 'Glencore',
  tier: 'blue-chip' as const,
  require_lc: 0,
  notes: 'Diversified commodity trader. Coal and grain. Strong credit.',
  created_at: '2026-01-15T00:00:00.000Z',
  payment_history: JSON.stringify([
    { date: '2026-04-02', status: 'on-time', notes: 'MV Iron Eagle — Coal, $28/MT' },
    { date: '2026-01-30', status: 'on-time', notes: 'MV Atlantic Crown — Grain, $41/MT' },
  ]),
};

const WEAK_CHARTERER = {
  id: 'charterer-weak01',
  name: 'Medallion Shipping',
  tier: 'weak' as const,
  require_lc: 1,
  notes: 'Repeated late payments and one unresolved demurrage. L/C mandatory.',
  created_at: '2025-06-01T00:00:00.000Z',
  payment_history: JSON.stringify([
    { date: '2025-12-05', status: 'defaulted', notes: 'Unpaid demurrage $18,400 — legal pending' },
    { date: '2025-08-30', status: 'late-10d' },
  ]),
};

describe('Charterer credit panel', () => {
  const originalEnv = process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED;

  afterEach(() => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = originalEnv;
    jest.restoreAllMocks();
  });

  it('renders Demo data badge when flag is enabled', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';
    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'charterer-abc123' });

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(DEMO_CHARTERER) })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Demo data')).toBeInTheDocument();
    });
  });

  it('renders tier and L/C=NO for blue-chip charterer', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';
    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'charterer-abc123' });

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(DEMO_CHARTERER) })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    await waitFor(() => {
      expect(screen.getByText('BLUE-CHIP')).toBeInTheDocument();
      expect(screen.getByText('NO')).toBeInTheDocument();
    });
  });

  it('renders L/C=YES and payment history for weak charterer', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';
    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'charterer-weak01' });

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(WEAK_CHARTERER) })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    await waitFor(() => {
      expect(screen.getByText('YES')).toBeInTheDocument();
      expect(screen.getByText('defaulted')).toBeInTheDocument();
      expect(screen.getByText('late-10d')).toBeInTheDocument();
    });
  });

  it('renders payment history entries with dates', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';
    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'charterer-abc123' });

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(DEMO_CHARTERER) })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    await waitFor(() => {
      expect(screen.getByText('2026-04-02')).toBeInTheDocument();
      expect(screen.getByText('2026-01-30')).toBeInTheDocument();
    });
  });

  it('renders charterer notes when present', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';
    const { useParams } = await import('next/navigation');
    (useParams as jest.Mock).mockReturnValue({ id: 'charterer-abc123' });

    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(DEMO_CHARTERER) })
    ) as jest.Mock;

    const ChartererPage = (await import('@/app/charterers/[id]/page')).default;
    render(<ChartererPage />);

    await waitFor(() => {
      expect(screen.getByText(/diversified commodity trader/i)).toBeInTheDocument();
    });
  });
});
