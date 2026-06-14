/**
 * CBFT→CBM conversion via the EXPLICIT grain_capacity_unit field.
 *
 * ROOT (prod-confirmed): the LLM emits the RAW cbft number + grain_capacity_unit="cbft"
 * (it does NOT pre-convert). Downstream scoreVolume/checkVolumeFit read grainCapacity as
 * cbm unconditionally; the CAPACITY_PLAUSIBILITY clamp (cbm > 2.5x DWT → null) then NULLS
 * the legit capacity because a raw cbft value reads ~35x too large.
 *
 * FIX: code is the single owner of the cbft→cbm conversion. parseVesselAIResponse must
 * convert the VALUE (÷35.314667 ≈ ×0.0283168) and relabel unit="cbm" BEFORE the clamp.
 * Oracle: 220577 cbft → 6247 cbm.
 */
import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

function rawVessel(extra: Record<string, unknown>): string {
  return JSON.stringify({ vessel_name: 'MV CBFT TEST', ...extra });
}

describe('CBFT explicit-unit conversion — code is the single owner', () => {
  it('plain-number grain 220577 cbft → ~6247 cbm, unit relabelled, NOT nulled by clamp', () => {
    // dwt 8000: raw 220577 > 2.5*8000 (20000) would clamp; 6247 is in [4000, 20000] → survives.
    const raw = rawVessel({
      grain_capacity: 220577,
      grain_capacity_unit: 'cbft',
      dwt_summer: { value: 8000, confidence: 'confirmed', source_text: 'DWT 8000' },
    });
    const [v] = parseVesselAIResponse(raw, 'e1');
    expect(v.grainCapacity).not.toBeNull();
    expect(v.grainCapacity).toBeGreaterThanOrEqual(6240);
    expect(v.grainCapacity).toBeLessThanOrEqual(6250);
    expect(v.grainCapacityUnit).toBe('cbm');
  });

  it('ConfidenceField grain 220577 cbft → ~6247 cbm, unit cbm', () => {
    const raw = rawVessel({
      grain_capacity: { value: 220577, confidence: 'confirmed', source_text: 'grain 220577' },
      grain_capacity_unit: 'cbft',
      dwt_summer: { value: 8000, confidence: 'confirmed', source_text: 'DWT 8000' },
    });
    const [v] = parseVesselAIResponse(raw, 'e2');
    expect(v.grainCapacity).toBeGreaterThanOrEqual(6240);
    expect(v.grainCapacity).toBeLessThanOrEqual(6250);
    expect(v.grainCapacityUnit).toBe('cbm');
  });

  it('bale capacity converts under the shared cbft unit', () => {
    const raw = rawVessel({
      grain_capacity: 220577,
      bale_capacity: 210000,
      grain_capacity_unit: 'cbft',
      dwt_summer: { value: 8000, confidence: 'confirmed', source_text: 'DWT 8000' },
    });
    const [v] = parseVesselAIResponse(raw, 'e3');
    // 210000 / 35.314667 ≈ 5947
    expect(v.baleCapacity).toBeGreaterThanOrEqual(5940);
    expect(v.baleCapacity).toBeLessThanOrEqual(5955);
  });

  it('no double-convert: value already cbm stays put', () => {
    const raw = rawVessel({
      grain_capacity: 6247,
      grain_capacity_unit: 'cbm',
      dwt_summer: { value: 8000, confidence: 'confirmed', source_text: 'DWT 8000' },
    });
    const [v] = parseVesselAIResponse(raw, 'e4');
    expect(v.grainCapacity).toBe(6247);
    expect(v.grainCapacityUnit).toBe('cbm');
  });
});
