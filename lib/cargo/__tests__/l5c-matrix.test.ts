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
import { checkCompatibility, parseLastCargoes } from '../l5c-matrix';

describe('L5C fail-closed for unknown pairs (spec-betafix-02)', () => {
  it('coal → "wheat in bags": contamination check still applies (wave-γ-2 REGRESSION-01 fix)', () => {
    // wave-γ-2 fix: BREAK_BULK form is metadata for the surveyor, NOT a verdict
    // override. Coal residue contaminates the underlying grain regardless of
    // bag form — fail-closed contamination contract is preserved.
    const r = checkCompatibility(['coal'], 'wheat in bags');
    // Positive contract — Class 12 (audit 2026-05-03):
    expect(r.compatible).toBe(false);
    expect(r.break_bulk).toBe(true);
    expect(r.blocking_pairs).toHaveLength(1);
    expect(r.blocking_pairs[0].previous).toBe('coal');
    expect(r.blocking_pairs[0].reason).toMatch(/black\s+residue|coal/i);
    // BREAK_BULK warning still present (surveyor metadata).
    expect(r.warnings.some((w) => /BREAK_BULK/i.test(w))).toBe(true);
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

  it('all-unknown prevs, wheat in bags: fail-closed preserved (wave-γ-2 REGRESSION-01 fix)', () => {
    // wave-γ-2: unknown contamination data → manual surveyor review, regardless
    // of bag form. break_bulk:true is metadata only, not a verdict override.
    const r = checkCompatibility(['titanium', 'lithium-ore'], 'wheat in bags');
    expect(r.compatible).toBe(false);
    expect(r.break_bulk).toBe(true);
    expect(r.requires_manual_review).toBe(true);
    expect(r.blocking_pairs).toHaveLength(2);
    expect(r.warnings.some((w) => /no l5c data/i.test(w))).toBe(true);
  });
});

describe('parseLastCargoes – multi-separator', () => {
  it("'Coal & Grain' → ['Coal', 'Grain']", () => {
    expect(parseLastCargoes('Coal & Grain')).toEqual(['Coal', 'Grain']);
  });

  it("' and ' separator: 'Coal and Grain' → ['Coal', 'Grain']", () => {
    expect(parseLastCargoes('Coal and Grain')).toEqual(['Coal', 'Grain']);
  });

  it('comma separator still works', () => {
    expect(parseLastCargoes('coal, grain, scrap')).toEqual(['coal', 'grain', 'scrap']);
  });

  it('newline separator splits cargoes', () => {
    expect(parseLastCargoes('Coal\nGrain\nSteel')).toEqual(['Coal', 'Grain', 'Steel']);
  });

  it('null input returns empty array', () => {
    expect(parseLastCargoes(null)).toEqual([]);
  });

  it('mixed separators (comma + ampersand)', () => {
    expect(parseLastCargoes('Coal, Grain & Scrap')).toEqual(['Coal', 'Grain', 'Scrap']);
  });
});
