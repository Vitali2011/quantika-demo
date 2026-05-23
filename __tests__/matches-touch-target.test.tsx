/**
 * H-2 touch-target audit — MatchesClient.tsx
 * H-3 bulk-footer BottomNav clearance
 *
 * Static source analysis (testEnvironment: 'node').
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('H-2 — status chips ≥44px', () => {
  it('All chip uses py-2.5 (not py-1)', () => {
    const src = readSource();
    // py-1 was 30px; py-2.5 gives ≥44px with line-height
    expect(src).toMatch(/py-2\.5.*rounded-full.*text-sm.*border.*bg-blue-600/);
  });

  it('status filter chips use py-2.5', () => {
    const src = readSource();
    // ALL_STATUSES map uses py-2.5
    expect(src).toMatch(/py-2\.5.*rounded-full.*text-sm.*border.*capitalize/);
  });

  it('Advanced Filters chip uses py-2.5', () => {
    const src = readSource();
    // className and text are on separate lines in JSX — check both exist
    expect(src).toMatch(/Advanced Filters/);
    expect(src).toMatch(/py-2\.5.*rounded-full.*text-sm.*border.*bg-white/);
  });

  it('status chips have min-h-[44px]', () => {
    const src = readSource();
    // Confirm min-height guard exists on chips
    expect(src).toMatch(/min-h-\[44px\].*rounded-full|rounded-full.*min-h-\[44px\]/);
  });
});

describe('H-2 — action buttons ≥44px', () => {
  it('Save action button uses py-3', () => {
    const src = readSource();
    expect(src).toMatch(/py-3.*text-xs.*rounded.*bg-green-100.*text-green-700/);
  });

  it('Dismiss action button uses py-3', () => {
    const src = readSource();
    expect(src).toMatch(/py-3.*text-xs.*rounded.*bg-red-100.*text-red-700/);
  });

  it('Archive action button uses py-3', () => {
    const src = readSource();
    expect(src).toMatch(/py-3.*text-xs.*rounded.*bg-gray-100.*text-gray-600/);
  });

  it('Restore action button uses py-3', () => {
    const src = readSource();
    expect(src).toMatch(/py-3.*text-xs.*rounded.*bg-blue-100.*text-blue-700/);
  });

  it('action buttons have min-h-[44px]', () => {
    const src = readSource();
    expect(src).toMatch(/py-3.*text-xs.*rounded.*min-h-\[44px\]|min-h-\[44px\].*text-xs.*rounded/);
  });
});

describe('H-3 — bulk footer clears BottomNav', () => {
  it('bulk footer div has pb calc with 56px BottomNav height', () => {
    const src = readSource();
    expect(src).toMatch(/pb-\[calc\(56px\+env\(safe-area-inset-bottom,0px\)\)\]/);
  });

  it('bulk footer is fixed bottom-0 z-50', () => {
    const src = readSource();
    expect(src).toMatch(/fixed.*bottom-0.*z-50|fixed bottom-0[\s\S]{0,100}z-50/);
  });

  it('bulk action buttons in footer use py-3 min-h-[44px]', () => {
    const src = readSource();
    // Bulk footer buttons must also be ≥44px
    expect(src).toMatch(/py-3.*text-sm.*rounded.*bg-blue-100.*min-h-\[44px\]|py-3.*min-h-\[44px\].*bg-blue-100/);
  });
});
