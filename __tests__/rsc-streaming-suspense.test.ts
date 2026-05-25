/**
 * Regression: #450 — /matches and /dashboard RSC streaming skeleton forever.
 *
 * Verifies that components using useSearchParams() are wrapped in <Suspense>,
 * and that async RSC components in the layout are wrapped in <Suspense>.
 *
 * Without these boundaries, Next.js 16 bails out to CSR and the loading.tsx
 * skeleton never resolves.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('RSC streaming Suspense boundaries — regression #450', () => {
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
      // Find the <Suspense ...> that immediately wraps <TrialBannerWrapper />
      const trialIdx = src.indexOf('<TrialBannerWrapper');
      expect(trialIdx).toBeGreaterThan(-1);

      // Find the closest <Suspense before it
      const before = src.slice(0, trialIdx);
      const lastSuspenseOpen = before.lastIndexOf('<Suspense');
      expect(lastSuspenseOpen).toBeGreaterThan(-1);

      // <TrialBannerWrapper /> must be followed by </Suspense>
      const after = src.slice(trialIdx);
      expect(after).toMatch(/<TrialBannerWrapper\s*\/>[\s\S]*?<\/Suspense>/);
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
