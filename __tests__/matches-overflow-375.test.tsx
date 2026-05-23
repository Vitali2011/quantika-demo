/**
 * RED tests — horizontal overflow at 375px viewport (#375)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Covers:
 *  1. Outer container has overflow-x-hidden to prevent page-level scroll
 *  2. Card li elements have overflow-hidden to clip internal content
 *  3. Flex content areas have min-w-0 to allow shrinking below content size
 *  4. Action buttons row has flex-wrap for narrow viewports
 *  5. Boundary: 1 element, 50+ elements (same CSS applies)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient.tsx — horizontal overflow protection at 375px (#375)', () => {
  it('outer container div has overflow-x-hidden class', () => {
    const src = readSource();
    expect(src).toMatch(/overflow-x-hidden/);
  });

  it('card li or card wrapper has overflow-hidden class', () => {
    const src = readSource();
    // li or card wrapper must have overflow-hidden to clip overflowing content
    expect(src).toMatch(/overflow-hidden/);
  });

  it('flex content area inside card has min-w-0 to allow flex shrink', () => {
    const src = readSource();
    // Flex children must have min-w-0 so they can shrink below content size
    expect(src).toMatch(/min-w-0/);
  });

  it('action buttons row has flex-wrap for narrow viewports', () => {
    const src = readSource();
    // Action buttons must wrap on narrow screens
    expect(src).toMatch(/flex-wrap/);
  });

  it('match card does not use fixed-width columns without overflow protection', () => {
    const src = readSource();
    // Should not have fixed pixel widths (like w-[400px]) without overflow guard
    // We verify overflow-x-hidden exists (already checked above) and no wide fixed widths
    const wideFixedWidth = src.match(/w-\[(\d{3,})px\]/g) ?? [];
    const wideWidths = wideFixedWidth.filter(w => {
      const px = parseInt(w.match(/\d+/)?.[0] ?? '0');
      return px > 375;
    });
    expect(wideWidths).toHaveLength(0);
  });

  it('Boundary Class 1 — 1 card: overflow classes are on the structural elements, not count-dependent', () => {
    const src = readSource();
    // Overflow classes must be static Tailwind classes, not conditionally applied based on count
    expect(src).toMatch(/overflow-x-hidden/);
    expect(src).toMatch(/overflow-hidden/);
    // overflow-x-hidden must appear on the outer container div (not gated by match count)
    // Verify it is present in the return JSX (not only as a comment or string constant)
    expect(src).toMatch(/<div[^>]*overflow-x-hidden/);
  });

  it('Boundary Class 5 — 50+ cards: same overflow classes apply via map (structural classes on li)', () => {
    const src = readSource();
    // The li element inside the card-render filtered.map must have overflow-hidden
    // Use (match) to find the card-render map, not the id-extract map
    const mapBlock = src.match(/filtered\.map\s*\(\s*\(match\)[\s\S]{0,400}/)?.[0] ?? '';
    expect(mapBlock).toMatch(/overflow-hidden/);
  });
});
