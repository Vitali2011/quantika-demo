/**
 * Regression: #450 + #517 — RSC streaming skeleton forever on hard navigation.
 *
 * #450: MatchesClient uses useSearchParams() → must be wrapped in <Suspense>.
 * #517: TrialBannerWrapper called cookies() inside <Suspense> in the root layout.
 *       Calling a dynamic Next.js function (cookies/headers) inside a Suspense
 *       boundary caused the streaming response to stall on hard nav — all
 *       authenticated pages showed an empty body.innerText after 8+ seconds.
 *
 * Fix: TrialBannerWrapper now receives sessionId as a prop (resolved in the
 * layout's own await cookies() call) so no dynamic function is called inside
 * the Suspense boundary.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('RSC streaming Suspense boundaries — regression #450 + #517', () => {
  describe('app/matches/page.tsx', () => {
    let src: string;
    beforeAll(() => { src = read('app/matches/page.tsx'); });

    it('imports Suspense from react', () => {
      expect(src).toMatch(/import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*['"]react['"]/);
    });

    it('wraps MatchesClient in <Suspense>', () => {
      // Suspense must appear before MatchesClient in the source
      const suspenseIdx = src.indexOf('<Suspense');
      const clientIdx = src.indexOf('<MatchesClient');
      expect(suspenseIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeGreaterThan(-1);
      expect(suspenseIdx).toBeLessThan(clientIdx);
    });

    it('<Suspense> has a fallback prop', () => {
      expect(src).toMatch(/<Suspense\s+fallback=/);
    });
  });

  describe('app/layout.tsx', () => {
    let src: string;
    beforeAll(() => { src = read('app/layout.tsx'); });

    it('imports Suspense from react', () => {
      expect(src).toMatch(/import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*['"]react['"]/);
    });

    it('wraps TrialBannerWrapper in <Suspense>', () => {
      const trialIdx = src.indexOf('<TrialBannerWrapper');
      expect(trialIdx).toBeGreaterThan(-1);

      // Find the closest <Suspense before it
      const before = src.slice(0, trialIdx);
      const lastSuspenseOpen = before.lastIndexOf('<Suspense');
      expect(lastSuspenseOpen).toBeGreaterThan(-1);

      // <TrialBannerWrapper .../> must be followed by </Suspense>
      const after = src.slice(trialIdx);
      expect(after).toMatch(/<TrialBannerWrapper[^/].*\/>[\s\S]*?<\/Suspense>/);
    });

    it('passes sessionId as prop to TrialBannerWrapper (#517)', () => {
      // TrialBannerWrapper must receive sessionId prop — not call cookies() itself
      expect(src).toMatch(/<TrialBannerWrapper\s+sessionId=/);
    });
  });

  describe('TrialBannerWrapper — #517 fix: no cookies() inside Suspense', () => {
    let src: string;
    beforeAll(() => { src = read('app/layout.tsx'); });

    it('TrialBannerWrapper function does not call cookies() (#517)', () => {
      // Extract the TrialBannerWrapper function body
      const fnStart = src.indexOf('async function TrialBannerWrapper(');
      expect(fnStart).toBeGreaterThan(-1);

      // Find the closing brace of the function
      // Walk chars counting braces from the opening {
      let depth = 0;
      let bodyStart = -1;
      let fnEnd = -1;
      for (let i = fnStart; i < src.length; i++) {
        if (src[i] === '{') {
          depth++;
          if (depth === 1) bodyStart = i;
        } else if (src[i] === '}') {
          depth--;
          if (depth === 0) { fnEnd = i; break; }
        }
      }
      expect(bodyStart).toBeGreaterThan(-1);
      expect(fnEnd).toBeGreaterThan(-1);

      const fnBody = src.slice(bodyStart, fnEnd + 1);
      // cookies() must NOT be called inside TrialBannerWrapper
      expect(fnBody).not.toMatch(/\bcookies\s*\(/);
    });

    it('TrialBannerWrapper accepts sessionId parameter (#517)', () => {
      expect(src).toMatch(/async function TrialBannerWrapper\s*\(\s*\{[^}]*sessionId/);
    });

    it('layout resolves sessionId from cookieStore before the Suspense (#517)', () => {
      // sessionId must be derived from cookieStore.get('session_id') BEFORE the
      // <Suspense>/<TrialBannerWrapper> render, ensuring no dynamic call inside Suspense
      const sessionIdIdx = src.indexOf("cookieStore.get('session_id')");
      const trialWrapperIdx = src.indexOf('<TrialBannerWrapper');
      expect(sessionIdIdx).toBeGreaterThan(-1);
      expect(trialWrapperIdx).toBeGreaterThan(-1);
      expect(sessionIdIdx).toBeLessThan(trialWrapperIdx);
    });
  });

  describe('MatchesClient.tsx — useSearchParams usage', () => {
    let src: string;
    beforeAll(() => { src = read('app/matches/MatchesClient.tsx'); });

    it('still uses useSearchParams (confirming the fix is needed)', () => {
      expect(src).toMatch(/useSearchParams/);
    });
  });
});
