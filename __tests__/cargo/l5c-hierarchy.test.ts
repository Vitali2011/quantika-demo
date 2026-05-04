/**
 * wave-γ-2: L5C taxonomy + symmetric wildcard + BREAK_BULK contamination.
 *
 * Closes 3 retest #3 bugs (REGRESSION-01, REGRESSION-02, BUG-12) +
 * IMSBC skeleton coverage. Positive contract assertions per Class 12
 * (audit 2026-05-03 hardened skill).
 */
import { checkCompatibility } from '@/lib/cargo/l5c-matrix';

describe('wave-γ-2: B2 hierarchy aliases (REGRESSION-02 fix)', () => {
  // Variants of "steel" (parent) should resolve to the existing steel→pipes rule.
  it('steel coils → project pipes: compatible via parent steel→pipes', () => {
    const r = checkCompatibility(['steel coils'], 'project pipes');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(false);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs).toHaveLength(0);
  });

  it('hr coils → drill pipes: compatible via parent steel→pipes', () => {
    const r = checkCompatibility(['hr coils'], 'drill pipes');
    expect(r.compatible).toBe(true);
    expect(r.requires_manual_review).toBe(false);
  });

  it('rebar → linepipe: compatible via parent steel→pipes', () => {
    const r = checkCompatibility(['rebar'], 'linepipe');
    expect(r.compatible).toBe(true);
  });

  it('grain children resolve to parent: maize → rice OK (grain→grain)', () => {
    const r = checkCompatibility(['maize'], 'rice');
    expect(r.compatible).toBe(true);
    expect(r.blocking_pairs).toHaveLength(0);
  });

  it('coal variants: thermal coal → wheat blocked (coal→grain via taxonomy)', () => {
    const r = checkCompatibility(['thermal coal'], 'wheat');
    expect(r.compatible).toBe(false);
    expect(r.blocking_pairs[0].reason).toMatch(/black|residue/i);
  });

  it('iron-ore variants: pellet feed → barley extra_clean:true', () => {
    const r = checkCompatibility(['pellet feed'], 'barley');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });
});

describe('wave-γ-2: C1 symmetric wildcard (BUG-12 fix)', () => {
  // `*→DRI extra_clean:true` (DRI dust-prone) applies symmetrically.

  it('DRI → grain: incompatible AND requires_extra_clean:true (symmetric *→DRI rule)', () => {
    const r = checkCompatibility(['DRI'], 'grain');
    expect(r.compatible).toBe(false); // exact match precedence
    expect(r.requires_extra_clean).toBe(true); // symmetric wildcard contributes the flag
    expect(r.blocking_pairs[0].reason).toMatch(/iron\s+oxide/i);
  });

  it('DRI → corn (alias for grain): same contract — incompatible + extra_clean:true', () => {
    const r = checkCompatibility(['DRI'], 'corn');
    expect(r.compatible).toBe(false);
    expect(r.requires_extra_clean).toBe(true);
  });

  it('hbi → wheat (DRI alias + grain alias): same as DRI→grain', () => {
    const r = checkCompatibility(['hbi'], 'wheat');
    expect(r.compatible).toBe(false);
    expect(r.requires_extra_clean).toBe(true);
  });

  it('DRI → bauxite (no exact rule): inverted wildcard contributes extra_clean hint, but verdict requires manual surveyor review (NOT auto-compatible)', () => {
    // Wave-γ-2 fix: `*→DRI` inverted gives extra_clean hint only. Without
    // direct data we MUST not auto-pass; surveyor reviews.
    const r = checkCompatibility(['DRI'], 'bauxite');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
    expect(r.blocking_pairs).toHaveLength(1);
    expect(r.blocking_pairs[0].reason).toMatch(/manual\s+surveyor/i);
  });

  it('cement symmetric: anything → cement requires extra_clean (direct *→cement wildcard, not inversion)', () => {
    const r = checkCompatibility(['scrap'], 'cement');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });

  it('cement → bauxite (no exact rule): inverted wildcard contributes extra_clean hint, NOT auto-pass', () => {
    // Wave-γ-2 fix: `*→cement` inverted to cement→* — extra_clean hint only.
    // No direct data → manual surveyor review.
    const r = checkCompatibility(['cement'], 'bauxite');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });

  // SAFETY: inverted wildcards must NEVER make a pair auto-compatible.
  // Adversarial QA (wave-γ-2 retest) found that *→DRI/*→cement inversion
  // was treated as DRI→*/cement→* compatible:true — fail-OPEN safety bug.
  describe('safety: inverted wildcards never fail-open', () => {
    it.each([
      ['DRI', 'scrap'],
      ['DRI', 'pipes'],
      ['DRI', 'sulphur'],
      ['cement', 'pipes'],
      ['cement', 'sulphur'],
      ['cement', 'iron-ore'],
    ])('%s → %s: requires manual review (not auto-compatible from inverted *→X)', (prev, next) => {
      const r = checkCompatibility([prev], next);
      expect(r.compatible).toBe(false);
      expect(r.requires_manual_review).toBe(true);
      // The wildcard hint about extra clean still travels for surveyor info.
      expect(r.requires_extra_clean).toBe(true);
    });
  });
});

describe('wave-γ-2: petcoke aliases (Class 6 substring trap fix)', () => {
  // IMSBC canonical name is "petroleum coke"; brokers also write "pet coke".
  it('petroleum coke → wheat: incompatible via petcoke alias', () => {
    const r = checkCompatibility(['petroleum coke'], 'wheat');
    expect(r.compatible).toBe(false);
    expect(r.requires_manual_review).toBe(false);
    expect(r.blocking_pairs[0].reason).toMatch(/carbon|residue/i);
  });

  it('pet coke → grain: incompatible via petcoke alias', () => {
    const r = checkCompatibility(['pet coke'], 'corn');
    expect(r.compatible).toBe(false);
    expect(r.blocking_pairs[0].reason).toMatch(/carbon|residue/i);
  });

  it('PETROLEUM COKE (uppercase) → wheat: same — case-insensitive normalize', () => {
    const r = checkCompatibility(['PETROLEUM COKE'], 'WHEAT');
    expect(r.compatible).toBe(false);
    expect(r.blocking_pairs[0].reason).toMatch(/carbon|residue/i);
  });
});

describe('wave-γ-2: BREAK_BULK hyphen variant (Class 6)', () => {
  it('"wheat-in-bags" (hyphenated) detected as break_bulk + contamination check applied', () => {
    const r = checkCompatibility(['coal'], 'wheat-in-bags');
    expect(r.compatible).toBe(false);
    expect(r.break_bulk).toBe(true);
    expect(r.blocking_pairs[0].reason).toMatch(/black|coal|residue/i);
  });

  it('"barley-in-bags" with limestone: compatible + extra_clean + break_bulk', () => {
    const r = checkCompatibility(['limestone'], 'barley-in-bags');
    expect(r.compatible).toBe(true);
    expect(r.break_bulk).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });
});

describe('wave-γ-2: BREAK_BULK contamination (REGRESSION-01 fix)', () => {
  it('coal → "wheat in bags": fails contamination check, break_bulk:true is metadata only', () => {
    const r = checkCompatibility(['coal'], 'wheat in bags');
    expect(r.compatible).toBe(false);
    expect(r.break_bulk).toBe(true);
    expect(r.blocking_pairs).toHaveLength(1);
    expect(r.blocking_pairs[0].reason).toMatch(/black|coal/i);
    // Surveyor metadata still surfaced.
    expect(r.warnings.some((w) => /BREAK_BULK/i.test(w))).toBe(true);
  });

  it('DRI → "rice in bags": incompatible (food-grade rejected) + break_bulk + extra_clean', () => {
    const r = checkCompatibility(['DRI'], 'rice in bags');
    expect(r.compatible).toBe(false);
    expect(r.break_bulk).toBe(true);
    expect(r.requires_extra_clean).toBe(true); // symmetric *→DRI flag
    expect(r.blocking_pairs[0].reason).toMatch(/iron\s+oxide/i);
  });

  it('limestone → "barley in bags": compatible with extra_clean + break_bulk metadata', () => {
    const r = checkCompatibility(['limestone'], 'barley in bags');
    expect(r.compatible).toBe(true);
    expect(r.break_bulk).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });

  it('explicit form=bag overrides string detection — same contamination semantics', () => {
    const r = checkCompatibility(['coal'], { name: 'wheat', form: 'bag' });
    expect(r.compatible).toBe(false);
    expect(r.break_bulk).toBe(true);
    expect(r.blocking_pairs[0].reason).toMatch(/black|coal/i);
  });

  it('empty prevs + bag: compatible with break_bulk metadata only', () => {
    const r = checkCompatibility([], 'wheat in bags');
    expect(r.compatible).toBe(true);
    expect(r.break_bulk).toBe(true);
    expect(r.blocking_pairs).toHaveLength(0);
  });
});

describe('wave-γ-2: IMSBC skeleton — additional reference pairs', () => {
  it('cement → grain: incompatible (alkalinity)', () => {
    const r = checkCompatibility(['cement'], 'wheat');
    expect(r.compatible).toBe(false);
    expect(r.blocking_pairs[0].reason).toMatch(/alkalinity|dust/i);
  });

  it('sulphur → steel coils: incompatible (corrosion via taxonomy)', () => {
    const r = checkCompatibility(['sulphur'], 'steel coils');
    expect(r.compatible).toBe(false);
    expect(r.blocking_pairs[0].reason).toMatch(/sulphur|acid|corro/i);
  });

  it('sulphur (alias sulfur) → grain: incompatible', () => {
    const r = checkCompatibility(['sulfur'], 'wheat');
    expect(r.compatible).toBe(false);
  });

  it('limestone → grain: compatible with extra_clean', () => {
    const r = checkCompatibility(['limestone'], 'wheat');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });

  it('phosphate → grain: incompatible (food-grade rejected)', () => {
    const r = checkCompatibility(['phosphate'], 'wheat');
    expect(r.compatible).toBe(false);
  });

  it('manganese ore → grain: compatible with extra_clean', () => {
    const r = checkCompatibility(['manganese ore'], 'rice');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });

  it('grain → steel coils: compatible no extra_clean (taxonomy resolves both)', () => {
    const r = checkCompatibility(['wheat'], 'steel coils');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(false);
  });

  it('steel → grain: compatible with extra_clean (mill scale + rust)', () => {
    const r = checkCompatibility(['steel'], 'wheat');
    expect(r.compatible).toBe(true);
    expect(r.requires_extra_clean).toBe(true);
  });
});
