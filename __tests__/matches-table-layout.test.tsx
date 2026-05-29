/**
 * Layout regression tests: /matches table VESSEL column wrapping
 *
 * Goal: VESSEL names must wrap inside their column (break-words), not truncate.
 * Matches /cargo pattern from PR #643 (#636 fix).
 *
 * Strategy: static source analysis (testEnvironment: 'node').
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');
const pagePath = path.join(ROOT, 'app/matches/page.tsx');

function readSource(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('MatchesClient.tsx — VESSEL column wraps long names (#636 pattern)', () => {
  let src: string;
  beforeAll(() => { src = readSource(clientPath); });

  it('table view vessel cells use break-words, not truncate', () => {
    // Extract the table view section (after "TABLE VIEW" comment)
    const tableSection = src.slice(src.indexOf('TABLE VIEW'));
    // All vessel_id spans in table view must use break-words
    const vesselSpans = [...tableSection.matchAll(/vessel_id[^<]*<\/span>/g)];
    expect(vesselSpans.length).toBeGreaterThan(0);

    // No vessel_id span in the table section should have truncate class
    const truncatedVessel = tableSection.match(
      /className="[^"]*truncate[^"]*"[^>]*>\{match\.vessel_id\}/
    );
    expect(truncatedVessel).toBeNull();
  });

  it('table view vessel cells use break-words class', () => {
    const tableSection = src.slice(src.indexOf('TABLE VIEW'));
    expect(tableSection).toMatch(/break-words[^>]*>\{match\.vessel_name \?\? match\.vessel_id\}|className="[^"]*break-words[^"]*"[^>]*>\{match\.vessel_name \?\? match\.vessel_id\}/);
  });

  it('outer wrapper does not use overflow-x-hidden (which clips scrollable table)', () => {
    // overflow-x-hidden on parent clips inner overflow-x-auto scroll container
    // Must not appear on the top-level div wrapping the matches list
    const topDiv = src.match(/<div className="space-y-4[^"]*">/);
    expect(topDiv).not.toBeNull();
    expect(topDiv![0]).not.toContain('overflow-x-hidden');
  });

  it('table section retains overflow-x-auto for narrow viewport scroll', () => {
    expect(src).toMatch(/overflow-x-auto/);
  });
});

describe('MatchesClient.tsx — table header/body column alignment (#662 regression)', () => {
  let src: string;
  beforeAll(() => { src = readSource(clientPath); });

  it('CARGO/VESSEL column header (i=5) is text-left, not text-right', () => {
    // Bug: old rule `i >= 3 && i <= 6 ? 'text-right'` right-aligned i=5 (Cargo/Vessel)
    // but the body cell is left-aligned, causing header↔body column misalignment.
    expect(src).not.toMatch(/i >= 3 && i <= 6 \? 'text-right'/);
  });

  it('only DWT (i=3), TCE (i=4), Laycan (i=6) headers are right-aligned', () => {
    expect(src).toMatch(/i === 3 \|\| i === 4 \|\| i === 6 \? 'text-right' : 'text-left'/);
  });

  it('thead column count matches tbody column count (8 each)', () => {
    const tableSection = src.slice(src.indexOf('TABLE VIEW'));
    const colCount = (tableSection.match(/<col /g) ?? []).length;
    expect(colCount).toBe(8);
    expect(tableSection).toMatch(/'Score', 'Vessel', 'Route', 'DWT', 'TCE \/ day', 'Cargo', 'Laycan', ''/);
    expect(tableSection).toMatch(/'Score', 'Cargo', 'Route', 'DWT', 'TCE \/ day', 'Vessel', 'Laycan', ''/);
  });
});

describe('app/matches/page.tsx — full-width container matches /cargo', () => {
  let src: string;
  beforeAll(() => { src = readSource(pagePath); });

  it('uses max-w-[1280px] container matching /cargo width', () => {
    expect(src).toMatch(/max-w-\[1280px\]/);
  });

  it('does not use overflow-x-hidden at page level', () => {
    expect(src).not.toMatch(/overflow-x-hidden/);
  });
});
