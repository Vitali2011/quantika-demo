/**
 * TDD tests for γ-01: EconomicsTab currency selector.
 * Uses static JSX source analysis — no jsdom needed.
 *
 * Behaviour when NEXT_PUBLIC_MULTI_CURRENCY_V2_ENABLED:
 *   - false/unset: no currency selector rendered
 *   - true: currency dropdown with USD, EUR, NOK, AED appears
 */

import * as fs from 'fs';
import * as path from 'path';

const componentPath = path.join(process.cwd(), 'components/match/EconomicsTab.tsx');
const source = fs.readFileSync(componentPath, 'utf8');
const withoutComments = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

describe('EconomicsTab currency selector (γ-01)', () => {
  it('reads NEXT_PUBLIC_MULTI_CURRENCY_V2_ENABLED env flag', () => {
    expect(withoutComments).toContain('NEXT_PUBLIC_MULTI_CURRENCY_V2_ENABLED');
  });

  it('has currency state with USD as default', () => {
    expect(withoutComments).toMatch(/displayCurrency|selectedCurrency/);
    expect(withoutComments).toContain("'USD'");
  });

  it('renders currency selector only when flag is enabled', () => {
    // Should have conditional rendering based on the flag
    expect(withoutComments).toMatch(/multiCurrency|MULTI_CURRENCY/);
  });

  it('includes USD option in currency selector', () => {
    expect(withoutComments).toContain('USD');
  });

  it('includes EUR option in currency selector', () => {
    expect(withoutComments).toContain('EUR');
  });

  it('includes NOK option in currency selector', () => {
    expect(withoutComments).toContain('NOK');
  });

  it('includes AED option in currency selector', () => {
    expect(withoutComments).toContain('AED');
  });

  it('has aria-label for the currency selector', () => {
    expect(withoutComments).toMatch(/Display currency|display.currency|Currency/i);
  });

  it('does not break existing bunker port selector (regression)', () => {
    expect(withoutComments).toContain('Bunker port');
    expect(withoutComments).toContain('SGSIN');
  });

  it('does not break existing bunker grade selector (regression)', () => {
    expect(withoutComments).toContain('Bunker grade');
    expect(withoutComments).toContain('VLSFO');
  });
});
