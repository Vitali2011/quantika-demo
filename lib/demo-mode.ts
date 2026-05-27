/**
 * DEMO_MODE flag — strict "true" string match.
 * See docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}
