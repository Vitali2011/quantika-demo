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

  // Test 4: wheat in bags — BREAK_BULK pathway, different verdict from bulk
  it('wheat in bags: verdict differs from bulk wheat (form-detection)', () => {
    const rBulk = checkCompatibility(['coal'], { name: 'wheat', form: 'bulk' });
    const rBag = checkCompatibility(['coal'], { name: 'wheat', form: 'bag' });
    // bulk wheat → normalized to grain → incompatible with coal
    expect(rBulk.compatible).toBe(false);
    // bagged wheat → BREAK_BULK pathway, different result
    expect(rBag.compatible).not.toBe(rBulk.compatible);
    // bag form should trigger manual review (not in matrix as breakbulk) OR be explicitly allowed
    // The verdicts must differ — form-detection is demonstrable
    expect(rBag.compatible === rBulk.compatible).toBe(false);
  });

  it('wheat in bags via name string: "wheat in bags" triggers BREAK_BULK pathway', () => {
    const rBulk = checkCompatibility(['coal'], 'wheat');
    const rBags = checkCompatibility(['coal'], 'wheat in bags');
    // "wheat" normalizes to grain — incompatible with coal
    expect(rBulk.compatible).toBe(false);
    // "wheat in bags" is break_bulk — different verdict
    expect(rBags.compatible).not.toBe(rBulk.compatible);
  });

  // Test 5: edge — unknown pair preserved as fail-closed
  it('unknown pair "uranium" → "plutonium": requires_manual_review:true (fail-closed preserved)', () => {
    const r = checkCompatibility(['uranium'], 'plutonium');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.blocking_pairs).toHaveLength(1);
  });
});
