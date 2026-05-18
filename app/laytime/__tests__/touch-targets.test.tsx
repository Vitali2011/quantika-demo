/**
 * @jest-environment jsdom
 *
 * Tests for touch-target class presence on primary action buttons.
 * Phase 2a — RED tests (touch-target class not yet applied).
 *
 * Scope:
 *   - app/laytime/page.tsx — "Parse SOF", "Add", "Calculate" buttons
 *   - components/psc/PscSearchForm.tsx — search button
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock fetch globally (laytime page makes API calls)
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  }) as unknown as typeof global.fetch;
});

afterEach(() => {
  jest.resetAllMocks();
});

// ─── LaytimePage ─────────────────────────────────────────────────────────────

describe('app/laytime/page.tsx — touch-target class on primary buttons', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED = 'true';
  });

  afterAll(() => {
    delete process.env.NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED;
  });

  it('primary action buttons have touch-target class', async () => {
    const LaytimePage = (await import('../page')).default;
    render(<LaytimePage />);

    // "Parse SOF" button
    const parseSofButton = screen.getByRole('button', { name: /parse sof/i });
    expect(parseSofButton.className).toMatch(/touch-target/);

    // "Calculate" button
    const calculateButton = screen.getByRole('button', { name: /calculate/i });
    expect(calculateButton.className).toMatch(/touch-target/);

    // "Add" holiday button (WCAG 2.5.5 — 44px min touch target)
    const addButton = screen.getByRole('button', { name: /^add$/i });
    expect(addButton.className).toMatch(/touch-target/);
  });
});

// ─── PscSearchForm ────────────────────────────────────────────────────────────

describe('components/psc/PscSearchForm.tsx — touch-target class on search button', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED = 'true';
  });

  afterAll(() => {
    delete process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED;
  });

  it('search button has touch-target class', async () => {
    // Try default export first, then named export (components may use either)
    const pscModule = await import('@/components/psc/PscSearchForm');
    const PscSearchForm = (pscModule as any).default ?? pscModule.PscSearchForm;
    render(<PscSearchForm />);

    const searchButton = screen.getByRole('button', { name: /search/i });
    expect(searchButton.className).toMatch(/touch-target/);
  });
});
