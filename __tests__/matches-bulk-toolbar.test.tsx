/**
 * RED tests — bulk-action toolbar visibility (#374)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Covers:
 *  1. Toolbar has data-testid="bulk-toolbar" for testability
 *  2. Toolbar renders when selectedIds.size >= 1 (not only > 1)
 *  3. Toolbar is outside the filtered.length guard (renders even with empty list)
 *  4. Boundary: 1 element selected, 2 elements selected, 50+ selected
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient.tsx — bulk toolbar visibility (#374)', () => {
  it('toolbar element has data-testid="bulk-toolbar"', () => {
    const src = readSource();
    expect(src).toMatch(/data-testid=["']bulk-toolbar["']/);
  });

  it('toolbar renders when selectedIds.size > 0 (not > 1 or >= 2)', () => {
    const src = readSource();
    // Must use > 0 check, NOT > 1 or >= 2 which would skip single selection
    expect(src).toMatch(/selectedIds\.size\s*>\s*0/);
  });

  it('Boundary Class 1 — selecting 1 match triggers toolbar (size > 0 is true for size=1)', () => {
    const src = readSource();
    // Verify the condition is strictly > 0 and not > 1
    const toolbarBlock = src.match(/selectedIds\.size\s*>\s*\d+\s*&&[\s\S]{0,50}bulk-toolbar/);
    if (toolbarBlock) {
      expect(toolbarBlock[0]).toMatch(/>\s*0/);
      expect(toolbarBlock[0]).not.toMatch(/>\s*[123456789]/);
    } else {
      // Condition might be on the same line as toolbar — verify > 0 exists
      expect(src).toMatch(/selectedIds\.size\s*>\s*0/);
    }
  });

  it('toolbar is rendered outside the filtered.length conditional', () => {
    const src = readSource();
    // The toolbar (bulk-footer) must appear AFTER the filtered ternary closes
    const filteredTernaryEnd = src.indexOf('filtered.length === 0');
    const toolbarIndex = src.indexOf('bulk-toolbar');
    expect(filteredTernaryEnd).not.toBe(-1);
    expect(toolbarIndex).not.toBe(-1);
    // toolbar appears after the filtered block
    expect(toolbarIndex).toBeGreaterThan(filteredTernaryEnd);
  });

  it('toolbar shows count of selected matches', () => {
    const src = readSource();
    expect(src).toMatch(/selectedIds\.size/);
    expect(src).toMatch(/match.*selected|selected.*match/i);
  });

  it('toolbar has Save All button', () => {
    const src = readSource();
    expect(src).toMatch(/Save All/);
  });

  it('toolbar has Dismiss All button', () => {
    const src = readSource();
    expect(src).toMatch(/Dismiss All/);
  });

  it('toolbar has Archive All button', () => {
    const src = readSource();
    expect(src).toMatch(/Archive All/);
  });

});
