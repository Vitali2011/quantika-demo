/**
 * Tests — components/match/MatchDetailPanel.tsx AI Summary fit% (#fit-primary)
 *
 * Strategy: static source analysis (testEnvironment: 'node').
 *
 * Verifies:
 *   - AI Summary no longer shows opaque "Score NN reflects…" text
 *   - When fitPercent != null: shows "Fit NN% — взвешено по факторам ниже"
 *   - When !hasSessionMatch: reload fallback text preserved
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const panelPath = path.join(ROOT, 'components/match/MatchDetailPanel.tsx');

function readSource(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('MatchDetailPanel.tsx — AI Summary fit% (#fit-primary)', () => {
  it('file exists', () => {
    expect(fs.existsSync(panelPath)).toBe(true);
  });

  it('does NOT contain opaque "Score … reflects" text', () => {
    const src = readSource(panelPath);
    expect(src).not.toMatch(/Score.*reflects/);
  });

  it('shows "Fit" label with fit percent when fitPercent is set', () => {
    const src = readSource(panelPath);
    // Must render something like: Fit ${Math.round(fitPercent)}%
    expect(src).toMatch(/Fit.*fitPercent|fitPercent.*Fit/);
  });

  it('uses Math.round for fitPercent display in AI Summary', () => {
    const src = readSource(panelPath);
    expect(src).toMatch(/Math\.round.*fitPercent/);
  });

  it('preserves reload fallback text for !hasSessionMatch', () => {
    const src = readSource(panelPath);
    expect(src).toMatch(/Reload to refresh match data/);
  });

  it('data-testid="match-detail-panel" still present', () => {
    const src = readSource(panelPath);
    expect(src).toMatch(/data-testid="match-detail-panel"/);
  });
});
