/**
 * Agent B — Adversarial QA Phase 3
 * ATTACK-5: ETS calculator — hostile HTML input, NaN inputs
 * ATTACK-6: War-risk — NaN inputs, Constanta false-positive, Bab al-Mandeb, hyphen ports
 * ATTACK-9: Confidence engine — -Infinity, empty sourceText, unknown criticalFields
 *
 * DO NOT edit feature code. Document bugs via failing assertions.
 */

import { calculateEuEts } from '@/lib/economics/ets';
import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import { mapConfidenceToLevel, computeMatchConfidence } from '@/lib/confidence';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'test-b',
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
    emailId: 'test-b',
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

// ============================================================================
// ATTACK-5: ETS Calculator — hostile HTML input, NaN inputs
// ============================================================================

describe('ATTACK-5 — ETS: NaN and boundary inputs', () => {

  // A5-1: fetchEuaPrice is async/network — we test the downstream concern:
  // if fetchEuaPrice returns NaN (parse fails on unexpected HTML format),
  // does calculateEuEts(legs, NaN) return NaN, Infinity, or throw?
  it('A5-1: calculateEuEts with euaPrice=NaN — guard must not pass NaN through', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: NaN,
    });
    // NaN <= 0 is false in JS → guard does NOT catch NaN
    // amount = 100 * 3.114 * 0.5 * NaN = NaN
    // Bug: amountEur=NaN, applicable=false (NaN > 0 is false)
    expect(Number.isNaN(result.amountEur)).toBe(false);
    expect(result.amountEur).toBe(0);
  });

  it('A5-2: calculateEuEts with euaPrice=NaN — applicable must not be NaN or corrupt', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: NaN,
    });
    // applicable = (NaN > 0) = false — this is accidentally "correct" but amountEur=NaN leaks
    expect(typeof result.applicable).toBe('boolean');
  });

  it('A5-3: euaPrice=0 → amountEur=0, applicable=false (guard covers this)', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: 0,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('A5-4: euaPrice=-50 → guard (euaPrice <= 0) catches it → amountEur=0', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: -50,
    });
    expect(result.amountEur).toBe(0);
    expect(result.applicable).toBe(false);
  });

  it('A5-5: distanceNm=NaN — guard (distanceNm <= 0) does NOT catch NaN, may propagate', () => {
    const result = calculateEuEts({
      distanceNm: NaN,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    // NaN <= 0 is false → guard does not fire → amount = 100 * 3.114 * 0.5 * 87.5 = valid (distanceNm unused in formula)
    // Actually distanceNm is not used in the multiplication formula! Only guard-checked.
    // So result may be a valid number despite NaN distanceNm — document the semantics.
    expect(Number.isNaN(result.amountEur)).toBe(false);
  });

  it('A5-6: vlsfoBurnMt=NaN — guard (vlsfoBurnMt <= 0) does NOT catch NaN', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: NaN,
      euaPrice: 87.5,
    });
    // NaN <= 0 is false → guard passes → amount = NaN * 3.114 * 0.5 * 87.5 = NaN
    // Bug: returns amountEur=NaN silently
    expect(Number.isNaN(result.amountEur)).toBe(false);
    expect(result.amountEur).toBe(0);
  });

  it('A5-7: euLegPercent=NaN — guard (euLegPercent <= 0) does NOT catch NaN', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: NaN,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    // NaN <= 0 is false, NaN > 1 is false → guard bypassed → amount = 100 * 3.114 * NaN * 87.5 = NaN
    expect(Number.isNaN(result.amountEur)).toBe(false);
    expect(result.amountEur).toBe(0);
  });

  it('A5-8: euaPrice=Infinity → not guarded (Infinity > 0 is true) → amountEur=Infinity', () => {
    const result = calculateEuEts({
      distanceNm: 1000,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: Infinity,
    });
    // amount = 100 * 3.114 * 0.5 * Infinity = Infinity
    // Math.round(Infinity * 100) / 100 = Infinity
    expect(Number.isFinite(result.amountEur)).toBe(true);
  });

  it('A5-9: all params valid, distanceNm=0 → guard fires → {0, false}', () => {
    const result = calculateEuEts({
      distanceNm: 0,
      euLegPercent: 0.5,
      vlsfoBurnMt: 100,
      euaPrice: 87.5,
    });
    expect(result).toEqual({ amountEur: 0, applicable: false });
  });

  // A5-10: fetchEuaPrice HTML injection — if hostile price element contains script tags,
  // parseFloat('<script>alert(1)</script>') = NaN, which falls through to fallback.
  // We test the fallback path: when HTML parse yields NaN, the function returns FALLBACK_EUA_PRICE.
  // This is indirectly tested by checking that the module exports a fallback for failed parse.
  it('A5-10: parseFloat of hostile HTML string returns NaN (not a code execution risk)', () => {
    // This confirms parseFloat behavior used by fetchEuaPrice
    const hostile = '<script>alert(1)</script>';
    expect(Number.isNaN(parseFloat(hostile))).toBe(true);
    // The fetchEuaPrice regex would not match this, so it falls back to FALLBACK_EUA_PRICE (87.5)
    // No XSS risk in a server-side fetch; parseFloat is safe.
  });
});

// ============================================================================
// ATTACK-6: War-risk — NaN inputs, Constanta, Bab al-Mandeb gap, hyphen ports
// ============================================================================

describe('ATTACK-6 — War-risk: NaN, Constanta, Bab al-Mandeb, hyphen ports', () => {

  // A6-1: daysInHra=NaN — guard (daysInHra <= 0) does NOT catch NaN
  it('A6-1: daysInHra=NaN — should return {0, []} not NaN premium', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: NaN,
    });
    // NaN <= 0 is false → guard bypassed → premiumUsd = 10M * rate * NaN = NaN
    // Bug: premiumUsd=NaN silently
    expect(Number.isNaN(result.premiumUsd)).toBe(false);
    expect(result.premiumUsd).toBeGreaterThanOrEqual(0);
  });

  // A6-2: vesselValueUsd=NaN — no guard (only checks < 0, NaN < 0 is false)
  it('A6-2: vesselValueUsd=NaN — should return {0, []} not NaN premium', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: NaN,
      daysInHra: 5,
    });
    // NaN < 0 is false → passes guard → premium = NaN * rate * 5 = NaN
    expect(Number.isNaN(result.premiumUsd)).toBe(false);
    expect(result.premiumUsd).toBeGreaterThanOrEqual(0);
  });

  // A6-3: both NaN
  it('A6-3: daysInHra=NaN, vesselValueUsd=NaN → premium should be 0 or throw, NOT NaN', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: NaN,
      daysInHra: NaN,
    });
    expect(Number.isNaN(result.premiumUsd)).toBe(false);
  });

  // A6-4: vesselValueUsd=0 — code uses industry fallback $8M (spec-betafix-04).
  // Zero vessel value treated as missing data → fallback prevents 0-premium on known HRA route.
  it('A6-4: vesselValueUsd=0 → fallback $8M used, zone matched, premium > 0', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: 0,
      daysInHra: 5,
    });
    // fallback 8_000_000 * 0.005 (GoG live JWC 0.50%) = 40_000
    expect(result.premiumUsd).toBe(40000);
    expect(result.zones).toContain('Gulf of Guinea HRA');
  });

  // A6-5: vesselValueUsd=-1M — negative value uses fallback $8M, zones still matched.
  // Guard ensures non-negative premium; zones are determined by port, not vessel value.
  it('A6-5: vesselValueUsd=-1M → fallback used, premiumUsd > 0, zone matched', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: -1_000_000,
      daysInHra: 5,
    });
    expect(result.premiumUsd).toBeGreaterThan(0);
    expect(result.zones).toContain('Gulf of Guinea HRA');
  });

  // A6-6: Constanta — this is INTENTIONALLY in the Black Sea HRA zone list
  // The war-risk module explicitly lists 'constanta' under "Black Sea Russia/Ukraine HRA"
  // because during 2022-2025 Black Sea conflict, Constanta was a major transshipment point
  // for Ukrainian grain under NATO escort. The test documents that this IS a deliberate design choice.
  it('A6-6: Port "Constanta" IS listed in Black Sea HRA — design intent verification', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Constanta', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    // Constanta is explicitly in ports list for Black Sea HRA
    // This is intentional — document the design choice
    expect(result.zones).toContain('Black Sea Russia/Ukraine HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  // A6-7: "constanta" lowercase — same match (function lowercases input)
  it('A6-7: Port "constanta" (lowercase) matches Black Sea HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'constanta', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    expect(result.zones).toContain('Black Sea Russia/Ukraine HRA');
  });

  // A6-8: "Constantza" — alternate spelling NOT in ports list
  it('A6-8: Port "Constantza" (alternate spelling) should NOT match Black Sea HRA (not in list)', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Constantza', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    // 'constantza' does NOT include 'constanta' (different string), \b regex won't match
    // This is a gap: an operator might type "Constantza" and get no HRA detection
    expect(result.zones).toHaveLength(0);
  });

  // A6-9: Bab al-Mandeb — Aden as origin (in Red Sea/Bab al-Mandeb HRA port list)
  it('A6-9: fromPort="Aden" correctly triggers Red Sea/Bab al-Mandeb HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
    expect(result.premiumUsd).toBeGreaterThan(0);
  });

  // A6-10: Djibouti as destination — in Red Sea HRA list
  it('A6-10: toPort="Djibouti" correctly triggers Red Sea/Bab al-Mandeb HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Rotterdam', toPort: 'Djibouti' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    expect(result.zones).toContain('Red Sea / Bab al-Mandeb HRA');
  });

  // A6-11: Aden→Djibouti route (both in Red Sea HRA) — zone matched once only
  it('A6-11: from=Aden to=Djibouti (both Red Sea HRA ports) charges once, not doubled', () => {
    const bothPorts = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Djibouti' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    const singlePort = calculateWarRiskPremium({
      route: { fromPort: 'Aden', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    expect(bothPorts.premiumUsd).toBe(singlePort.premiumUsd);
    expect(bothPorts.zones.filter(z => z === 'Red Sea / Bab al-Mandeb HRA')).toHaveLength(1);
  });

  // A6-12: Port with hyphen "Um-Qasr" — regex uses \b word boundary
  // "um-qasr".toLowerCase() = "um-qasr"
  // Ports list does not include "um-qasr" or "umqasr" — but let's check if hyphenated
  // ports that ARE in the list (e.g. "dar es salaam") work
  it('A6-12: Port "Dar Es Salaam" (with spaces) matches Indian Ocean HRA', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Dar Es Salaam', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    });
    // 'dar es salaam' with \b regex should match
    expect(result.zones).toContain('Indian Ocean / Somali Corridor HRA');
  });

  // A6-13: "Um-Qasr" (Iraq port) — NOT in any HRA zone list → no premium
  // But the attack tests whether hyphens break matching when the port IS listed
  // We test a fabricated hyphen variant of a listed port: "tin-can" vs "tin can"
  it('A6-13: Port "Tin-Can" (hyphen variant of "Tin Can" in Gulf of Guinea list) — may miss detection', () => {
    const withHyphen = calculateWarRiskPremium({
      route: { fromPort: 'Tin-Can', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    const withSpace = calculateWarRiskPremium({
      route: { fromPort: 'Tin Can', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: 3,
    });
    // "tin can" with regex \btin can\b — 'tin-can' lowercased = 'tin-can'
    // 'tin-can'.test(/\btin can\b/) = false because hyphen ≠ space
    // Potential gap: hyphenated port misses detection
    if (withHyphen.premiumUsd === 0 && withSpace.premiumUsd > 0) {
      console.warn('[A6-13 GAP] "Tin-Can" (hyphen) misses Gulf of Guinea HRA detection; "Tin Can" (space) matches');
    }
    // Document: we expect hyphenated form to match if port is real
    // This test asserts the gap IS a bug if it exists
    expect(withHyphen.zones).toEqual(withSpace.zones);
  });

  // A6-14: empty port strings — should not throw
  it('A6-14: empty fromPort and toPort do not crash', () => {
    expect(() => calculateWarRiskPremium({
      route: { fromPort: '', toPort: '' },
      vesselValueUsd: 10_000_000,
      daysInHra: 5,
    })).not.toThrow();
  });

  // A6-15: daysInHra=Infinity — not guarded (Infinity <= 0 is false)
  it('A6-15: daysInHra=Infinity → premiumUsd should be finite, not Infinity', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Rotterdam' },
      vesselValueUsd: 10_000_000,
      daysInHra: Infinity,
    });
    // premium = 10M * rate * Infinity = Infinity
    expect(Number.isFinite(result.premiumUsd)).toBe(true);
  });
});

// ============================================================================
// ATTACK-9: Confidence engine — -Infinity, empty sourceText, unknown criticalFields
// ============================================================================

describe('ATTACK-9 — Confidence: -Infinity, empty sourceText, unknown fields, boundaries', () => {

  // A9-1: -Infinity score — already guarded in confidence.ts line 39?
  // Code: if score === null || undefined || isNaN || === Infinity → 'missing'
  // Note: only +Infinity is checked, NOT -Infinity
  it('A9-1: mapConfidenceToLevel(-Infinity) — not in explicit guard, falls to uncertain', () => {
    const result = mapConfidenceToLevel(-Infinity, false);
    // -Infinity < 0.5 → falls to 'uncertain' (not 'missing')
    // The guard only checks === Infinity (positive), not -Infinity
    // -Infinity should map to 'missing' (invalid input), not 'uncertain' (which blocks sends)
    if (result === 'uncertain') {
      console.warn('[A9-1 BUG] -Infinity maps to "uncertain", should be "missing". Blocks send silently.');
    }
    expect(result).toBe('missing');
  });

  // A9-2: +Infinity — code explicitly guards: score === Infinity → 'missing'
  it('A9-2: mapConfidenceToLevel(Infinity) → "missing" (explicit guard in code)', () => {
    expect(mapConfidenceToLevel(Infinity, false)).toBe('missing');
  });

  // A9-3: +Infinity with sourceQuote — still guarded → 'missing'
  it('A9-3: mapConfidenceToLevel(Infinity, true) → "missing" (guard before sourceQuote check)', () => {
    expect(mapConfidenceToLevel(Infinity, true)).toBe('missing');
  });

  // A9-4: NaN score — code explicitly guards: Number.isNaN → 'missing'
  it('A9-4: mapConfidenceToLevel(NaN) → "missing" (explicit guard)', () => {
    expect(mapConfidenceToLevel(NaN, false)).toBe('missing');
  });

  // A9-5: computeMatchConfidence with all-undefined fields in cargo
  // (different from null — undefined means property not set at all)
  it('A9-5: all critical cargo fields undefined → level=missing, blockSend=false', () => {
    // Create cargo where fields that resolveField accesses are explicitly undefined
    const cargo = makeCargo({
      weightMt: undefined as unknown as null,
      originPort: undefined as unknown as null,
      destinationPort: undefined as unknown as null,
      laycan: undefined as unknown as null,
    });
    const vessel = makeVessel({ imo: undefined as unknown as null });
    const result = computeMatchConfidence(cargo, vessel);
    // resolveField checks !cf → undefined is falsy → returns {level:'missing'}
    expect(result.level).toBe('missing');
    expect(result.blockSend).toBe(false);
  });

  // A9-6: sourceText="" (empty string) — treated as missing or present?
  // In resolveField: !!cf.sourceText → !!"" → false → hasSourceQuote=false
  // So empty sourceText → inferred (not verified), not missing
  it('A9-6: sourceText="" (empty string) treated as absent (no sourceQuote)', () => {
    const cargo = makeCargo({
      weightMt: { value: 5000, confidence: 'confirmed', sourceText: '' },
    });
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);
    const weightField = result.fieldConfidences.find(f => f.field === 'cargo.weightMt');
    // score = parseConfToScore('confirmed') = 0.9
    // hasSourceQuote = !!"" = false → mapConfidenceToLevel(0.9, false) = 'inferred'
    expect(weightField?.level).toBe('inferred'); // not 'verified'
    expect(weightField?.sourceQuote).toBe('');
  });

  // A9-7: criticalFields containing an unknown field name
  it('A9-7: unknown criticalField name → resolveField returns {level:"missing"} (default case)', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel, ['cargo.unknownField', 'vessel.nonExistent']);
    // resolveField switch default → {field, level:'missing'}
    expect(result.fieldConfidences).toHaveLength(2);
    expect(result.fieldConfidences[0].level).toBe('missing');
    expect(result.fieldConfidences[1].level).toBe('missing');
    // missing does NOT block send
    expect(result.blockSend).toBe(false);
  });

  // A9-8: mixed unknown + uncertain field
  it('A9-8: unknown field + uncertain real field → blockSend=true (uncertain dominates)', () => {
    const cargo = makeCargo({
      weightMt: { value: 5000, confidence: 'uncertain', sourceText: undefined },
    });
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel, ['cargo.weightMt', 'cargo.unknownField']);
    expect(result.blockSend).toBe(true);
    expect(result.blockedFields).toContain('cargo.weightMt');
    expect(result.level).toBe('uncertain');
  });

  // A9-9: score exactly at 0.5 boundary (inclusive → inferred)
  it('A9-9: score=0.5 exactly → inferred (boundary inclusive)', () => {
    expect(mapConfidenceToLevel(0.5, false)).toBe('inferred');
  });

  // A9-10: score just below 0.5 → uncertain
  it('A9-10: score=0.4999 → uncertain', () => {
    expect(mapConfidenceToLevel(0.4999, false)).toBe('uncertain');
  });

  // A9-11: score exactly at 0.75 (mid-band) → inferred
  it('A9-11: score=0.75 → inferred (in 0.5–0.85 band)', () => {
    expect(mapConfidenceToLevel(0.75, false)).toBe('inferred');
  });

  // A9-12: score exactly at 0.85 without sourceQuote → inferred
  it('A9-12: score=0.85 without sourceQuote → inferred (not verified)', () => {
    expect(mapConfidenceToLevel(0.85, false)).toBe('inferred');
  });

  // A9-13: score exactly at 0.85 with sourceQuote → verified
  it('A9-13: score=0.85 with sourceQuote → verified', () => {
    expect(mapConfidenceToLevel(0.85, true)).toBe('verified');
  });

  // A9-14: -Infinity propagation into computeMatchConfidence
  // If a field's score somehow becomes -Infinity, it routes to 'uncertain' → blocks send
  it('A9-14: -Infinity score in computeMatchConfidence pipeline maps to "uncertain" (blast radius)', () => {
    // We test mapConfidenceToLevel directly as the entry point
    const level = mapConfidenceToLevel(-Infinity, false);
    // If level === 'uncertain', any critical field with -Infinity blocks send
    // This is the blast radius of the -Infinity gap
    if (level === 'uncertain') {
      console.warn('[A9-14 BLAST RADIUS] -Infinity critical field → blockSend=true, silently blocking all quotes');
    }
    // Expected safe behavior: -Infinity → 'missing' (not 'uncertain')
    expect(level).toBe('missing');
  });

  // A9-15: empty criticalFields array (this is handled: returns level=missing per source)
  it('A9-15: empty criticalFields [] → returns level=missing, blockSend=false', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel, []);
    expect(result.level).toBe('missing');
    expect(result.blockSend).toBe(false);
    expect(result.fieldConfidences).toHaveLength(0);
  });
});
