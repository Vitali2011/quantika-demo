/**
 * Behavioral tests for the cargo-weight hard-filter gate (#792).
 *
 * Closes the #792 symptom: SEAGULL 2 (DWT 2570) showed "Possible" for a
 * 3000 mt corn cargo. Root cause was a chain in the weight-extraction path
 * (#791) — once weight resolves at the gate boundary, this gate hard-rejects
 * infeasible pairs.
 */
import { checkCargoWeight } from '../match-filters';

describe('checkCargoWeight — #792 overload gate', () => {
  it('hard-rejects 3000 mt corn vs DWT 2570 (no DWCC)', () => {
    // capacity = 2570 × 0.90 = 2313; capacityWithMargin = 2313 × 1.05 = 2429
    // 3000 > 2429 → fail
    const r = checkCargoWeight({ weightMt: 3000, dwtSummer: 2570, dwcc: null });
    expect(r.pass).toBe(false);
    expect(r.reason ?? '').toMatch(/exceeds vessel capacity/i);
  });

  it('hard-rejects range cargo at upper bound vs DWT 4000', () => {
    // capacity = 4000 × 0.90 = 3600; capacityWithMargin = 3780
    // 4800 > 3780 → fail
    const r = checkCargoWeight({
      weightMt: { min: 4000, max: 4800 },
      dwtSummer: 4000,
      dwcc: null,
    });
    expect(r.pass).toBe(false);
  });

  it('passes a 3000 mt cargo on a 4000 DWCC vessel (within tolerance)', () => {
    // capacity = 4000; capacityWithMargin = 4200; 3000 ≤ 4200 → pass
    const r = checkCargoWeight({ weightMt: 3000, dwtSummer: null, dwcc: 4000 });
    expect(r.pass).toBe(true);
  });

  it('graceful-passes when cargo weight is null (existing invariant for unknown weight)', () => {
    const r = checkCargoWeight({ weightMt: null, dwtSummer: 2570, dwcc: null });
    expect(r.pass).toBe(true);
  });

  it('graceful-passes when DWT and DWCC both null (vessel capacity unknown)', () => {
    const r = checkCargoWeight({ weightMt: 3000, dwtSummer: null, dwcc: null });
    expect(r.pass).toBe(true);
  });

  it('prefers DWCC over DWT when both are present', () => {
    // DWCC 2800: capacityWithMargin = 2800 × 1.05 = 2940. 3000 > 2940 → fail.
    // If it used DWT 5000 instead: capacity = 5000 × 0.90 × 1.05 = 4725 → would pass.
    const r = checkCargoWeight({ weightMt: 3000, dwtSummer: 5000, dwcc: 2800 });
    expect(r.pass).toBe(false);
    expect(r.reason ?? '').toMatch(/DWCC/);
  });

  it('range cargo at lower bound passes when upper bound also passes', () => {
    // {3000, 3200} vs DWCC 4000: 3200 ≤ 4200 → pass
    const r = checkCargoWeight({
      weightMt: { min: 3000, max: 3200 },
      dwtSummer: null,
      dwcc: 4000,
    });
    expect(r.pass).toBe(true);
  });
});
