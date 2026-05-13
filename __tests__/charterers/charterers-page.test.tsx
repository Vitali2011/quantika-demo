/**
 * @jest-environment jsdom
 *
 * TDD: Charterers list page tests
 *
 * Input Contract:
 * - NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED !== 'true' → show "Feature not enabled"
 * - Feature enabled + GET /api/charterers → renders table with charterers
 * - "Add Charterer" button → shows form
 * - Submit form → POST /api/charterers → list refreshes
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

const MOCK_CHARTERERS = [
  { id: 'c1', name: 'Cargill', tier: 'blue-chip', require_lc: 0, notes: 'Top tier' },
  { id: 'c2', name: 'Scorpio', tier: 'second', require_lc: 1, notes: null },
  { id: 'c3', name: 'WeakCo', tier: 'weak', require_lc: 1, notes: 'Risky' },
];

describe('CharterersPage', () => {
  const originalEnv = process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED;

  afterEach(() => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = originalEnv;
    jest.restoreAllMocks();
  });

  it('shows feature disabled when flag is off', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'false';

    const { default: CharterersPage } = await import('@/app/charterers/page');
    render(<CharterersPage />);

    expect(screen.getByText(/feature not enabled/i)).toBeInTheDocument();
  });

  it('renders charterers table when feature enabled', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ charterers: MOCK_CHARTERERS }),
      })
    ) as jest.Mock;

    const { default: CharterersPage } = await import('@/app/charterers/page');
    render(<CharterersPage />);

    await waitFor(() => {
      expect(screen.getByText('Cargill')).toBeInTheDocument();
    });

    expect(screen.getByText('Scorpio')).toBeInTheDocument();
    expect(screen.getByText('WeakCo')).toBeInTheDocument();
  });

  it('shows tier badges', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ charterers: MOCK_CHARTERERS }),
      })
    ) as jest.Mock;

    const { default: CharterersPage } = await import('@/app/charterers/page');
    render(<CharterersPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/blue-chip/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText(/second/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/weak/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows Yes/No for require_lc column', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ charterers: MOCK_CHARTERERS }),
      })
    ) as jest.Mock;

    const { default: CharterersPage } = await import('@/app/charterers/page');
    render(<CharterersPage />);

    await waitFor(() => {
      expect(screen.getByText('Cargill')).toBeInTheDocument();
    });

    // Cargill require_lc=0 → No, Scorpio require_lc=1 → Yes
    const noCells = screen.getAllByText('No');
    const yesCells = screen.getAllByText('Yes');
    expect(noCells.length).toBeGreaterThanOrEqual(1);
    expect(yesCells.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Add Charterer" button and clicking it reveals form', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ charterers: [] }),
      })
    ) as jest.Mock;

    const { default: CharterersPage } = await import('@/app/charterers/page');
    render(<CharterersPage />);

    await waitFor(() => {
      expect(screen.getByText(/add charterer/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/add charterer/i));

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tier/i)).toBeInTheDocument();
  });

  it('submits form and refreshes list', async () => {
    process.env.NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED = 'true';

    const newCharterer = { id: 'c99', name: 'NewCo', tier: 'second', require_lc: 0, notes: null };

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ charterers: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(newCharterer),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ charterers: [newCharterer] }),
      }) as jest.Mock;

    const { default: CharterersPage } = await import('@/app/charterers/page');
    render(<CharterersPage />);

    await waitFor(() => {
      expect(screen.getByText(/add charterer/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/add charterer/i));

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'NewCo' } });

    const submitBtn = screen.getByRole('button', { name: /^save$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('NewCo')).toBeInTheDocument();
    });
  });
});
