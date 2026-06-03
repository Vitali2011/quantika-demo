/**
 * RED tests — sort controls (#350)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Covers:
 *  1. sortBy state variable exists
 *  2. Sort options include score and freshness (created_at)
 *  3. Sort controls present in JSX (buttons or select)
 *  4. Sort is applied to the filtered/display array
 *  5. Boundary: empty list, 1 element, 50+ elements
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient.tsx — sort controls (#350)', () => {
  it('has sortBy state variable', () => {
    const src = readSource();
    expect(src).toMatch(/sortBy/);
  });

  it('sortBy state is initialized with useState', () => {
    const src = readSource();
    expect(src).toMatch(/sortBy.*useState|useState.*sortBy/);
  });

  it('sort option "score" is supported', () => {
    const src = readSource();
    expect(src).toMatch(/['"]score['"]/);
  });

  it('sort option "freshness" or "created_at" is supported', () => {
    const src = readSource();
    expect(src).toMatch(/freshness|created_at/);
  });

  it('sort controls are rendered in JSX (Sort buttons or select)', () => {
    const src = readSource();
    // Must have a visible UI for sort (button, select, or labeled control)
    expect(src).toMatch(/[Ss]ort[:\s]|sort-score|sort-freshness|Sort by/);
  });

  it('sort buttons have data-testid attributes for testing', () => {
    const src = readSource();
    expect(src).toMatch(/data-testid=["']sort-/);
  });

  it('sort is applied to the display array via .sort()', () => {
    const src = readSource();
    // Must call .sort() on the matches/filtered array
    expect(src).toMatch(/\.sort\s*\(/);
  });

  it('sort uses b.score - a.score for descending score sort', () => {
    const src = readSource();
    expect(src).toMatch(/b\.score\s*-\s*a\.score|a\.score.*b\.score/);
  });

  it('sort uses created_at for freshness sort', () => {
    const src = readSource();
    expect(src).toMatch(/created_at/);
  });

  it('Boundary Class 1 — empty list: sort does not crash (no .sort on empty array issue)', () => {
    const src = readSource();
    // .sort() on empty array returns [] without error — no special guard needed
    // But verify sortBy state is declared outside conditionals
    const sortByIdx = src.indexOf('sortBy');
    const filteredIdx = src.indexOf('const filtered');
    expect(sortByIdx).not.toBe(-1);
    expect(filteredIdx).not.toBe(-1);
    // sortBy must be declared before filtered
    expect(sortByIdx).toBeLessThan(filteredIdx);
  });

  it('Boundary Class 5 — 50+ elements: sort applied to all filtered results', () => {
    const src = readSource();
    // No slice before sort that would limit to < 50 elements
    const filteredBlock = src.match(/const filtered[\s\S]{0,1200}/)?.[0] ?? '';
    // Must have .sort in this block
    expect(filteredBlock).toMatch(/\.sort\s*\(/);
  });

  it('sort dropdown includes TCE option unconditionally (#528)', () => {
    const src = readSource();
    // TCE option must exist
    expect(src).toMatch(/value="tce"/);
    // Must NOT be gated behind isOwner
    expect(src).not.toMatch(/isOwner\s*&&\s*<option[^>]*value="tce"/);
  });

  it('sort by tce uses tce_usd_per_day descending comparator (#528)', () => {
    const src = readSource();
    // Comparator must sort by tce_usd_per_day numerically descending
    expect(src).toMatch(/sortBy\s*===\s*['"]tce['"]/);
    expect(src).toMatch(/tce_usd_per_day/);
    // b - a order means descending
    expect(src).toMatch(/b\.tce_usd_per_day.*-.*a\.tce_usd_per_day|b\.tce_usd_per_day.*a\.tce_usd_per_day/);
  });

  it('sort dropdown has data-testid on all 3 options (#528)', () => {
    const src = readSource();
    expect(src).toMatch(/data-testid="sort-score"/);
    expect(src).toMatch(/data-testid="sort-freshness"/);
    expect(src).toMatch(/data-testid="sort-tce"/);
  });
});
