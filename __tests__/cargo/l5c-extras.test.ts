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

  it('uppercase + whitespace: " GENERAL CARGO " → wheat: compatible', () => {
    const r = checkCompatibility([' GENERAL CARGO '], 'wheat');
    expect(r.compatible).toBe(true);
  });

  // SAFETY: "general cargo" sometimes means "we don't know what was loaded
  // before". For combos with KNOWN hazardous cargoes (coal, scrap, petcoke,
  // sulphur, cement, DRI) we MUST default to manual_review (fail-CLOSED),
  // not auto-pass. Adversarial QA round 2 caught the original universal
  // wildcards green-lighting petcoke↔general and coal↔general.
  describe('safety: general↔hazardous defaults to manual_review (fail-CLOSED)', () => {
    // Note: general↔cement and general↔DRI are NOT in this list because
    // both targets have direct *→X extra_clean wildcards — they correctly
    // surface compatible:true + extra_clean hint (surveyor warning is
    // delivered via the hint, not as a hard block). Adversarial QA
    // explicitly marked those two as acceptable.
    it.each([
      ['general cargo', 'coal'],
      ['general cargo', 'scrap'],
      ['general cargo', 'petcoke'],
      ['general cargo', 'sulphur'],
      ['coal', 'general cargo'],
      ['petcoke', 'general cargo'],
      ['scrap', 'general cargo'],
    ])('%s → %s: requires_manual_review (no curated allow-list entry)', (prev, next) => {
      const r = checkCompatibility([prev], next);
      expect(r.compatible).toBe(false);
      expect(r.requires_manual_review).toBe(true);
      expect(r.blocking_pairs).toHaveLength(1);
      expect(r.blocking_pairs[0].reason).toMatch(/manual\s+surveyor/i);
    });

    // For cement/DRI: surveyor warning travels via extra_clean wildcards.
    it.each([
      ['general cargo', 'cement'],
      ['general cargo', 'DRI'],
    ])('%s → %s: compatible with extra_clean hint (wildcard surfaces surveyor requirement)', (prev, next) => {
      const r = checkCompatibility([prev], next);
      expect(r.compatible).toBe(true);
      expect(r.requires_extra_clean).toBe(true);
    });
  });
});

describe('wave-γ-cleanup-A: normalize() edge-case forgiveness', () => {
  it('matches petroleum-coke (dash) → petcoke alias', () => {
    // petroleum-coke should normalize to "petroleum coke" → ALIAS_MAP → "petcoke"
    // petcoke ↔ wheat is incompatible (known pair), so compatible=false with a reason —
    // but requires_manual_review MUST be false (it matched, not unmatched).
    const r = checkCompatibility(['petroleum-coke'], 'wheat');
    expect(r.requires_manual_review).toBe(false);
    expect(r.compatible).toBe(false); // petcoke→wheat is known incompatible
    expect(r.blocking_pairs.length).toBeGreaterThan(0);
    expect(r.blocking_pairs[0].reason).not.toMatch(/manual\s+surveyor/i);
  });

  it('matches "pet  coke" (double space) → petcoke alias', () => {
    // "pet  coke" collapses to "pet coke" → ALIAS_MAP → "petcoke"
    const r = checkCompatibility(['pet  coke'], 'wheat');
    expect(r.requires_manual_review).toBe(false);
    expect(r.compatible).toBe(false); // petcoke→wheat is known incompatible
    expect(r.blocking_pairs[0].reason).not.toMatch(/manual\s+surveyor/i);
  });

  it('matches "petcoke." (trailing dot) → petcoke', () => {
    // "petcoke." strips trailing dot → "petcoke" → ALIAS_MAP → "petcoke"
    const r = checkCompatibility(['petcoke.'], 'wheat');
    expect(r.requires_manual_review).toBe(false);
    expect(r.compatible).toBe(false); // petcoke→wheat is known incompatible
    expect(r.blocking_pairs[0].reason).not.toMatch(/manual\s+surveyor/i);
  });

  it('matches "  general  cargo  " (whitespace + collapsed) → general taxonomy', () => {
    // "  general  cargo  " trims + collapses → "general cargo" → ALIAS_MAP → "general"
    // general cargo → project pipes is compatible (permissive class, inert)
    const r = checkCompatibility(['  general  cargo  '], 'project pipes');
    expect(r.requires_manual_review).toBe(false);
    expect(r.compatible).toBe(true);
    expect(r.blocking_pairs).toHaveLength(0);
  });
});
