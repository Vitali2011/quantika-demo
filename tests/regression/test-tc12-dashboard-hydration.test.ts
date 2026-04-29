/**
 * TC-12 Regression Guard — Dashboard Hydration / React #418
 *
 * Protects against reintroduction of React hydration warning #418 fixed in PR #43.
 * Root cause: formatDate called new Date(...).toLocaleDateString() without a
 * timeZone, so SSR (UTC) and CSR (user-local timezone) rendered different strings,
 * causing React to throw a hydration mismatch.
 *
 * RED condition (any of):
 *   - Remove timeZone: 'UTC' from formatDate in lib/utils.ts
 *   - Remove suppressHydrationWarning from MorningHeader's date element
 *   - Add bare new Date().toLocaleDateString() (no UTC pin, no suppressHydrationWarning) in dashboard
 *
 * Input contract: reads lib/utils.ts, components/dashboard/MorningHeader.tsx,
 * app/dashboard/page.tsx, jest.setup.ts from filesystem.
 * No runtime inputs — types exhausted by file paths.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function readIfExists(relPath: string): string | null {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
}

describe('TC-12: Dashboard hydration guard regression', () => {
  describe('lib/utils.ts — formatDate must pin timeZone to UTC', () => {
    let utilsSrc: string;

    beforeAll(() => {
      const src = readIfExists('lib/utils.ts');
      expect(src).not.toBeNull();
      utilsSrc = src!;
    });

    it("formatDate function exists in lib/utils.ts", () => {
      expect(utilsSrc).toMatch(/function\s+formatDate\s*\(/);
    });

    it("formatDate uses explicit timeZone: 'UTC' to prevent SSR/CSR mismatch", () => {
      // PR #43 fix: without timeZone: 'UTC', server renders dates in UTC while the
      // browser renders in local timezone → different strings → React #418.
      // Regex accepts both single and double quotes.
      expect(utilsSrc).toMatch(/timeZone\s*:\s*['"]UTC['"]/);
    });

    it('formatDate does not use bare toLocaleDateString() without timeZone option', () => {
      // Bare toLocaleDateString() (no options object) is always timezone-dependent.
      // Extract the formatDate function body and verify it doesn't call it bare.
      const formatDateMatch = utilsSrc.match(
        /function\s+formatDate[\s\S]*?(?=\nfunction\s|\nexport\s+function\s|$)/,
      );
      if (formatDateMatch) {
        const formatDateBody = formatDateMatch[0];
        // toLocaleDateString with no arguments at all (no options object)
        const bareCall = /\.toLocaleDateString\s*\(\s*\)/;
        expect(formatDateBody).not.toMatch(bareCall);
      }
    });
  });

  describe('components/dashboard/MorningHeader.tsx — suppressHydrationWarning on date element', () => {
    let src: string;

    beforeAll(() => {
      const s = readIfExists('components/dashboard/MorningHeader.tsx');
      expect(s).not.toBeNull();
      src = s!;
    });

    it('MorningHeader renders a date/time value that changes between SSR and CSR', () => {
      // The component uses new Date() or Intl.DateTimeFormat to display today's date.
      // This is expected — suppression or UTC is the fix, not removing the display.
      expect(src).toMatch(/new\s+Date\s*\(|Intl\.DateTimeFormat/);
    });

    it('the element displaying today\'s date has suppressHydrationWarning attribute', () => {
      // React #418 fix: suppressHydrationWarning on the element containing a
      // time-sensitive value tells React to skip hydration comparison for that node.
      expect(src).toMatch(/suppressHydrationWarning/);
    });

    it('suppressHydrationWarning appears on the same element as the date output', () => {
      // Verify the attribute is on the element that renders the dynamic date value,
      // not on some unrelated element. Look for suppressHydrationWarning within 3 lines
      // of a JSX interpolation that contains a date variable (not the variable assignment).
      const lines = src.split('\n');
      const suppressLine = lines.findIndex((l) => l.includes('suppressHydrationWarning'));
      // Match JSX interpolations like {today}, {date}, {dateStr}, {formattedDate}
      // (curly-brace JSX expressions, NOT variable assignments or function calls)
      const dateLine = lines.findIndex(
        (l) => /\{today\}|\{dateStr\b\}|\{date\b\}|\{formattedDate\}/.test(l),
      );
      expect(suppressLine).toBeGreaterThanOrEqual(0);
      expect(dateLine).toBeGreaterThanOrEqual(0);
      expect(Math.abs(suppressLine - dateLine)).toBeLessThanOrEqual(3);
    });
  });

  describe('app/dashboard/page.tsx — no bare date formatting without guard', () => {
    let src: string;

    beforeAll(() => {
      const s = readIfExists('app/dashboard/page.tsx');
      expect(s).not.toBeNull();
      src = s!;
    });

    it('dashboard page does not call new Date().toLocaleDateString() directly', () => {
      // new Date().toLocaleDateString() with the *current* date is the worst offender:
      // SSR time ≠ CSR time → always a mismatch. This must not appear in the page.
      expect(src).not.toMatch(/new\s+Date\s*\(\s*\)\s*\.toLocaleDateString/);
    });

    it('dashboard page does not call toLocaleDateString() without a UTC timeZone option', () => {
      // Any toLocaleDateString() call without timeZone: UTC risks hydration mismatch.
      // Allow: toLocaleDateString('en-US', { ..., timeZone: 'UTC', ... })
      // Disallow: toLocaleDateString() or toLocaleDateString('en-US')
      const calls = [...src.matchAll(/\.toLocaleDateString\s*\([^)]*\)/g)];
      for (const [call] of calls) {
        const hasUtcOption = /timeZone\s*:\s*['"]UTC['"]/.test(call);
        expect(hasUtcOption).toBe(true);
      }
    });
  });

  describe('SSR/CSR consistency mechanism — UTC pinning or Date mock', () => {
    it('project uses at least one SSR/CSR consistency mechanism (UTC pinning or Date mock in jest.setup)', () => {
      // UTC pinning in formatDate is the primary mechanism (PR #43).
      // A Date mock in jest.setup.ts is an alternative approach.
      // Accepting either — removing BOTH would be a regression.
      const utilsSrc = readIfExists('lib/utils.ts') ?? '';
      const jestSetupSrc = readIfExists('jest.setup.ts') ?? readIfExists('jest.setup.js') ?? '';

      const hasUtcPinning = /timeZone\s*:\s*['"]UTC['"]/.test(utilsSrc);
      const hasDateMockInSetup =
        /jest\.(?:spyOn|setSystemTime|useFakeTimers)/.test(jestSetupSrc) ||
        /Date\.now\s*=/.test(jestSetupSrc);

      expect(hasUtcPinning || hasDateMockInSetup).toBe(true);
    });
  });
});
