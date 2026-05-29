/**
 * Regression: #632 — "BLOCKED PAIRS" internal filter diagnostic must not be
 * visible on the broker-facing dashboard. Static source check.
 */
import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/page.tsx'),
  'utf8',
);

describe('dashboard #632 — no internal filter diagnostics', () => {
  it('does not render Blocked Pairs section', () => {
    expect(source).not.toContain('Blocked Pairs');
  });

  it('does not render Hard Filter Fails section', () => {
    expect(source).not.toContain('Hard Filter Fails');
  });

  it('does not reference blockedMatches in JSX render', () => {
    // blockedMatches may still exist in lib/types but must not drive UI
    expect(source).not.toContain('blockedMatches.length');
  });

  it('does not reference filterBlocked in JSX render', () => {
    expect(source).not.toContain('filterBlocked');
  });
});
