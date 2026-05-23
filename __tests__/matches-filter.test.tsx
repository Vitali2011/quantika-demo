/**
 * RED tests — cargo type client-side filter (#373)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Covers:
 *  1. filtered variable applies cargoTypes state to client-side filtering
 *  2. Filter uses m.cargo_type field from StoredMatch
 *  3. Empty cargoTypes → show all (no filtering applied)
 *  4. Boundary: 1 element in list, 50+ elements
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient.tsx — cargo type client-side filter (#373)', () => {
  it('applies cargoTypes to the filtered variable (not only API-side)', () => {
    const src = readSource();
    // The filtered variable must reference cargoTypes for client-side filtering
    expect(src).toMatch(/cargoTypes.*cargo_type|cargo_type.*cargoTypes/);
  });

  it('uses m.cargo_type field from StoredMatch in filter predicate', () => {
    const src = readSource();
    // Must access the cargo_type field on match/m objects in the filter
    expect(src).toMatch(/m\.cargo_type|match\.cargo_type/);
  });

  it('handles empty cargoTypes array by showing all matches (no filtering)', () => {
    const src = readSource();
    // Must have a guard: cargoTypes.length === 0 means no filtering
    expect(src).toMatch(/cargoTypes\.length\s*===\s*0|cargoTypes\.length\s*==\s*0|!cargoTypes\.length/);
  });

  it('uses .includes() or .some() to check cargo type membership', () => {
    const src = readSource();
    // Must use includes or some to check if match cargo_type is in selected set
    expect(src).toMatch(/cargoTypes\.includes|cargoTypes\.some/);
  });

  it('filtered variable uses .filter() not .map() for match list derivation', () => {
    const src = readSource();
    // The filtered const must call .filter — allow multiline chaining (matches\n  .filter or matches.filter)
    expect(src).toMatch(/const filtered\s*=\s*matches[\s\S]{0,20}\.filter\s*\(/);
    // The filtered declaration block must NOT start with .map at its top level
    const filteredBlock = src.match(/const filtered\s*=[\s\S]{0,50}/)?.[0] ?? '';
    expect(filteredBlock).not.toMatch(/^const filtered\s*=\s*matches\.map/);
  });

  it('Boundary Class 1 — empty list: cargoTypes filter does not crash', () => {
    const src = readSource();
    // The filter function must have a null/fallback for cargo_type field
    expect(src).toMatch(/cargo_type\s*\?\?\s*['"]|cargo_type\s*\|\|\s*['"]|cargo_type ?? ''|cargo_type \|\| ''/);
  });

  it('Boundary Class 5 — 50+ elements: same filter logic applies (no special cap)', () => {
    const src = readSource();
    // No hardcoded limit in the filter logic (no slice(0, N) before filter)
    const filteredBlock = src.match(/const filtered[\s\S]{0,500}/)?.[0] ?? '';
    expect(filteredBlock).not.toMatch(/\.slice\s*\(\s*0\s*,/);
  });
});
