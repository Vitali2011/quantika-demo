/**
 * TDD (RED) source-analysis tests for components/ui/button.tsx touch-target sizes.
 *
 * These tests read the button.tsx source file directly (no DOM/React needed)
 * and assert that the WCAG-compliant minimum touch-target sizes are present.
 *
 * Current state (RED — will fail):
 *   default  → h-8   (32px)   needs to become h-11 (44px)
 *   lg       → h-9   (36px)   needs to become h-12 (48px)
 *   icon     → size-8 (32px)  needs to become size-11 (44px)
 *   icon-lg  → size-9 (36px)  needs to become size-12 (48px)
 *
 * Tests MUST fail until the implementation is updated.
 */

import * as fs from 'fs';
import * as path from 'path';

const BUTTON_PATH = path.resolve(__dirname, '../../../components/ui/button.tsx');

let buttonSource: string;

beforeAll(() => {
  buttonSource = fs.readFileSync(BUTTON_PATH, 'utf-8');
});

describe('button.tsx — touch-target size classes (RED phase)', () => {
  /**
   * TDD-1: default size must be h-11 (44px min-height), not the current h-8 (32px).
   */
  it('TDD-1: default size variant contains h-11 (44px touch target)', () => {
    // The size variant block for "default" must reference h-11
    // We look for the pattern:  default: "... h-11 ..."
    expect(buttonSource).toMatch(/default:\s*["'][^"']*\bh-11\b/);
  });

  /**
   * TDD-2: lg size must be h-12 (48px), not the current h-9 (36px).
   */
  it('TDD-2: lg size variant contains h-12 (48px touch target)', () => {
    expect(buttonSource).toMatch(/lg:\s*["'][^"']*\bh-12\b/);
  });

  /**
   * TDD-3: icon size must be size-11 (44px square), not the current size-8 (32px).
   */
  it('TDD-3: icon size variant contains size-11 (44px square touch target)', () => {
    // "icon" key (not icon-xs, icon-sm, icon-lg) must have size-11
    // We match: icon: "size-11"  (standalone "icon" key)
    expect(buttonSource).toMatch(/"icon":\s*["'][^"']*\bsize-11\b/);
  });

  /**
   * TDD-4: icon-lg size must be size-12 (48px square), not the current size-9 (36px).
   */
  it('TDD-4: icon-lg size variant contains size-12 (48px square touch target)', () => {
    expect(buttonSource).toMatch(/"icon-lg":\s*["'][^"']*\bsize-12\b/);
  });
});
