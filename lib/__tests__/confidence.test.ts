import {
  mapConfidenceToLevel,
  computeMatchConfidence,
  getConfidenceColorClass,
  type FieldConfidence,
} from '../confidence';
import type { ParsedCargo, ParsedVessel } from '../types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeCargo(overrides: Partial<ParsedCargo> = {}): ParsedCargo {
  return {
    emailId: 'cargo-1',
    itemIndex: 0,
    originPort: { value: 'Rotterdam', confidence: 'confirmed', sourceText: 'from Rotterdam' },
    originCountry: null,
    destinationPort: { value: 'Dubai', confidence: 'confirmed', sourceText: 'to Dubai' },
    destinationCountry: null,
    cargoDescription: null,
    weightMt: { value: 25000, confidence: 'confirmed', sourceText: '25,000 MT' },
    weightMtMin: null,
    weightMtMax: null,
    volumeCbm: null,
    dimensions: null,
    cargoType: 'BREAK_BULK',
    containerType: null,
    quantity: null,
    incoterms: null,
    preferredDates: null,
    laycan: '01-10 May 2026',
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
    emailId: 'vessel-1',
    itemIndex: 0,
    vesselName: null,
    imo: '9876543',
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
    ...overrides,
  };
}

// ── mapConfidenceToLevel ─────────────────────────────────────────────────────

describe('mapConfidenceToLevel', () => {
  it('returns "missing" for null score', () => {
    expect(mapConfidenceToLevel(null)).toBe('missing');
  });

  it('returns "missing" for undefined score', () => {
    expect(mapConfidenceToLevel(undefined)).toBe('missing');
  });

  it('returns "verified" for score=0.95 with sourceQuote', () => {
    expect(mapConfidenceToLevel(0.95, true)).toBe('verified');
  });

  it('returns "inferred" for score=0.95 without sourceQuote', () => {
    expect(mapConfidenceToLevel(0.95, false)).toBe('inferred');
  });

  it('returns "inferred" for score=0.7 (no sourceQuote)', () => {
    expect(mapConfidenceToLevel(0.7)).toBe('inferred');
  });

  it('returns "uncertain" for score=0.4', () => {
    expect(mapConfidenceToLevel(0.4)).toBe('uncertain');
  });

  it('returns "uncertain" for score=0', () => {
    expect(mapConfidenceToLevel(0)).toBe('uncertain');
  });

  it('returns "inferred" for score=0.5 boundary (>= 0.5)', () => {
    expect(mapConfidenceToLevel(0.5)).toBe('inferred');
  });

  it('returns "verified" for score=0.85 with sourceQuote (boundary)', () => {
    expect(mapConfidenceToLevel(0.85, true)).toBe('verified');
  });
});

// ── computeMatchConfidence ───────────────────────────────────────────────────

describe('computeMatchConfidence', () => {
  it('all ConfidenceField-based critical fields confirmed+sourceText → blockSend=false, blockedFields=[]', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    expect(result.blockSend).toBe(false);
    expect(result.blockedFields).toEqual([]);
    // laycan and vessel.imo are plain strings (no AI confidence) → 'inferred' at best
    // so overall level = 'inferred', not 'verified'
    expect(result.level).toBe('inferred');
  });

  it('1 uncertain critical field → blockSend=true, blockedFields includes it', () => {
    const cargo = makeCargo({
      weightMt: { value: 25000, confidence: 'uncertain' },
    });
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    expect(result.blockSend).toBe(true);
    expect(result.blockedFields).toContain('cargo.weightMt');
    expect(result.level).toBe('uncertain');
  });

  it('2 uncertain critical fields → blockSend=true, blockedFields contains both', () => {
    const cargo = makeCargo({
      weightMt: { value: 25000, confidence: 'uncertain' },
      originPort: { value: 'Rotterdam', confidence: 'uncertain' },
    });
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    expect(result.blockSend).toBe(true);
    expect(result.blockedFields).toContain('cargo.weightMt');
    expect(result.blockedFields).toContain('cargo.originPort');
  });

  it('1 inferred critical field, rest verified → level=inferred, blockSend=false', () => {
    const c2 = makeCargo({
      weightMt: { value: 25000, confidence: 'interpreted' },
      originPort: { value: 'Rotterdam', confidence: 'confirmed', sourceText: 'from Rotterdam' },
      destinationPort: { value: 'Dubai', confidence: 'confirmed', sourceText: 'to Dubai' },
    });
    const vessel = makeVessel();
    const result = computeMatchConfidence(c2, vessel);

    expect(result.blockSend).toBe(false);
    expect(result.blockedFields).toEqual([]);
    // worst level among critical: weightMt=inferred, rest=verified → inferred
    expect(result.level).toBe('inferred');
  });

  it('parsedVessel=null → vessel.imo missing → level includes missing, blockSend=false', () => {
    const cargo = makeCargo();
    const result = computeMatchConfidence(cargo, null);

    // vessel.imo is missing (not uncertain) → does NOT block Send
    expect(result.blockSend).toBe(false);
    expect(result.blockedFields).not.toContain('vessel.imo');

    // level should reflect 'missing' for vessel.imo
    const imoField = result.fieldConfidences.find((f: FieldConfidence) => f.field === 'vessel.imo');
    expect(imoField?.level).toBe('missing');
  });

  it('includes full fieldConfidences breakdown with all critical fields', () => {
    const cargo = makeCargo();
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    const fields = result.fieldConfidences.map((f: FieldConfidence) => f.field);
    expect(fields).toContain('cargo.weightMt');
    expect(fields).toContain('cargo.laycanStart');
    expect(fields).toContain('cargo.laycanEnd');
    expect(fields).toContain('cargo.originPort');
    expect(fields).toContain('cargo.destinationPort');
    expect(fields).toContain('vessel.imo');
  });

  it('laycan=null → laycan fields are missing, does not block Send', () => {
    const cargo = makeCargo({ laycan: null });
    const vessel = makeVessel();
    const result = computeMatchConfidence(cargo, vessel);

    expect(result.blockSend).toBe(false);
    const laycanField = result.fieldConfidences.find(
      (f: FieldConfidence) => f.field === 'cargo.laycanStart',
    );
    expect(laycanField?.level).toBe('missing');
  });

  it('custom criticalFields override works', () => {
    const cargo = makeCargo({
      weightMt: { value: 25000, confidence: 'uncertain' },
    });
    const vessel = makeVessel();
    // Only check originPort — weightMt uncertain should NOT block since not in criticalFields
    const result = computeMatchConfidence(cargo, vessel, ['cargo.originPort']);

    expect(result.blockSend).toBe(false);
    expect(result.blockedFields).toEqual([]);
  });
});

// ── getConfidenceColorClass ──────────────────────────────────────────────────

describe('getConfidenceColorClass', () => {
  it('returns blue class for verified', () => {
    expect(getConfidenceColorClass('verified')).toBe('border-blue-500');
  });

  it('returns yellow class for inferred', () => {
    expect(getConfidenceColorClass('inferred')).toBe('border-yellow-500');
  });

  it('returns orange class for uncertain', () => {
    expect(getConfidenceColorClass('uncertain')).toBe('border-orange-500');
  });

  it('returns gray class for missing', () => {
    expect(getConfidenceColorClass('missing')).toBe('border-gray-400');
  });
});
