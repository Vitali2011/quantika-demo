/**
 * Mode-aware content — behavioral + source analysis tests
 *
 * PI2: filterMatchesByMode is tested behaviorally (real function invocation).
 * Source analysis tests verify integration wiring across components.
 *
 * @jest-environment node
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StoredMatch } from '@/lib/matching/matches-repository';
import { filterMatchesByMode } from '@/lib/matching/mode-filter';

const ROOT = process.cwd();

// ─────────────────────────────────────────────────────────────────────────────
// Behavioral: filterMatchesByMode (PI2 — actual function invocation)
// ─────────────────────────────────────────────────────────────────────────────

function makeMatch(id: number, cargoId: string, vesselId: string): StoredMatch {
  return {
    id,
    cargo_id: cargoId,
    vessel_id: vesselId,
    score: 80,
    reason: '',
    status: 'shortlist',
    cargo_type: null,
    load_port: null,
    discharge_port: null,
    vessel_dwt: null,
    tce_usd_per_day: null,
    distance_nm: null,
    freight_rate_source: null,
    reason_structured: null,
    laycan_start: null,
    laycan_end: null,
    freight_rate_usd_per_mt: null,
    user_id: 'session-1',
    created_at: 1000000,
    updated_at: 1000000,
  };
}

const MATCHES: StoredMatch[] = [
  makeMatch(1, 'cargo-email-1', 'vessel-email-A'),
  makeMatch(2, 'cargo-email-2', 'vessel-email-B'),
  makeMatch(3, 'cargo-email-3', 'vessel-email-A'),
];

describe('filterMatchesByMode — charterer mode', () => {
  it('returns only matches where cargo_id is in cargoEmailIds', () => {
    const result = filterMatchesByMode(MATCHES, false, ['cargo-email-1', 'cargo-email-3'], []);
    expect(result.map((m) => m.id)).toEqual([1, 3]);
  });

  it('returns all matches when cargoEmailIds is empty (fallback)', () => {
    const result = filterMatchesByMode(MATCHES, false, [], []);
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no match cargo_id is in cargoEmailIds', () => {
    const result = filterMatchesByMode(MATCHES, false, ['nonexistent'], []);
    expect(result).toHaveLength(0);
  });
});

describe('filterMatchesByMode — owner mode', () => {
  it('returns only matches where vessel_id is in vesselEmailIds', () => {
    const result = filterMatchesByMode(MATCHES, true, [], ['vessel-email-A']);
    expect(result.map((m) => m.id)).toEqual([1, 3]);
  });

  it('returns all matches when vesselEmailIds is empty (fallback)', () => {
    const result = filterMatchesByMode(MATCHES, true, [], []);
    expect(result).toHaveLength(3);
  });

  it('returns single match when vesselEmailIds contains one unique vessel', () => {
    const result = filterMatchesByMode(MATCHES, true, [], ['vessel-email-B']);
    expect(result.map((m) => m.id)).toEqual([2]);
  });

  it('owner mode ignores cargoEmailIds even if provided', () => {
    // owner mode should filter by vesselEmailIds, not cargoEmailIds
    const result = filterMatchesByMode(MATCHES, true, ['cargo-email-1'], ['vessel-email-B']);
    expect(result.map((m) => m.id)).toEqual([2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: ModeProvider — cookie persist
// ─────────────────────────────────────────────────────────────────────────────

describe('ModeProvider — cookie persist for SSR', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'design-system/patterns/ModeProvider.tsx'),
    'utf8',
  );

  it('writes document.cookie with preferred_mode when setMode is called', () => {
    expect(src).toMatch(/document\.cookie.*preferred_mode|preferred_mode.*document\.cookie/);
  });

  it('still fires PATCH to /api/me', () => {
    expect(src).toMatch(/\/api\/me/);
    expect(src).toMatch(/PATCH/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: layout.tsx — cookie fast path
// ─────────────────────────────────────────────────────────────────────────────

describe('layout.tsx — preferred_mode cookie fast path', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');

  it('reads preferred_mode cookie from cookieStore', () => {
    expect(src).toMatch(/preferred_mode/);
  });

  it('accepts both charterer and owner from cookie', () => {
    expect(src).toMatch(/charterer.*owner|owner.*charterer/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: MatchesClient — mode wiring
// ─────────────────────────────────────────────────────────────────────────────

describe('MatchesClient — mode-aware filtering wiring', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/matches/MatchesClient.tsx'), 'utf8');

  it('accepts cargoEmailIds prop', () => {
    expect(src).toMatch(/cargoEmailIds/);
  });

  it('accepts vesselEmailIds prop', () => {
    expect(src).toMatch(/vesselEmailIds/);
  });

  it('imports filterMatchesByMode', () => {
    expect(src).toMatch(/filterMatchesByMode/);
  });

  it('uses modeFiltered as base for the filtered array', () => {
    expect(src).toMatch(/modeFiltered/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: DashboardKpiStrip — mode-aware KPIs
// ─────────────────────────────────────────────────────────────────────────────

describe('DashboardKpiStrip — mode-aware KPIs', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'components/dashboard/DashboardKpiStrip.tsx'),
    'utf8',
  );

  it('accepts fixtureCount prop', () => {
    expect(src).toMatch(/fixtureCount/);
  });

  it('accepts avgTce prop', () => {
    expect(src).toMatch(/avgTce/);
  });

  it('shows "Avg TCE Saved" in charterer mode tiles', () => {
    expect(src).toMatch(/Avg TCE Saved/);
  });

  it('shows "Fixtures Secured" in owner mode tiles', () => {
    expect(src).toMatch(/Fixtures Secured/);
  });

  it('shows "Vessels Available" in owner mode tiles', () => {
    expect(src).toMatch(/Vessels Available/);
  });

  it('shows "Matches Found" in charterer mode tiles', () => {
    expect(src).toMatch(/Matches Found/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: TopNav — active state + mode-primary
// ─────────────────────────────────────────────────────────────────────────────

describe('TopNav — route-active highlight and mode-primary', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'design-system/patterns/TopNav.tsx'),
    'utf8',
  );

  it('imports usePathname from next/navigation', () => {
    expect(src).toMatch(/usePathname/);
    expect(src).toMatch(/next\/navigation/);
  });

  it('sets aria-current="page" on active link', () => {
    expect(src).toMatch(/aria-current/);
  });

  it('marks the mode-primary slot with isModePrimary', () => {
    expect(src).toMatch(/isModePrimary/);
  });

  it('applies accent color styling to mode-primary nav item', () => {
    expect(src).toMatch(/ds-accent/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: BottomNav — active state
// ─────────────────────────────────────────────────────────────────────────────

describe('BottomNav — route-active highlight', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'design-system/patterns/BottomNav.tsx'),
    'utf8',
  );

  it('imports usePathname from next/navigation', () => {
    expect(src).toMatch(/usePathname/);
  });

  it('sets aria-current="page" on active link', () => {
    expect(src).toMatch(/aria-current/);
  });

  it('applies accent color to active nav item', () => {
    expect(src).toMatch(/ds-accent/);
  });
});
