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
    vessel_name: null,
    cargo_ref: null,
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
// Regression: #479 — hydration mismatch (React error #419)
// ModeProvider must NOT read window.location.search in the useState initializer.
// Server returns `initial`; client initializer with window access can return a
// different value → mismatch. Fix: read URL params in useEffect (post-mount only).
// ─────────────────────────────────────────────────────────────────────────────

describe('ModeProvider — hydration safety (#479)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'design-system/patterns/ModeProvider.tsx'),
    'utf8',
  );

  it('passes `initial` directly to useState (no lazy initializer accessing window)', () => {
    // The fix: useState(initial) — no arrow-function initializer that reads window
    expect(src).toMatch(/useState<Mode>\s*\(\s*initial\s*\)/);
  });

  it('does NOT read window.location.search inside useState initializer', () => {
    // Detect the anti-pattern: lazy initializer arrow fn + window access
    const lazyWindowPattern = /useState\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*window\s*\.\s*location/;
    expect(src).not.toMatch(lazyWindowPattern);
  });

  it('reads URL params in useEffect (post-hydration) instead', () => {
    expect(src).toMatch(/useEffect/);
    expect(src).toMatch(/window\.location\.search/);
  });

  it('imports useEffect from react', () => {
    expect(src).toMatch(/useEffect/);
    expect(src).toMatch(/from\s+['"]react['"]/);
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
// Source analysis: MatchesClient — mode-aware column headers (#630)
// Regression: columns must swap Vessel↔Cargo based on mode.
// ─────────────────────────────────────────────────────────────────────────────

describe('MatchesClient — mode-aware column headers (#630)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/matches/MatchesClient.tsx'), 'utf8');

  it('column headers array is mode-conditional (not hardcoded)', () => {
    // Must contain isOwner conditional with two header arrays, not one static array
    expect(src).toMatch(/isOwner[\s\S]*?FIT %.*Cargo[\s\S]*?FIT %.*Vessel|FIT %.*Vessel[\s\S]*?FIT %.*Cargo/);
  });

  it('charterer headers have Vessel before Cargo', () => {
    // In charterer branch: FIT % | Vessel | ... | Cargo
    expect(src).toMatch(/'FIT %',\s*'Vessel',.*?'Cargo'/);
  });

  it('owner headers have Cargo before Vessel', () => {
    // In owner branch: FIT % | Cargo | ... | Vessel
    expect(src).toMatch(/'FIT %',\s*'Cargo',.*?'Vessel'/);
  });

  it('column 2 cell is mode-conditional (vessel vs cargo)', () => {
    // Comment marker confirms the conditional swap is present for column 2
    expect(src).toMatch(/Column 2:.*Vessel.*charterer.*or.*Cargo.*owner/);
  });

  it('sortBy resets on mode change via useEffect', () => {
    // Must have useEffect watching isOwner to reset sortBy
    expect(src).toMatch(/useEffect[\s\S]{0,100}setSortBy[\s\S]{0,100}isOwner|isOwner[\s\S]{0,100}setSortBy/m);
  });

  it('column 6 cell is mode-conditional (cargo vs vessel)', () => {
    // Symmetric to column 2: in owner mode column 6 shows Vessel; in charterer mode, Cargo
    expect(src).toMatch(/Column 6:.*Cargo.*charterer.*or.*Vessel.*owner/);
  });

  it('owner header array has exactly 8 columns', () => {
    // Extract the owner header array and count entries (#807 M1: Score→FIT %)
    const ownerMatch = src.match(/'FIT %',\s*'Cargo',\s*'Route',\s*'DWT',\s*'TCE \/ day',\s*'Vessel',\s*'Laycan',\s*''/);
    expect(ownerMatch).not.toBeNull();
  });

  it('charterer header array has exactly 8 columns', () => {
    // Extract the charterer header array and count entries (#807 M1: Score→FIT %)
    const chartererMatch = src.match(/'FIT %',\s*'Vessel',\s*'Route',\s*'DWT',\s*'TCE \/ day',\s*'Cargo',\s*'Laycan',\s*''/);
    expect(chartererMatch).not.toBeNull();
  });

  it('sortBy reset does NOT reset filter chips (cargoTypes, route, etc.)', () => {
    // The derived-state-during-render pattern must only call setSortBy — not setCargoTypes, setRoute, etc.
    // Anchor on the comment that marks the block, then read the next 250 chars.
    const marker = src.indexOf('Derived-state-during-render resets sort on mode switch');
    expect(marker).toBeGreaterThan(-1);
    const block = src.slice(marker, marker + 250);
    expect(block).not.toMatch(/setCargoTypes|setRoute|setLaycan|setScore|setDwt|setFilterStatus|setQuickFilter/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: MatchesClient — owner-mode default sort (#885 fix #3)
// Owner default = TCE/day; charterer default = Fit %.
// ─────────────────────────────────────────────────────────────────────────────

describe('MatchesClient — owner vs charterer default sort (#885)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app/matches/MatchesClient.tsx'), 'utf8');

  it('initial sortBy is isOwner-conditional, not hardcoded fit', () => {
    // Must have isOwner ternary inside useState initializer
    expect(src).toMatch(/useState<SortBy>\s*\(\s*\(\s*\)\s*=>\s*isOwner\s*\?\s*'tce'\s*:\s*'fit'\s*\)/);
  });

  it('mode-switch reset is isOwner-conditional (not hardcoded fit)', () => {
    // The setSortBy inside the derived-state-during-render block must branch on isOwner
    expect(src).toMatch(/setSortBy\s*\(\s*isOwner\s*\?\s*'tce'\s*:\s*'fit'\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: AIBar — reads mode from useMode hook (H3 regression, #630)
// ─────────────────────────────────────────────────────────────────────────────

describe('AIBar — reactive mode-aware placeholder (#630)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'design-system/patterns/AIBar.tsx'),
    'utf8',
  );

  it('imports useMode hook (not static copy)', () => {
    expect(src).toMatch(/useMode/);
    expect(src).toMatch(/from.*useMode/);
  });

  it('renders placeholder via t() translation function (reactive)', () => {
    expect(src).toMatch(/t\(['"]aibar\.placeholder['"]\)/);
  });

  it('does NOT hardcode a static placeholder string', () => {
    expect(src).not.toMatch(/Ask anything about (vessels|cargo)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source analysis: DashboardKpiStrip — mode-aware KPIs
// ─────────────────────────────────────────────────────────────────────────────

describe('DashboardKpiStrip — fixed KPI tiles (#523)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'components/dashboard/DashboardKpiStrip.tsx'),
    'utf8',
  );

  it('accepts openMatches prop', () => {
    expect(src).toMatch(/openMatches/);
  });

  it('accepts activeCargoes prop', () => {
    expect(src).toMatch(/activeCargoes/);
  });

  it('shows "Open Matches" tile', () => {
    expect(src).toMatch(/Open Matches/);
  });

  it('shows "Active Cargoes" tile', () => {
    expect(src).toMatch(/Active Cargoes/);
  });

  it('shows "BDI" market tile', () => {
    expect(src).toMatch(/BDI/);
  });

  it('shows "HSS MED RATE" market tile', () => {
    expect(src).toMatch(/HSS MED RATE/);
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
