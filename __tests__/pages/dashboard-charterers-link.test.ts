/**
 * RC test (PI4) for Charterer Credit dashboard link.
 *
 * Verifies that app/dashboard/page.tsx:
 * - Contains a link to /charterers
 * - Guards it with NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED flag
 */

import * as fs from 'fs';
import * as path from 'path';

const dashboardPath = path.join(process.cwd(), 'app/dashboard/page.tsx');

describe('Dashboard Charterer Credit link (RC test)', () => {
  it('dashboard page file exists', () => {
    expect(fs.existsSync(dashboardPath)).toBe(true);
  });

  it('dashboard contains a link to /charterers', () => {
    const source = fs.readFileSync(dashboardPath, 'utf8');
    expect(source).toMatch(/href="\/charterers"/);
  });

  it('charterers link is gated by NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED', () => {
    const source = fs.readFileSync(dashboardPath, 'utf8');
    expect(source).toMatch(/NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED/);
    // Flag check and link must be within 400 chars of each other
    const flagIdx = source.indexOf('NEXT_PUBLIC_CHARTERER_CREDIT_ENABLED');
    const linkIdx = source.indexOf('href="/charterers"');
    expect(flagIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(-1);
    expect(Math.abs(flagIdx - linkIdx)).toBeLessThan(400);
  });
});
