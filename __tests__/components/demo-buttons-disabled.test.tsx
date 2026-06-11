/**
 * @jest-environment jsdom
 *
 * Guard: demo buttons must be disabled + carry title="Not available in demo".
 * Founder decision (b1b-fake-buttons): disable without wiring real sending.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── VesselsClient / CargoClient deps ──────────────────────────────────────
jest.mock('@/design-system/patterns/useMode', () => ({
  useMode: () => ({ isOwner: true, isCharterer: true, mode: 'owner', setMode: jest.fn() }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/utils/abbr-port', () => ({ abbrPort: (s: string) => s }));

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve(null) })
  ) as jest.Mock;
});

// ── Imports (after mocks) ──────────────────────────────────────────────────
import VesselsClient from '@/app/vessels/VesselsClient';
import CargoClient from '@/app/cargo/CargoClient';

const DEMO_TITLE = 'Not available in demo';

describe('Demo buttons — disabled + title (b1b-fake-buttons)', () => {
  describe('VesselsClient', () => {
    beforeEach(() =>
      render(<VesselsClient rows={[]} total={0} />)
    );

    it('Import CSV is disabled in demo', () => {
      expect(screen.getByRole('button', { name: /Import CSV/i })).toBeDisabled();
    });

    it('Import CSV carries demo tooltip', () => {
      expect(screen.getByRole('button', { name: /Import CSV/i })).toHaveAttribute(
        'title',
        DEMO_TITLE,
      );
    });

    it('New vessel is disabled in demo', () => {
      expect(screen.getByRole('button', { name: /New vessel/i })).toBeDisabled();
    });

    it('New vessel carries demo tooltip', () => {
      expect(screen.getByRole('button', { name: /New vessel/i })).toHaveAttribute(
        'title',
        DEMO_TITLE,
      );
    });
  });

  describe('CargoClient', () => {
    beforeEach(() =>
      render(<CargoClient rows={[]} total={0} />)
    );

    it('Parse is disabled in demo', () => {
      expect(screen.getByRole('button', { name: 'Parse' })).toBeDisabled();
    });

    it('Parse carries demo tooltip', () => {
      expect(screen.getByRole('button', { name: 'Parse' })).toHaveAttribute(
        'title',
        DEMO_TITLE,
      );
    });
  });
});
