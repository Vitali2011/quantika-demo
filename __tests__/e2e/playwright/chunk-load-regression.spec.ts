/**
 * Regression: #451 + #452 — /market and /vessels chunk load failure (module 964893)
 *
 * Root cause: Turbopack workspace root was not pinned, causing git worktree
 * lockfiles to be detected as additional package roots. This produced
 * non-deterministic module IDs (including module 964893) that differed between
 * build environments, resulting in missing chunks at runtime.
 *
 * Fix: `turbopack.root = __dirname` in next.config.mjs pins the workspace root.
 *
 * This test ensures both pages mount without any ChunkLoadError in the browser
 * console. It also verifies that the page renders meaningful content (not just
 * the error boundary).
 */
import { test, expect } from '@playwright/test';

const CHUNK_ERROR_PATTERNS = [
  /Failed to load chunk/i,
  /ChunkLoadError/i,
  /Loading chunk .* failed/i,
  /module \d+ not found/i,
];

function collectChunkErrors(errors: string[], msg: string) {
  if (CHUNK_ERROR_PATTERNS.some((p) => p.test(msg))) {
    errors.push(msg);
  }
}

test.describe('regression: #451 #452 — no chunk load errors on /market and /vessels', () => {
  test('/market loads without chunk errors', async ({ page }) => {
    const chunkErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') collectChunkErrors(chunkErrors, msg.text());
    });
    page.on('pageerror', (err) => collectChunkErrors(chunkErrors, err.message));

    await page.goto('/market');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    expect(
      chunkErrors,
      `Chunk load errors on /market: ${chunkErrors.join('; ')}`,
    ).toHaveLength(0);

    // Page must render real content — not a blank screen or error boundary
    const body = await page.locator('body').textContent();
    expect(body).not.toMatch(/something went wrong/i);
    // Either the page heading or the feature-gate notice should be visible
    const hasContent =
      (await page.locator('h1, h2, main').count()) > 0 ||
      (body?.length ?? 0) > 100;
    expect(hasContent, 'page rendered no content').toBe(true);
  });

  test('/vessels loads without chunk errors', async ({ page }) => {
    const chunkErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') collectChunkErrors(chunkErrors, msg.text());
    });
    page.on('pageerror', (err) => collectChunkErrors(chunkErrors, err.message));

    await page.goto('/vessels');
    await page.waitForLoadState('networkidle', { timeout: 20_000 });

    expect(
      chunkErrors,
      `Chunk load errors on /vessels: ${chunkErrors.join('; ')}`,
    ).toHaveLength(0);

    const body = await page.locator('body').textContent();
    expect(body).not.toMatch(/something went wrong/i);
    const hasContent =
      (await page.locator('h1, h2, main').count()) > 0 ||
      (body?.length ?? 0) > 100;
    expect(hasContent, 'page rendered no content').toBe(true);
  });
});
