/**
 * TC-03 Regression Guard — Onboarding 200 / no crash-loop
 *
 * Protects against reintroduction of the 500-error on /onboarding fixed in PR #38/#39.
 * Root causes: missing default export, unconditional redirect, or db.prepare() called
 * at module-load time (before Turbopack resolves the native module hash).
 *
 * RED condition:
 *   - Remove default export from app/onboarding/page.tsx, OR
 *   - Add db.prepare() call at module level, OR
 *   - Add unconditional redirect('/') outside a conditional block
 *
 * Input contract: reads app/onboarding/page.tsx from filesystem.
 * No runtime inputs — types exhausted by file paths.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ONBOARDING_PAGE = path.join(ROOT, 'app/onboarding/page.tsx');

describe('TC-03: Onboarding 200 — page structure regression', () => {
  let src: string;

  beforeAll(() => {
    // File must exist — its absence is itself a regression
    if (!fs.existsSync(ONBOARDING_PAGE)) {
      throw new Error(
        'TC-03 regression: app/onboarding/page.tsx missing — page must exist',
      );
    }
    src = fs.readFileSync(ONBOARDING_PAGE, 'utf-8');
  });

  it('exports a default React component (not null, not a throw)', () => {
    // PR #39 fix: page must export a renderable component.
    // `export default null` or no export → Next.js returns 500.
    expect(src).toMatch(/export\s+default\s+(?:async\s+)?function\s+\w+/);
    expect(src).not.toMatch(/export\s+default\s+null/);
    expect(src).not.toMatch(/export\s+default\s+undefined/);
  });

  it('does not call db.prepare() at module scope (outside any function body)', () => {
    // Calling db.prepare() at module-load time causes a crash-loop because
    // better-sqlite3 isn't available until after Turbopack finishes hashing.
    // Module-level calls appear at indent-0 (no leading spaces/tabs).
    const topLevelDbPrepare = /^(?![ \t]).*\.prepare\s*\(/m;
    expect(src).not.toMatch(topLevelDbPrepare);
  });

  it('does not have an unconditional redirect("/") in the default-export component body', () => {
    // An unconditional redirect('/') inside OnboardingPage (the exported component) would
    // immediately bounce the user from /onboarding → / on every render.
    // Server action functions (marked 'use server') are excluded: their redirect('/') runs
    // only on form submit and sends the user home after successful onboarding — that is correct.
    //
    // Strategy: split file into named function blocks; for the default-export component,
    // verify every redirect('/') is guarded by an `if` in the same block.

    // Find the default export function body heuristically:
    // everything after "export default async function" or "export default function"
    const exportMatch = src.match(/export\s+default\s+(?:async\s+)?function[\s\S]*/);
    if (!exportMatch) {
      // If no default export function, the earlier test already catches this.
      return;
    }
    const componentBody = exportMatch[0];

    // Exclude lines that are inside inner functions with 'use server'
    // (server actions are nested async functions — they start with async function ... { 'use server' )
    // Simple approximation: remove server-action-function blocks from the body.
    const withoutServerActions = componentBody.replace(
      /async\s+function\s+\w+[^{]*\{[^}]*['"]use server['"][^}]*(?:\{[^}]*\}[^}]*)*\}/g,
      '',
    );

    const lines = withoutServerActions.split('\n');
    const redirectLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => /redirect\s*\(\s*['"]\/['"]\s*\)/.test(line));

    for (const { i } of redirectLines) {
      // Look back up to 8 lines for a conditional construct
      const context = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
      const hasConditional = /\bif\s*\(|\?\s*redirect|\bswitch\s*\(/.test(context);
      expect(hasConditional).toBe(true);
    }
  });

  it('does not contain a bare throw at module scope', () => {
    // A top-level throw (outside any function) would crash the module on import.
    const topLevelThrow = /^(?![ \t])throw\s+/m;
    expect(src).not.toMatch(topLevelThrow);
  });
});
