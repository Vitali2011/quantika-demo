/**
 * Regression tests — #635: cargo filter applied but result count doesn't update
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Covers:
 *  1. "All" chip count is NOT hardwired to modeFiltered.length (stale path)
 *  2. allChipCount variable exists and includes cargoTypes in its derivation
 *  3. allChipCount is used as the count prop for the "All" quick-filter chip
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient.tsx — All chip count reactive to advanced filters (#635)', () => {
  it('All chip count is NOT modeFiltered.length (stale — ignores cargoTypes)', () => {
    const src = readSource();
    // Find the "All" chip config — must not reference modeFiltered.length as count
    const allChipLine = src.match(/id:\s*['"]all['"][\s\S]{0,300}/)?.[0] ?? '';
    expect(allChipLine).not.toMatch(/count:\s*modeFiltered\.length/);
  });

  it('allChipCount variable is declared and derived from modeFiltered + cargoTypes', () => {
    const src = readSource();
    // Variable must exist
    expect(src).toMatch(/allChipCount/);
    // It must filter by cargoTypes
    const countBlock = src.match(/allChipCount[\s\S]{0,400}/)?.[0] ?? '';
    expect(countBlock).toMatch(/cargoTypes/);
  });

  it('All chip count prop references allChipCount (not raw matches.length)', () => {
    const src = readSource();
    const allChipLine = src.match(/id:\s*['"]all['"][\s\S]{0,300}/)?.[0] ?? '';
    expect(allChipLine).toMatch(/count:\s*allChipCount/);
  });

  it('allChipCount also filters by filterStatus (status filter reactive)', () => {
    const src = readSource();
    const countBlock = src.match(/allChipCount[\s\S]{0,400}/)?.[0] ?? '';
    expect(countBlock).toMatch(/filterStatus/);
  });
});
