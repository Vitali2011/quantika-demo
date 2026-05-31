/**
 * Wave B — bucket tabs on /matches.
 *
 * Surfaces the two realism buckets (lowConfidenceMatches / insufficientData),
 * which live on SessionData as Match[] and are NOT persisted to the matches table.
 *
 * Covers:
 *   - lib/matching/session-buckets.ts: toBucketRows (behavioral unit)
 *   - app/matches/page.tsx: threads buckets to MatchesClient (source regex)
 *   - app/matches/MatchesClient.tsx: 3-tab bar, counters, read-only bucket render,
 *     empty state, main list left intact (source regex — node testEnvironment)
 */

import * as fs from 'fs';
import * as path from 'path';
import { toBucketRows } from '@/lib/matching/session-buckets';
import type { Match } from '@/lib/types';

const ROOT = process.cwd();
const pagePath = path.join(ROOT, 'app/matches/page.tsx');
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');
const readSource = (p: string) => fs.readFileSync(p, 'utf8');

function makeMatch(over: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    cargoItemIndex: 0,
    vesselEmailId: 'v1',
    vesselItemIndex: 0,
    score: 42,
    matchLevel: 'weak',
    matchReasons: ['idle vessel — large date gap'],
    issues: [],
    ...over,
  } as Match;
}

// ──────────────────────────────────────────────────────────────────────────────
// lib/matching/session-buckets.ts — toBucketRows (unit)
// ──────────────────────────────────────────────────────────────────────────────

describe('toBucketRows', () => {
  it('maps a session Match to a StoredMatch-shaped row (cargo/vessel ids, reason)', () => {
    const rows = toBucketRows([makeMatch()], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].cargo_id).toBe('c1');
    expect(rows[0].vessel_id).toBe('v1');
    expect(rows[0].reason).toBe('idle vessel — large date gap');
    expect(rows[0].status).toBe('shortlist');
    expect(rows[0].user_id).toBeNull();
  });

  it('assigns synthetic NEGATIVE ids starting at idStart, decrementing per row', () => {
    const rows = toBucketRows([makeMatch(), makeMatch({ vesselEmailId: 'v2' })], [], [], -1);
    expect(rows[0].id).toBe(-1);
    expect(rows[1].id).toBe(-2);
    // negative so they never collide with real DB autoincrement ids
    expect(rows.every((r) => r.id < 0)).toBe(true);
  });

  it('clamps score into [0, 100]', () => {
    const rows = toBucketRows(
      [makeMatch({ score: 150 }), makeMatch({ score: -5 })],
      [],
      [],
    );
    expect(rows[0].score).toBe(100);
    expect(rows[1].score).toBe(0);
  });

  it('defaults missing cargo/vessel enrichment to null (no crash on empty maps)', () => {
    const rows = toBucketRows([makeMatch()], [], []);
    expect(rows[0].load_port).toBeNull();
    expect(rows[0].discharge_port).toBeNull();
    expect(rows[0].vessel_dwt).toBeNull();
    expect(rows[0].tce_usd_per_day).toBeNull();
    expect(rows[0].distance_nm).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// app/matches/page.tsx — threads buckets down
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/page.tsx — bucket threading', () => {
  it('imports toBucketRows', () => {
    expect(readSource(pagePath)).toMatch(/toBucketRows/);
  });

  it('reads lowConfidenceMatches and insufficientData from the session', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/session\.lowConfidenceMatches/);
    expect(src).toMatch(/session\.insufficientData/);
  });

  it('passes lowConfidenceMatches and insufficientData props to MatchesClient', () => {
    const src = readSource(pagePath);
    expect(src).toMatch(/lowConfidenceMatches=\{/);
    expect(src).toMatch(/insufficientData=\{/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// app/matches/MatchesClient.tsx — 3-tab bar + bucket render
// ──────────────────────────────────────────────────────────────────────────────

describe('app/matches/MatchesClient.tsx — bucket tabs', () => {
  it('accepts lowConfidenceMatches and insufficientData props', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/lowConfidenceMatches/);
    expect(src).toMatch(/insufficientData/);
  });

  it('tracks the active tab in component state', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/activeTab/);
    expect(src).toMatch(/useState[^\n]*activeTab|activeTab[^\n]*useState|setActiveTab/);
  });

  it('renders three tab buttons with stable testids', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/data-testid=/);
    expect(src).toMatch(/tab-matches/);
    expect(src).toMatch(/tab-review/);
    expect(src).toMatch(/tab-insufficient/);
  });

  it('labels the three tabs per the agreed design', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/Матчи/);
    expect(src).toMatch(/На проверку/);
    expect(src).toMatch(/Мало данных/);
  });

  it('shows counters in the tab headers (bucket lengths)', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/lowConfidenceMatches\.length/);
    expect(src).toMatch(/insufficientData\.length/);
  });

  it('renders an empty state for an empty bucket', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/Нет пар на проверку|Нет пар/);
  });

  it('guards the main list block behind the matches tab', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/activeTab\s*===\s*['"]matches['"]/);
  });

  // Regression guard: bucket work must NOT disturb the main-list contract.
  it('keeps the main list bound to `const filtered = matches.filter(...)`', () => {
    const src = readSource(clientPath);
    expect(src).toMatch(/const filtered\s*=\s*matches[\s\S]{0,20}\.filter\s*\(/);
    expect(src).toMatch(/filtered\.map\(\(match\)/);
  });
});
