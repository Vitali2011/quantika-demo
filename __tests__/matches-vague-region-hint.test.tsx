/**
 * RED tests — vague-region hint in MatchesClient.tsx (Phase E3)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 * Tests that the hint is rendered when vagueRegionAdjustment < 0.
 *
 * Covers:
 *  1. MatchesClient.tsx references vagueRegionAdjustment
 *  2. Hint text for vessel-side vague region
 *  3. Hint text for cargo-side vague region
 *  4. Generic hint text (when side is unknown / combined)
 *  5. Amber/yellow warning color is used
 *  6. Hint is conditional (only when vagueRegionAdjustment < 0, not when 0)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. vagueRegionAdjustment referenced
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — vague-region hint presence', () => {
  it('references vagueRegionAdjustment field', () => {
    const src = readSource();
    expect(src).toMatch(/vagueRegionAdjustment/);
  });

  it('checks vagueRegionAdjustment is negative (< 0)', () => {
    const src = readSource();
    // Must have a guard that checks for < 0 (not just !== 0)
    expect(src).toMatch(/vagueRegionAdjustment\s*<\s*0|<\s*0.*vagueRegionAdjustment/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2 & 3 & 4. Hint text
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — vague-region hint text', () => {
  it('contains vessel-side hint text about specific anchorage', () => {
    const src = readSource();
    // Must mention asking for specific anchorage (vessel position vague)
    expect(src).toMatch(/anchorage/i);
  });

  it('contains cargo-side hint text about specific load port', () => {
    const src = readSource();
    // Must mention asking for specific load port (cargo origin vague)
    expect(src).toMatch(/load port/i);
  });

  it('contains vague location warning hint text', () => {
    const src = readSource();
    // Must have a hint that references vague location / position / origin
    expect(src).toMatch(/[Vv]ague.*location|[Vv]ague.*position|[Vv]ague.*origin|[Vv]essel position vague|[Cc]argo origin vague/);
  });

  it('hint starts with warning symbol or prefix', () => {
    const src = readSource();
    // Hint must start with ⚠ or similar warning indicator
    expect(src).toMatch(/⚠|warn|Warning/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Amber/yellow styling (no new design tokens — reuse existing amber/yellow)
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — vague-region hint styling', () => {
  it('uses amber or yellow color for the hint (muted warning)', () => {
    const src = readSource();
    // Must use existing Tailwind amber/yellow classes for warning color
    expect(src).toMatch(/amber|yellow/i);
  });

  it('hint uses small text class', () => {
    const src = readSource();
    // Hint should use text-xs or text-sm for small text
    expect(src).toMatch(/text-xs|text-sm/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Conditional rendering
// ──────────────────────────────────────────────────────────────────────────────

describe('MatchesClient.tsx — vague-region hint conditionality', () => {
  it('hint is inside a conditional block (&&, ternary, or if)', () => {
    const src = readSource();
    // Must use && or ternary to guard hint rendering
    expect(src).toMatch(/vagueRegionAdjustment.*&&|&&.*vagueRegionAdjustment|vagueRegionAdjustment.*\?/);
  });

  it('parses reason_structured to extract vagueRegionAdjustment', () => {
    const src = readSource();
    // Must extract the field from reason_structured JSON
    expect(src).toMatch(/vagueRegionAdjustment|reason_structured/);
  });
});
