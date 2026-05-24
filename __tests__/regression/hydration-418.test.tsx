/**
 * @jest-environment jsdom
 *
 * Regression suite: React hydration error #418.
 *
 * Guards three fixes:
 *   #357 — CRLF normalization in EmailBodyViewer (PR #389)
 *   #291 — aria-valuetext without space in Progress (PR #389)
 *   #404 — SubsCountdownWidget Date.now() in render path → SSR mismatch
 *
 * PI2: each test exercises a real render or renderToString call, not string matching.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// #357 — CRLF normalization in EmailBodyViewer
// ---------------------------------------------------------------------------
import { EmailBodyViewer } from '@/components/email-body-viewer';

describe('EmailBodyViewer CRLF normalization (#357)', () => {
  it('renders body with \\r\\n without carriage-return chars in output', () => {
    render(
      <EmailBodyViewer body={'line one\r\nline two\r\nline three'} highlights={[]} />,
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('\r');
    expect(text).toContain('line one');
    expect(text).toContain('line two');
  });

  it('renders body with bare \\r without carriage-return chars in output', () => {
    render(
      <EmailBodyViewer body={'alpha\rbeta'} highlights={[]} />,
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('\r');
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
  });
});

// ---------------------------------------------------------------------------
// #291 — Progress aria-valuetext format (no space before %)
// ---------------------------------------------------------------------------
import { Progress } from '@/components/ui/progress';

describe('Progress aria-valuetext format (#291)', () => {
  it('aria-valuetext at value=50 is "50%" with no space', () => {
    render(<Progress value={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toBe('50%');
  });

  it('aria-valuetext matches /^\\d+%$/ — never "N %"', () => {
    render(<Progress value={33} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuetext')).toMatch(/^\d+%$/);
  });
});

// ---------------------------------------------------------------------------
// #404 — SubsCountdownWidget must not call Date.now() during SSR render
// ---------------------------------------------------------------------------
import SubsCountdownWidget from '@/components/deals/SubsCountdownWidget';

describe('SubsCountdownWidget SSR determinism (#404)', () => {
  const originalFlag = process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = 'true';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED = originalFlag;
  });

  it('renders identical HTML across two consecutive SSR passes', () => {
    const props = { dealId: 'd1', subsDeadline: '2026-12-31T12:00:00Z' };
    const a = renderToString(<SubsCountdownWidget {...props} />);
    const b = renderToString(<SubsCountdownWidget {...props} />);
    expect(a).toBe(b);
  });

  it('SSR output uses placeholder "--", not a live countdown string', () => {
    const html = renderToString(
      <SubsCountdownWidget dealId="d1" subsDeadline="2026-12-31T12:00:00Z" />,
    );
    // Before fix: component rendered "X days Y hours remaining" from Date.now() in useMemo.
    // After fix: null sentinel → placeholder "--" until useEffect.
    expect(html).toContain('--');
    expect(html).not.toMatch(/\d+ days/);
    expect(html).not.toMatch(/\d+ hours/);
  });
});

// ---------------------------------------------------------------------------
// #418-source-2 — SourceTable and charterers/[id] toLocaleDateString UTC pin
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('SourceTable toLocaleDateString UTC pin (#418-source-2)', () => {
  let src: string;

  beforeAll(() => {
    const p = path.join(ROOT, 'app/admin/knowledge/_components/SourceTable.tsx');
    src = fs.readFileSync(p, 'utf-8');
  });

  it('toLocaleDateString call in SourceTable includes timeZone: UTC', () => {
    // Without timeZone: 'UTC', server (UTC) and client (user-local TZ) produce
    // different date strings near midnight → React #418 hydration mismatch.
    const calls = [...src.matchAll(/\.toLocaleDateString\s*\([^)]*\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [call] of calls) {
      expect(call).toMatch(/timeZone\s*:\s*['"]UTC['"]/);
    }
  });
});

describe('charterers/[id] toLocaleDateString UTC pin (#418-source-2)', () => {
  let src: string;

  beforeAll(() => {
    const p = path.join(ROOT, 'app/charterers/[id]/page.tsx');
    src = fs.readFileSync(p, 'utf-8');
  });

  it('toLocaleDateString call in charterers page includes timeZone: UTC', () => {
    // Same invariant: bare toLocaleDateString() with no timeZone is a hydration risk.
    const calls = [...src.matchAll(/\.toLocaleDateString\s*\([^)]*\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [call] of calls) {
      expect(call).toMatch(/timeZone\s*:\s*['"]UTC['"]/);
    }
  });
});

// ---------------------------------------------------------------------------
// #426 — MatchesClient toLocaleString locale pin (DWT, distance_nm, TCE)
// ---------------------------------------------------------------------------
describe('MatchesClient toLocaleString locale pin (#426)', () => {
  let src: string;

  beforeAll(() => {
    const p = path.join(ROOT, 'app/matches/MatchesClient.tsx');
    src = fs.readFileSync(p, 'utf-8');
  });

  it('all toLocaleString calls in MatchesClient include en-US locale', () => {
    // Without a locale, server (Node.js) and browser may use different number
    // separators (e.g. "1,234" vs "1 234") → React #418 hydration mismatch.
    // Fix: toLocaleString('en-US') — deterministic on both server and client.
    const calls = [...src.matchAll(/\.toLocaleString\s*\([^)]*\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const [call] of calls) {
      expect(call).toMatch(/['"]en-US['"]/);
    }
  });
});
