/**
 * RC test (PI4) for Market dashboard link.
 *
 * Verifies that app/dashboard/page.tsx contains a Link to /market
 * so brokers can navigate to the market indices screen from home.
 */

import * as fs from 'fs';
import * as path from 'path';

const dashboardPath = path.join(process.cwd(), 'app/dashboard/page.tsx');

describe('Dashboard Market link (RC test)', () => {
  it('dashboard page file exists', () => {
    expect(fs.existsSync(dashboardPath)).toBe(true);
  });

  it('dashboard contains a link to /market', () => {
    const source = fs.readFileSync(dashboardPath, 'utf8');
    expect(source).toMatch(/href="\/market"/);
  });

  it('market link is in the Market Intelligence section', () => {
    const source = fs.readFileSync(dashboardPath, 'utf8');
    const marketIntelIdx = source.indexOf('Market Intelligence');
    const linkIdx = source.indexOf('href="/market"');
    expect(marketIntelIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(-1);
    // Link must appear after the Market Intelligence section header
    expect(linkIdx).toBeGreaterThan(marketIntelIdx);
    // And within a reasonable proximity (same section)
    expect(linkIdx - marketIntelIdx).toBeLessThan(500);
  });
});
