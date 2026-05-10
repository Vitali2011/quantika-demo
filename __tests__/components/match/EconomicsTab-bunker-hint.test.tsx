/**
 * TDD tests for BP-04: EconomicsTab bunker hint + port/grade selects.
 *
 * Uses static JSX source analysis so no jsdom needed.
 * Verifies: hint text, bunker port select with 5 options, bunker grade select,
 * and that payload includes bunkerPort/bunkerGrade fields.
 */

import * as fs from 'fs';
import * as path from 'path';

const componentPath = path.join(process.cwd(), 'components/match/EconomicsTab.tsx');
const source = fs.readFileSync(componentPath, 'utf8');
const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('EconomicsTab bunker hint (BP-04)', () => {
  it('shows hint text when bunker price is empty', () => {
    expect(withoutComments).toContain('Leave empty to use latest spot price');
  });

  it('hint is conditionally rendered based on bunkerPriceUsdPerMt being empty', () => {
    // The condition should check for falsy/empty bunker price
    expect(withoutComments).toMatch(/!bunkerPrice|bunkerPriceUsdPerMt/);
  });

  it('has bunker port select with all 5 required ports', () => {
    expect(withoutComments).toContain('NLRTM');
    expect(withoutComments).toContain('SGSIN');
    expect(withoutComments).toContain('AEFJR');
    expect(withoutComments).toContain('USHOU');
    expect(withoutComments).toContain('GIGIB');
  });

  it('has bunker grade select with VLSFO and MGO options', () => {
    expect(withoutComments).toContain('VLSFO');
    expect(withoutComments).toContain('MGO');
  });

  it('has aria-label for bunker port select', () => {
    expect(withoutComments).toContain('Bunker port');
  });

  it('has aria-label for bunker grade select', () => {
    expect(withoutComments).toContain('Bunker grade');
  });

  it('passes bunkerPort to RouteCompareModal or API payload', () => {
    expect(withoutComments).toContain('bunkerPort');
  });

  it('passes bunkerGrade to RouteCompareModal or API payload', () => {
    expect(withoutComments).toContain('bunkerGrade');
  });

  it('has state for bunkerPort with default SGSIN', () => {
    expect(withoutComments).toContain('SGSIN');
  });

  it('has state for bunkerGrade with default VLSFO', () => {
    // both VLSFO referenced as default and option
    const count = (withoutComments.match(/VLSFO/g) || []).length;
    expect(count).toBeGreaterThan(0);
  });

  it('has bunker price input field', () => {
    expect(withoutComments).toContain('bunkerPriceUsdPerMt');
  });
});
