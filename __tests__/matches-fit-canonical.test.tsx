/**
 * RED/GREEN tests — fit_percent canonical metric (Wave 1: FIT canonical, I1)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Step 1 — card display: card density must use fitDisplay, not raw {match.score}%
 * Step 2 — filter fix: score80 quickFilter must use m.fit_percent ?? effectiveScore(...)
 * Step 3 — sort parity: sort routes both 'fit' and 'score' through fit_percent
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');
const fitDisplayPath = path.join(ROOT, 'lib/matching/fit-display.ts');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

// ===== Step 1: Card display =====
describe('MatchesClient.tsx — card density uses fitDisplay (I1)', () => {
  it('card density block does NOT contain raw {match.score}%', () => {
    const src = readSource();
    expect(src).not.toMatch(/\{match\.score\}%/);
  });

  it('card density block references fitDisplay', () => {
    const src = readSource();
    expect(src).toMatch(/fitDisplay/);
  });

  it('fit-display.ts module exists and exports fitDisplay function', () => {
    const exists = fs.existsSync(fitDisplayPath);
    expect(exists).toBe(true);
    const fitSrc = fs.readFileSync(fitDisplayPath, 'utf8');
    expect(fitSrc).toMatch(/export.*function fitDisplay|export.*fitDisplay/);
  });

  it('fit-display.ts exports FitDisplay interface', () => {
    const fitSrc = fs.readFileSync(fitDisplayPath, 'utf8');
    expect(fitSrc).toMatch(/FitDisplay/);
  });

  // Behavioral test: fitDisplay returns fit_percent when present, fallback otherwise
  it('fitDisplay behavioral: uses fit_percent when not null', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fitDisplay } = require(fitDisplayPath) as { fitDisplay: (m: {score: number; fit_percent: number | null | undefined; laycan_end: number | null; laycan_start: number | null}, nowMs: number) => {value: number; label: string} };
    const result = fitDisplay({ score: 70, fit_percent: 85.4, laycan_end: null, laycan_start: null }, 0);
    expect(result.value).toBe(85);
    expect(result.label).toBe('% fit');
  });

  it('fitDisplay behavioral: falls back to score when fit_percent is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fitDisplay } = require(fitDisplayPath) as { fitDisplay: (m: {score: number; fit_percent: number | null | undefined; laycan_end: number | null; laycan_start: number | null}, nowMs: number) => {value: number; label: string} };
    const result = fitDisplay({ score: 72, fit_percent: null, laycan_end: null, laycan_start: null }, 0);
    expect(result.value).toBe(72);
    expect(result.label).toBe('%');
  });

  it('fitDisplay behavioral: expired laycan caps score at 70 when fit_percent is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fitDisplay } = require(fitDisplayPath) as { fitDisplay: (m: {score: number; fit_percent: number | null | undefined; laycan_end: number | null; laycan_start: number | null}, nowMs: number) => {value: number; label: string} };
    const expiredEnd = Date.now() - 86_400_000; // 1 day ago
    const result = fitDisplay({ score: 85, fit_percent: null, laycan_end: expiredEnd, laycan_start: null }, Date.now());
    expect(result.value).toBe(70);
    expect(result.label).toBe('%');
  });
});

// ===== Step 2: Filter fix =====
describe('MatchesClient.tsx — score80 quickFilter uses fit_percent (I1)', () => {
  it('score80 predicate references m.fit_percent (not just effectiveScore)', () => {
    const src = readSource();
    // Must use fit_percent in score80 filter
    expect(src).toMatch(/score80.*fit_percent|fit_percent.*score80/);
  });

  it('score80 predicate uses nullish coalescing with effectiveScore as fallback', () => {
    const src = readSource();
    expect(src).toMatch(/fit_percent\s*\?\?.*effectiveScore|m\.fit_percent\s*\?\?/);
  });

  it('score80 chip label is "Fit 80+" not "Score 80+"', () => {
    const src = readSource();
    expect(src).toMatch(/['"]Fit 80\+['"]/);
    expect(src).not.toMatch(/['"]Score 80\+['"]/);
  });
});

// ===== Step 3: Sort parity =====
describe('MatchesClient.tsx — sort routes both fit and score through fit_percent (I1)', () => {
  it('sort block uses fit_percent for both fit and score paths', () => {
    const src = readSource();
    // The unified sort should reference fit_percent with ?? fallback
    expect(src).toMatch(/fit_percent\s*\?\?\s*[ab]\.(fit_percent|score)|fit_percent.*\?\?.*score/);
  });

  it('b.score - a.score is still present as tiebreaker (PI3 invariant)', () => {
    const src = readSource();
    expect(src).toMatch(/b\.score\s*-\s*a\.score/);
  });

  it('sort no longer has separate if(sortBy===fit) branch after unification', () => {
    const src = readSource();
    // The old "if (sortBy === 'fit') return (b.fit_percent ?? 0)..." pattern is replaced
    // New pattern: fitDiff computed without a sortBy===fit conditional
    expect(src).not.toMatch(/if\s*\(sortBy\s*===\s*['"]fit['"]\)\s*return\s*\(b\.fit_percent/);
  });
});
