/**
 * RED tests — matches page UI
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 * This project does not use jsdom for component tests.
 *
 * Covers:
 *   - app/matches/page.tsx: removes DEMO_MATCHES skeleton, performs server fetch
 *   - app/matches/MatchesClient.tsx: renders match cards, status filter, action buttons,
 *     optimistic update logic
 *   - Boundary Class 5: action buttons present for each valid MatchStatus transition
 *   - Boundary Class 9 (E2E property): page.tsx calls listMatches / API (behavioral contract)
 *   - Boundary Class 1 (Empty): empty matches list renders empty-state UI
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

const pagePath = path.join(ROOT, 'app/matches/page.tsx');
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// app/matches/page.tsx — bug #292: sample data bypass for MATCHES_ENABLED
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/page.tsx — sample data bypass (bug #292)', () => {
  it('reads isSampleData from session to bypass MATCHES_ENABLED check', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/isSampleData/);
  });

  it('MATCHES_ENABLED guard is conditional on isSampleData (not unconditional redirect)', () => {
    const src = readSource(pagePath);
    // Must have compound guard: feature flag off AND not sample data → redirect
    expect(src).toMatch(/MATCHES_ENABLED.*isSampleData|isSampleData.*MATCHES_ENABLED/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// app/matches/page.tsx
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/page.tsx', () => {
  it('file exists', () => {
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it('does NOT import DEMO_MATCHES (skeleton replaced)', () => {
    const src = readSource(pagePath);
    expect(src).not.toMatch(/DEMO_MATCHES/);
  });

  it('does NOT import demo-data (skeleton replaced)', () => {
    const src = readSource(pagePath);
    expect(src).not.toMatch(/demo-data/);
  });

  it('imports or uses MatchesClient component', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/MatchesClient/);
  });

  it('fetches matches from DB or repository (not hardcoded demo data)', () => {
    const src = readSource(pagePath);
    // Should call listMatches or fetch from api/matches or similar
    expect(src).toMatch(/listMatches|getStore|getDatabase|fetch.*matches/i);
  });

  it('passes matches data down to MatchesClient as a prop', () => {
    const src = readSource(pagePath);
    // MatchesClient should receive initialMatches or matches prop
    expect(src).toMatch(/MatchesClient.*matches|matches.*MatchesClient/);
  });

  it('is an async server component (uses async function or async page)', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/async.*function|async.*=>/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// app/matches/MatchesClient.tsx — file structure
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — file exists and is a client component', () => {
  it('file exists', () => {
    expect(fs.existsSync(clientPath)).toBe(true);
  });

  it('has "use client" directive', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/"use client"/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MatchesClient — empty state
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — empty state (Class 1)', () => {
  it('renders an empty-state message when there are no matches', () => {
    const src = readSource(clientPath);
    // Should have some fallback text for empty list
    expect(src).toMatch(/No matches|no matches|empty|No results/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MatchesClient — match card rendering
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — match cards', () => {
  it('renders cargo_id and vessel_id from match data', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/cargo_id|vessel_id/);
  });

  it('renders score from match data', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/score/);
  });

  it('renders status from match data', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/status/);
  });

  it('renders reason from match data', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/reason/);
  });

  it('accepts an array of matches as prop (initialMatches or matches)', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/initialMatches|matches.*\[\]|StoredMatch\[\]/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MatchesClient — status filter UI (Class 5)
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — status filter (Class 5)', () => {
  it('has UI element to filter by shortlist status', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/shortlist/);
  });

  it('has UI element to filter by saved status', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/saved/);
  });

  it('has UI element to filter by dismissed status', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/dismissed/);
  });

  it('has UI element to filter by archived status', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/archived/);
  });

  it('tracks active filter in state', () => {
    const src = readSource(clientPath);
    // Should have useState for filter
    expect(src).toMatch(/useState.*status|status.*useState|filter.*State|filterStatus/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MatchesClient — action buttons (Class 5 — transition actions)
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — action buttons', () => {
  it('has a Save / save action button', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/[Ss]ave/);
  });

  it('has a Dismiss / dismiss action button', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/[Dd]ismiss/);
  });

  it('has an Archive / archive action button', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/[Aa]rchive/);
  });

  it('calls PATCH /api/matches/:id on action', () => {
    const src = readSource(clientPath);
    // Should reference the API endpoint
    expect(src).toMatch(/api\/matches|\/matches\//);
  });

  it('sends status in request body when action triggered', () => {
    const src = readSource(clientPath);
    // Body should include status field
    expect(src).toMatch(/status.*saved|status.*dismissed|status.*archived|body.*status/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MatchesClient — optimistic update
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — optimistic update', () => {
  it('uses useState to manage local matches state', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/useState/);
  });

  it('updates local state on action (optimistic update pattern)', () => {
    const src = readSource(clientPath);
    // Should set/update state on action — look for setState call inside action handler
    expect(src).toMatch(/set[A-Z].*status|setMatches|optimistic/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// MatchesClient — type safety
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — type imports', () => {
  it('imports StoredMatch type from matches-repository', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/StoredMatch/);
  });
});
