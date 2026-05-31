/**
 * Smoke test for PSC History page
 * Input Contract: No inputs (page component)
 * @jest-environment jsdom
 */

import { render, screen, act } from '@testing-library/react';
import { Suspense } from 'react';
import PscHistoryPage from '../page';

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

describe('PscHistoryPage', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // RED test: smoke test - page renders without crashing
  it('renders without crashing when feature disabled', () => {
    delete process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED;

    const { container } = render(
      <PscHistoryPage params={Promise.resolve({ imo: '9123456' })} />
    );

    expect(container).toBeTruthy();
  });

  // RED test: renders when feature enabled
  it('renders when feature enabled', () => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';

    const { container } = render(
      <PscHistoryPage params={Promise.resolve({ imo: '9123456' })} />
    );

    expect(container).toBeTruthy();
  });

  // Behavioral: Demo data badge is visible when feature enabled (async — use() suspends in React 19)
  it('shows Demo data badge when feature enabled', async () => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';

    await act(async () => {
      render(
        <Suspense fallback={null}>
          <PscHistoryPage params={Promise.resolve({ imo: '9322180' })} />
        </Suspense>,
      );
    });

    const badge = screen.getByTestId('demo-data-badge');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Demo data');
  });
});
