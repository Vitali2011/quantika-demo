import { applyGearedFallback } from '../geared-fallback';
import type { ParsedVessel } from '../../types';

function makeVessel(overrides: Partial<ParsedVessel>): ParsedVessel {
  return {
    emailId: 'test-email',
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

// ── B1: Geared fallback ──

describe('applyGearedFallback — B1: geared detection', () => {
  it('pipe-compact "| Gearless |": geared=true → corrected to false', () => {
    const vessel = makeVessel({
      vesselName: { value: 'HC EVA-MARIE', confidence: 'confirmed' },
      geared: true,
    });
    const body = 'HC EVA-MARIE | DWT: 11,000 mts | Gearless | BOX';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.geared).toBe(false);
  });

  it('"Gearless (shore cranes required)" → geared=false even if LLM said true', () => {
    const vessel = makeVessel({ geared: true });
    const body = 'MV SOME-VESSEL\nGearless (shore cranes required)\nOpen: Rotterdam';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.geared).toBe(false);
  });

  it('"2x30t cranes SWL" → geared stays true', () => {
    const vessel = makeVessel({ geared: true });
    const body = 'MV CRANE-SHIP 2x30t cranes SWL open Antwerp';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.geared).toBe(true);
  });

  it('no gearless keyword → geared=false is NOT changed to true', () => {
    const vessel = makeVessel({ geared: false });
    const body = 'MV SOME-VESSEL open Rotterdam\ncrane info missing';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.geared).toBe(false);
  });

  it('case-insensitive: "GEARLESS" in uppercase → geared=false', () => {
    const vessel = makeVessel({ geared: true });
    const body = 'MV TEST-SHIP GEARLESS open Hamburg';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.geared).toBe(false);
  });
});

// ── B2: grainCapacityUnit normalization ──

describe('applyGearedFallback — B2: grainCapacityUnit normalization', () => {
  it('"CBM" uppercase → normalized to "cbm"', () => {
    const vessel = makeVessel({ grainCapacityUnit: 'CBM' as 'cbm' });
    const body = 'MV TEST grain capacity 15000 CBM';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.grainCapacityUnit).toBe('cbm');
  });

  it('"CBFT" uppercase → normalized to "cbft"', () => {
    const vessel = makeVessel({ grainCapacityUnit: 'CBFT' as 'cbft' });
    const body = 'MV TEST grain capacity 15000 CBFT';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.grainCapacityUnit).toBe('cbft');
  });

  it('"cbm" already lowercase → unchanged', () => {
    const vessel = makeVessel({ grainCapacityUnit: 'cbm' });
    const body = 'MV TEST grain capacity 15000 cbm';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.grainCapacityUnit).toBe('cbm');
  });

  it('null grainCapacityUnit → stays null', () => {
    const vessel = makeVessel({ grainCapacityUnit: null });
    const body = 'MV TEST open Hamburg';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.grainCapacityUnit).toBeNull();
  });
});

// ── B3: openDate spot detection ──

describe('applyGearedFallback — B3: openDate spot detection', () => {
  it('"open: spot (eta 9 Aug)" → openDate.value="spot"', () => {
    const vessel = makeVessel({
      openDate: { value: '2025-08-09', confidence: 'interpreted', sourceText: 'open: spot (eta 9 Aug)' },
    });
    const body = 'MV GANDOLF 3850 DWT open: spot (eta 9 Aug) Skikda';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.openDate?.value).toBe('spot');
  });

  it('"open: prompt" → openDate.value="spot"', () => {
    const vessel = makeVessel({
      openDate: { value: '2025-07-01', confidence: 'interpreted', sourceText: 'open: prompt' },
    });
    const body = 'MV VESSEL open: prompt Rotterdam';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.openDate?.value).toBe('spot');
  });

  it('no spot keyword → openDate.value unchanged', () => {
    const vessel = makeVessel({
      openDate: { value: '2025-08-09', confidence: 'confirmed', sourceText: 'open 9 Aug' },
    });
    const body = 'MV VESSEL open 9 Aug Rotterdam';
    const [result] = applyGearedFallback([vessel], body);
    expect(result.openDate?.value).toBe('2025-08-09');
  });

  it('sourceText longer than 120 chars → truncated', () => {
    const longSource = 'a'.repeat(200);
    const vessel = makeVessel({
      openDate: { value: '2025-08-09', confidence: 'confirmed', sourceText: longSource },
    });
    const body = 'MV VESSEL open 9 Aug Rotterdam';
    const [result] = applyGearedFallback([vessel], body);
    expect((result.openDate?.sourceText ?? '').length).toBeLessThanOrEqual(120);
  });
});
