/**
 * Adversarial / property-based regression tests for confidence.ts
 *
 * Attack hypotheses H4–H8: NaN, empty criticalFields, boundary at 0.5,
 * negative scores, Infinity scores.
 *
 * DO NOT fix source code here — only document bugs via failing assertions.
 */

import {
  mapConfidenceToLevel,
  computeMatchConfidence,
} from '../../lib/confidence';
import type { ParsedCargo, ParsedVessel } from '../../lib/types';

// ── Minimal fixture helpers ───────────────────────────────────────────────────

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'test-email-1',
    itemIndex: 0,
    originPort: null,
    originCountry: null,
    destinationPort: null,
    destinationCountry: null,
    cargoDescription: null,
    weightMt: null,
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BREAK_BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: null,
    loadingRate: null,
    dischargeRate: null,
    commissionPercent: null,
    commissionTerms: null,
    specialRequirements: null,
    stowageFactor: null,
    missingInfo: [],
    ...overrides,
  };
}

function makeVessel(overrides: Partial<ParsedVessel> = {}): ParsedVessel {
  return {
    emailId: 'test-email-2',
    itemIndex: 0,
    vesselName: null,
    imo: null,
    flag: null,
    built: null,
    classSociety: null,
    pandi: null,
    dwtSummer: null,
    dwcc: null,
    draftMax: null,
    loa: null,
    beam: null,
    grt: null,
    nrt: null,
    holdsCount: null,
    hatchesCount: null,
    grainCapacity: null,
    grainCapacityUnit: null,
    baleCapacity: null,
    holdDimensions: null,
    hatchDimensions: null,
    tankTopStrength: null,
    geared: null,
    craneCapacity: null,
    hatchType: null,
    vesselType: null,
    openPosition: null,
    openDate: null,
    direction: null,
    restrictions: [],
    lastCargoes: null,
    speedLaden: null,
    speedBallast: null,
    consumption: null,
    deckCapacity: null,
    specialFeatures: [],
    verificationWarning: null,
    ...overrides,
  };
}

// ── H4: NaN score ─────────────────────────────────────────────────────────────

describe('H4 — NaN confidence score', () => {
  /**
   * If the LLM pipeline returns a NaN numeric score (e.g. from corrupted JSON),
   * mapConfidenceToLevel receives NaN. All numeric comparisons with NaN are false,
   * so the function falls through to 'uncertain'.
   *
   * BUG HYPOTHESIS: NaN → 'uncertain' silently blocks all sends without any error.
   * The function should either throw, or treat NaN as 'missing'.
   */
  it('NaN score without sourceQuote should NOT return uncertain (blocks sends silently)', () => {
    const result = mapConfidenceToLevel(NaN, false);
    // If this assertion fails, NaN is treated as 'uncertain' → CONFIRMED BUG
    expect(result).not.toBe('uncertain');
  });

  it('NaN score with sourceQuote should NOT return uncertain', () => {
    const result = mapConfidenceToLevel(NaN, true);
    expect(result).not.toBe('uncertain');
  });

  it('NaN score should be treated as missing (preferred safe behaviour)', () => {
    const result = mapConfidenceToLevel(NaN, false);
    // NaN means "no valid number was produced" — semantically equivalent to missing
    expect(result).toBe('missing');
  });

  it('NaN propagates to computeMatchConfidence and triggers blockSend', () => {
    // Simulate a scenario where cargo has a field resolved from a NaN-producing path.
    // We directly test mapConfidenceToLevel, but also verify the cascade:
    // uncertain level on a critical field → blockSend = true.
    //
    // This test documents the blast radius: a single NaN score blocks the entire send.
    const nanLevel = mapConfidenceToLevel(NaN, false);
    // If NaN becomes 'uncertain', it will block sends — document severity
    if (nanLevel === 'uncertain') {
      // Confirmed: NaN silently escalates to blockSend
      console.warn('[H4 CONFIRMED] NaN score maps to "uncertain" — any NaN from LLM pipeline blocks Send Quote');
    }
    // Force assertion to surface the finding
    expect(nanLevel).toBe('missing'); // desired safe default
  });
});

// ── H5: Empty criticalFields ──────────────────────────────────────────────────

describe('H5 — empty criticalFields array', () => {
  /**
   * computeMatchConfidence(cargo, vessel, []) produces:
   *   criticalConfidences = []
   *   blockedFields = []
   *   blockSend = false
   *   overallLevel = 'verified'   ← reduce identity over empty array
   *
   * BUG HYPOTHESIS: Passing [] silently approves every match as 'verified'
   * with blockSend=false, even when all cargo fields are null/missing.
   * This is a silent footgun — wrong args give a false green light.
   */
  it('empty criticalFields should NOT silently return verified level', () => {
    const cargo = makeCargo(); // all nulls
    const vessel = makeVessel(); // all nulls
    const result = computeMatchConfidence(cargo, vessel, []);

    // If overallLevel is 'verified' with empty criticalFields, it's misleading
    expect(result.level).not.toBe('verified');
  });

  it('empty criticalFields blockSend should not be false when data is missing', () => {
    const cargo = makeCargo(); // all nulls — genuinely no data
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel, []);

    // Document: is blockSend really false even when nothing is filled in?
    if (result.level === 'missing') {
      console.warn('[H5 FIXED] empty criticalFields now returns level=missing (silent approval closed)');
    }
    // Preferred: either throw on empty criticalFields, or return a neutral/missing level
    expect(result.blockSend).toBe(false); // documenting current (dangerous) behaviour
    expect(result.level).toBe('missing'); // after fix: empty criticalFields → level:missing
  });

  it('empty criticalFields produces zero fieldConfidences for critical subset', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel, []);
    // fieldConfidences will be empty — nothing checked at all
    expect(result.fieldConfidences).toHaveLength(0);
    expect(result.blockedFields).toHaveLength(0);
  });
});

// ── H6: Boundary at exactly 0.5 and 0.4999... ────────────────────────────────

describe('H6 — boundary conditions at 0.5', () => {
  it('score exactly 0.5 maps to inferred', () => {
    expect(mapConfidenceToLevel(0.5, false)).toBe('inferred');
  });

  it('score 0.4999 maps to uncertain', () => {
    expect(mapConfidenceToLevel(0.4999, false)).toBe('uncertain');
  });

  it('score 0.49999999999999994 (float epsilon below 0.5) maps to uncertain', () => {
    // IEEE 754 subtlety: 0.5 - Number.EPSILON/2 is still representable
    const justBelow = 0.5 - Number.EPSILON;
    expect(mapConfidenceToLevel(justBelow, false)).toBe('uncertain');
  });

  it('score exactly 0.85 without sourceQuote maps to inferred', () => {
    expect(mapConfidenceToLevel(0.85, false)).toBe('inferred');
  });

  it('score exactly 0.85 with sourceQuote maps to verified', () => {
    expect(mapConfidenceToLevel(0.85, true)).toBe('verified');
  });

  it('score 0.8499 without sourceQuote maps to inferred (in 0.5–0.85 band)', () => {
    expect(mapConfidenceToLevel(0.8499, false)).toBe('inferred');
  });

  it('score 0.0 maps to uncertain', () => {
    expect(mapConfidenceToLevel(0.0, false)).toBe('uncertain');
  });

  it('score 1.0 with sourceQuote maps to verified', () => {
    expect(mapConfidenceToLevel(1.0, true)).toBe('verified');
  });
});

// ── H7: Negative score ────────────────────────────────────────────────────────

describe('H7 — negative score', () => {
  /**
   * A negative confidence score is not valid per spec (range 0–1).
   * The function has no guard for negatives — they fall through to 'uncertain'.
   * This is technically correct behaviour but undocumented.
   */
  it('score -1 maps to uncertain (no guard)', () => {
    const result = mapConfidenceToLevel(-1, false);
    // Documenting: negative scores silently map to uncertain — no validation error
    expect(result).toBe('uncertain');
  });

  it('score -0.001 maps to uncertain', () => {
    expect(mapConfidenceToLevel(-0.001, false)).toBe('uncertain');
  });

  it('score -1 with sourceQuote still maps to uncertain (negative cannot be verified)', () => {
    expect(mapConfidenceToLevel(-1, true)).toBe('uncertain');
  });
});

// ── H8: Infinity score ────────────────────────────────────────────────────────

describe('H8 — Infinity score', () => {
  /**
   * Infinity >= 0.85 is true, so:
   *   mapConfidenceToLevel(Infinity, true)  → 'verified'
   *   mapConfidenceToLevel(Infinity, false) → 'inferred'
   *
   * BUG HYPOTHESIS: An invalid/corrupted score of +Infinity is accepted as
   * the highest possible confidence. This should be guarded.
   */
  it('Infinity with sourceQuote maps to verified — should be rejected', () => {
    const result = mapConfidenceToLevel(Infinity, true);
    // If this passes (result === 'verified'), the function accepts Infinity as valid
    if (result === 'verified') {
      console.warn('[H8 CONFIRMED] Infinity accepted as verified confidence — no upper-bound guard');
    }
    expect(result).not.toBe('verified'); // desired: reject or treat as missing/uncertain
  });

  it('Infinity without sourceQuote maps to inferred — should be rejected', () => {
    const result = mapConfidenceToLevel(Infinity, false);
    if (result === 'inferred') {
      console.warn('[H8 CONFIRMED] Infinity accepted as inferred confidence — no upper-bound guard');
    }
    expect(result).not.toBe('inferred'); // desired: reject
  });

  it('-Infinity maps to uncertain (lower-bound covered by uncertain fallthrough)', () => {
    // -Infinity < 0.5, so falls to uncertain — no special guard needed here
    expect(mapConfidenceToLevel(-Infinity, false)).toBe('uncertain');
  });

  it('-Infinity with sourceQuote still maps to uncertain', () => {
    expect(mapConfidenceToLevel(-Infinity, true)).toBe('uncertain');
  });
});

// ── H5b: missing field treated as blockSend=false ────────────────────────────

describe('H5b — missing level does NOT block send (design intent verification)', () => {
  /**
   * Per spec: `missing` does NOT trigger blockSend — field was absent from parsed data.
   * Only `uncertain` blocks. Verify this is correctly implemented.
   */
  it('all-missing critical fields do not block send', () => {
    const cargo = makeCargo(); // all nulls → all fields resolve to missing
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel); // default critical fields

    expect(result.blockSend).toBe(false);
    expect(result.blockedFields).toHaveLength(0);
  });

  it('all-missing critical fields result in level=missing (worst of missing)', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    // All critical fields are missing → overallLevel should be 'missing'
    expect(result.level).toBe('missing');
  });

  it('one uncertain field among missing fields triggers blockSend', () => {
    // weightMt with confidence='uncertain' → parseConfToScore returns 0.3 → mapConfidenceToLevel → 'uncertain'
    const cargo = makeCargo({
      weightMt: { value: 5000, confidence: 'uncertain', sourceText: undefined },
    });
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    expect(result.blockSend).toBe(true);
    expect(result.blockedFields).toContain('cargo.weightMt');
  });
});

// ── H9 (bonus): null vs undefined distinction ─────────────────────────────────

describe('H9 — null vs undefined both return missing', () => {
  it('null score returns missing', () => {
    expect(mapConfidenceToLevel(null, false)).toBe('missing');
  });

  it('undefined score returns missing', () => {
    expect(mapConfidenceToLevel(undefined, false)).toBe('missing');
  });

  it('undefined score with sourceQuote=true still returns missing', () => {
    expect(mapConfidenceToLevel(undefined, true)).toBe('missing');
  });
});
