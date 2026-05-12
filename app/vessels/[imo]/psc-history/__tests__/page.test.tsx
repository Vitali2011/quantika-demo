/**
 * Smoke test for PSC History page
 * Input Contract: No inputs (page component)
 * @jest-environment jsdom
 */

import { render } from '@testing-library/react';
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
});
