/**
 * PI2 tests — MatchesClient.tsx issues #495 + #498
 *
 * #495 — "Open match detail" button must navigate to /match/[id] via router.push
 * #498 — Table must show Laycan column (not Age); laycan_start/laycan_end fields used
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// #495 — "Open match detail" button navigates to /match/[id]
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — #495 Open match detail button', () => {
  it('has a button with aria-label "Open match detail"', () => {
    const src = readSource();
    expect(src).toMatch(/aria-label=["']Open match detail["']/);
  });

  it('button onClick calls router.push to /match/<id> path', () => {
    const src = readSource();
    // Button must wire onClick to router.push with a /match/ path including match id
    expect(src).toMatch(/router\.push\(`\/match\/\$\{match\.id\}`\)/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// #498 — Laycan column in table (replaces Age)
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — #498 Laycan column', () => {
  it('table header array contains "Laycan"', () => {
    const src = readSource();
    expect(src).toMatch(/'Laycan'/);
  });

  it('table cell renders fmtLaycan with laycan_start and laycan_end', () => {
    const src = readSource();
    expect(src).toMatch(/fmtLaycan\(match\.laycan_start,\s*match\.laycan_end\)/);
  });

  it('fmtLaycan is imported from lib/utils/fmt-laycan (extracted utility)', () => {
    const src = readSource();
    expect(src).toMatch(/fmtLaycan.*from.*fmt-laycan|fmt-laycan.*fmtLaycan/);
  });
});
