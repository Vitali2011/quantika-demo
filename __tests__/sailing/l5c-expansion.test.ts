/**
 * spec-βf3-05 — L5C cargo-vessel compatibility matrix expansion
 *
 * Covers:
 *  1. steel → pipes: compatible, no extra_clean
 *  2. any cargo → DRI: extra_clean required
 *  3. wheat (bulk) vs wheat in bags: different verdicts (form-detection)
 *  4. edge: unknown pair preserved as fail-closed (requires_manual_review)
 */
import { checkCompatibility } from '@/lib/cargo/l5c-matrix';

describe('L5C matrix expansion (βf3-05)', () => {
  // Test 1: steel → pipes: ferrous pair, low cross-contamination
  it('steel → pipes: compatible:true, extra_clean:false', () => {
    const r = checkCompatibility(['steel'], 'pipes');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(false);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs).toHaveLength(0);
  });

  // Test 2: any cargo → DRI: extra_clean required
  it('grain → DRI: compatible with extra_clean:true (DRI dust-prone)', () => {
    const r = checkCompatibility(['grain'], 'DRI');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
    expect(r.requires_manual_review).toBe(false);
  });

  it('coal → DRI: extra_clean:true regardless of base compatibility', () => {
    const r = checkCompatibility(['coal'], 'DRI');
    expect(r.requires_extra_clean).toBe(true);
  });

  // Test 3: wheat (bulk) — normalized to grain → uses matrix
  it('wheat bulk: coal → wheat (bulk) is incompatible (grain matrix entry)', () => {
    const r = checkCompatibility(['coal'], { name: 'wheat', form: 'bulk' });
    expect(r.compatible).toBe(false);
  });

  // Test 4: wheat in bags — BREAK_BULK metadata, but contamination check still applies.
  // wave-γ-2 REGRESSION-01 fix: BREAK_BULK form does NOT override fail-closed
  // contamination. Bag protection is metadata for the surveyor; coal residue
  // still contaminates the underlying grain. Positive contract assertions
  // (Class 12) — both forms incompatible, bag carries break_bulk:true flag.
  it('wheat in bags: contamination contract still enforced; break_bulk is metadata only', () => {
    const rBulk = checkCompatibility(['coal'], { name: 'wheat', form: 'bulk' });
    const rBag = checkCompatibility(['coal'], { name: 'wheat', form: 'bag' });
    // Both forms incompatible — coal contaminates wheat regardless of stowage form.
    expect(rBulk.compatible).toBe(false);
    expect(rBag.compatible).toBe(false);
    // Form-detection evidence: bag carries the break_bulk metadata flag, bulk does not.
    expect(rBulk.break_bulk).toBeUndefined();
    expect(rBag.break_bulk).toBe(true);
    // Positive contract — bag still has the contamination reason populated.
    expect(rBag.blocking_pairs).toHaveLength(1);
    expect(rBag.blocking_pairs[0].previous).toBe('coal');
    expect(rBag.blocking_pairs[0].reason).toMatch(/black\s+residue|coal/i);
    // Surveyor warning is present for the bag form.
    expect(rBag.warnings.some((w) => /BREAK_BULK/i.test(w))).toBe(true);
  });

  it('wheat in bags via name string: same contamination verdict, break_bulk:true metadata', () => {
    const rBulk = checkCompatibility(['coal'], 'wheat');
    const rBags = checkCompatibility(['coal'], 'wheat in bags');
    expect(rBulk.compatible).toBe(false);
    expect(rBags.compatible).toBe(false); // wave-γ-2: positive contract preserved
    expect(rBags.break_bulk).toBe(true);
    // "wheat" stripped of "in bags" suffix → still normalizes to grain → coal→grain incompatible.
    expect(rBags.blocking_pairs[0].reason).toMatch(/black\s+residue|coal/i);
  });

  // Test 5: edge — unknown pair preserved as fail-closed
  it('unknown pair "uranium" → "plutonium": requires_manual_review:true (fail-closed preserved)', () => {
    const r = checkCompatibility(['uranium'], 'plutonium');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.blocking_pairs).toHaveLength(1);
  });
});
