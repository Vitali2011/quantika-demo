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
    expect(tableSection).toMatch(/break-words[^>]*>\{match\.vessel_id\}|className="[^"]*break-words[^"]*"[^>]*>\{match\.vessel_id\}/);
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
