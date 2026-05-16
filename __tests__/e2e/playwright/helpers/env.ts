/**
 * Shared env + feature-flag helpers for the Task 3.3 Playwright suite.
 *
 * Reads NEXT_PUBLIC_* flags from process.env at the moment the test process
 * starts. Since Playwright runs in Node, the local .env.local is already
 * loaded by Next.js dev-server side, but the test process itself reads them
 * from its own environment — so the CI workflow or operator must export them.
 *
 * For local dev: .env.local is sourced automatically by `npm run dev` (Next.js).
 * The TEST process itself only checks them defensively to decide skip.
 */

export const SUITE_ENV = {
  baseUrl: process.env.SUITE_BASE_URL || 'http://localhost:3000',
  isProd: !!process.env.SUITE_BASE_URL?.includes('demo.quantika.org'),
  isCI: !!process.env.CI,
  demoAuthUser: process.env.DEMO_AUTH_USER || 'admin',
  demoAuthPassword: process.env.DEMO_AUTH_PASSWORD || '',
} as const;

/**
 * Returns true if the page text indicates a feature-flag gate.
 *
 * Pages like /laytime, /clauses, /market, /charterers render a
 * "Feature not enabled" or "Feature Not Enabled" panel when the corresponding
 * NEXT_PUBLIC_*_ENABLED flag is not 'true'.
 */
export function isFeatureGate(bodyText: string | null | undefined): boolean {
  if (!bodyText) return false;
  return /feature\s+not\s+enabled/i.test(bodyText);
}
