/**
 * wave-γ-3 Tasks 1+2:
 *
 *   Task 1 — incompatible+dust pairs gain `extra_clean:true` so surveyor
 *   override scenarios still warn about hospital-clean requirements.
 *
 *   Task 2 — "general cargo" is a permissive class (inert, varied) that
 *   should not block compatibility with anything; alias variants
 *   ("mixed cargo", "misc") resolve via TAXONOMY.
 */

import { checkCompatibility } from '@/lib/cargo/l5c-matrix';

describe('wave-γ-3 Task 1: extra_clean=true on incompatible+dust pairs', () => {
  // Each row: [previous, next, expectedReasonRegex]
  const pairs: Array<[string, string, RegExp]> = [
    ['petcoke', 'wheat', /carbon|residue/i],
    ['coal', 'wheat', /black|residue/i],
    ['scrap', 'wheat', /sharp|ferrous|residue/i],
    ['sulphur', 'wheat', /sulphur|residue/i],
    ['sulphur', 'steel coils', /sulphur|acid|corro/i],
    ['fertilizer', 'wheat', /cross-contamination|food/i],
    ['copper concentrate', 'wheat', /heavy.metal/i],
    ['scrap', 'sugar', /sharp|residue/i],
    ['phosphate', 'wheat', /phosphate|food|radia/i],
    ['cement', 'wheat', /alkalinity|dust/i],
  ];

  it.each(pairs)(
    '%s → %s: incompatible AND requires_extra_clean (broker-override hospital-clean hint)',
    (prev, next, reasonRe) => {
      const r = checkCompatibility([prev], next);
      expect(r.compatible).toBe(false);
      expect(r.requires_extra_clean).toBe(true);
      expect(r.blocking_pairs).toHaveLength(1);
      expect(r.blocking_pairs[0].reason).toMatch(reasonRe);
    },
  );
});

describe('wave-γ-3 Task 2: "general cargo" permissive class', () => {
  it('general cargo → project pipes: compatible (inert/varied, no presumed contamination)', () => {
    const r = checkCompatibility(['general cargo'], 'project pipes');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs).toHaveLength(0);
  });

  it('general cargo → wheat: compatible', () => {
    const r = checkCompatibility(['general cargo'], 'wheat');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
  });

  it('steel coils → general cargo: compatible (symmetric)', () => {
    const r = checkCompatibility(['steel coils'], 'general cargo');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
  });

  it('alias "mixed cargo" → wheat: compatible via TAXONOMY', () => {
    const r = checkCompatibility(['mixed cargo'], 'wheat');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
  });

  it('alias "misc" → DRI: compatible (wildcard *→general inverted is permissive)', () => {
    const r = checkCompatibility(['misc'], 'DRI');
    expect(r.compatible).toBe(true);
    // DRI wildcard hint travels — extra clean still required.
    expect(r.requires_extra_clean).toBe(true);
  });

  it('uppercase + whitespace: " GENERAL CARGO " → wheat: compatible', () => {
    const r = checkCompatibility([' GENERAL CARGO '], 'wheat');
    expect(r.compatible).toBe(true);
  });
});
