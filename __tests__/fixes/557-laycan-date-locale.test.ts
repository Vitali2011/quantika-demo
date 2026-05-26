/**
 * #557 — Laycan date inputs must not inherit browser locale (e.g. ru-RU → ДД.ММ.ГГГГ).
 *
 * Fix: lang="en" on <input type="date"> forces English date format in all browsers
 * regardless of navigator.language.
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

describe('MatchesClient.tsx — Laycan date inputs locale (#557)', () => {
  it('Laycan From input has lang="en" (lang attr appears before value={laycan_from})', () => {
    const src = readSource();
    // lang="en" must appear within 150 chars before value={laycan_from}
    expect(src).toMatch(/lang\s*=\s*["']en["'][\s\S]{0,150}value=\{laycan_from\}/);
  });

  it('Laycan To input has lang="en" (lang attr appears before value={laycan_to})', () => {
    const src = readSource();
    // lang="en" must appear within 150 chars before value={laycan_to}
    expect(src).toMatch(/lang\s*=\s*["']en["'][\s\S]{0,150}value=\{laycan_to\}/);
  });

  it('both laycan date inputs use type="date" (preserving native date picker)', () => {
    const src = readSource();
    // Count type="date" occurrences near laycan section (wider window = 1000 chars)
    const laycanSection = src.match(/Laycan range[\s\S]{0,1000}/)?.[0] ?? '';
    const dateInputs = laycanSection.match(/type="date"/g) ?? [];
    expect(dateInputs.length).toBe(2);
  });

  it('simulates ru-RU locale — lang="en" is the locale guard on both inputs', () => {
    // navigator.language does not control <input type="date"> display format.
    // The browser uses the html/element lang attribute for that.
    // This test documents the contract: lang="en" must be present on both laycan inputs.
    const src = readSource();
    const langEnOccurrences = (src.match(/lang\s*=\s*["']en["']/g) ?? []).length;
    // At minimum 2: one per laycan input.
    expect(langEnOccurrences).toBeGreaterThanOrEqual(2);
  });
});
