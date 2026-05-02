/**
 * spec-betafix-02 — L5C fail-closed for unknown cargo pairs (BUG-09).
 *
 * Contract change: when the matrix has no entry for a (prev → next) pair,
 * checkCompatibility now returns compatible:false + requires_manual_review:true
 * instead of compatible:true with an info-warning. This protects against
 * silent green-light on combinations the matrix simply does not cover
 * (e.g. coal → "wheat in bags" — the bagged form is not enumerated).
 *
 * Known pairs (matrix has an entry) keep their previous behavior unchanged.
 */
import { checkCompatibility } from '../l5c-matrix';

describe('L5C fail-closed for unknown pairs (spec-betafix-02)', () => {
  it('coal → "wheat in bags" (unknown — not in matrix) → compatible:false + requires_manual_review:true', () => {
    const r = checkCompatibility(['coal'], 'wheat in bags');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.blocking_pairs.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/manual surveyor review/i);
  });

  it('DRI → grain (KNOWN incompatible pair) — compatible:false from matrix, no manual_review flag', () => {
    const r = checkCompatibility(['DRI'], 'grain');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs).toHaveLength(1);
    expect(r.blocking_pairs[0].reason).toMatch(/iron oxide/i);
  });

  it('coal → bauxite (KNOWN compatible pair) — compatible:true, requires_manual_review:false', () => {
    const r = checkCompatibility(['coal'], 'bauxite');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs).toHaveLength(0);
  });

  it('empty prevCargoes → compatible:true (clean ballast OK), no manual_review', () => {
    const r = checkCompatibility([], 'wheat');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs).toHaveLength(0);
  });

  it('mixed prevs with one unknown → entire batch fail-closed (one unknown poisons the lot)', () => {
    // petcoke→grain is KNOWN incompatible; coal→grain is KNOWN incompatible;
    // unknownX→grain has no matrix entry — must contribute its own blocking entry.
    const r = checkCompatibility(['petcoke', 'coal', 'unknownX'], 'grain');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    // 2 known incompatibles + 1 unknown = 3 blocking entries
    expect(r.blocking_pairs).toHaveLength(3);
    const prevs = r.blocking_pairs.map((bp) => bp.previous);
    expect(prevs).toContain('unknownX');
  });

  it('all-unknown prevs → compatible:false + requires_manual_review:true, no known incompatibilities', () => {
    const r = checkCompatibility(['titanium', 'lithium-ore'], 'wheat in bags');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.blocking_pairs).toHaveLength(2);
  });
});
