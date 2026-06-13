/**
 * #793 — capacity plausibility guard in preNormalizeRawVessel.
 *
 * When cbm < 0.5 × DWT (both positive), grain/bale capacity is implausible
 * and should be nulled. Plausible values (cbm >= 0.5 × DWT) are kept.
 */
import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

describe('#793 — vessel capacity plausibility guard', () => {
  it('nulls grain/bale capacity when cbm is implausibly small (< 0.5 × DWT)', () => {
    // IMO 8605480 scenario: DWT 2570, grain/bale 81 cbm (81 < 0.5 * 2570 = 1285)
    const raw = JSON.stringify({
      vessel_name: 'MV SEAGULL 2',
      imo: '8605480',
      dwt_summer: 2570,
      grain_capacity: 81,
      bale_capacity: 81,
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels).toHaveLength(1);
    expect(vessels[0].grainCapacity).toBeNull();
    expect(vessels[0].baleCapacity).toBeNull();
  });

  it('keeps plausible grain/bale capacity (cbm >= 0.5 × DWT)', () => {
    // 3200 cbm on 2570 DWT: 3200 >= 0.5 * 2570 = 1285 → plausible
    const raw = JSON.stringify({
      vessel_name: 'MV PLAUSIBLE',
      imo: '1234567',
      dwt_summer: 2570,
      grain_capacity: 3200,
      bale_capacity: 3000,
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels).toHaveLength(1);
    expect(vessels[0].grainCapacity).toBe(3200);
    expect(vessels[0].baleCapacity).toBe(3000);
  });

  it('does not null capacity when DWT is absent (no guard without both values)', () => {
    const raw = JSON.stringify({
      vessel_name: 'MV NO_DWT',
      imo: '1234567',
      grain_capacity: 81,
      bale_capacity: 81,
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels).toHaveLength(1);
    // Without DWT, cannot apply guard → keep the value as-is
    expect(vessels[0].grainCapacity).toBe(81);
    expect(vessels[0].baleCapacity).toBe(81);
  });

  it('does not null capacity when cbm is 0 (zero-guard already handles that)', () => {
    // Zero cbm is already null'd by nullIfZeroNumeric — guard only for positive implausible values
    const raw = JSON.stringify({
      vessel_name: 'MV ZERO_CAP',
      imo: '1234567',
      dwt_summer: 10000,
      grain_capacity: { value: 0, confidence: 'uncertain', source_text: '' },
      bale_capacity: { value: 0, confidence: 'uncertain', source_text: '' },
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels).toHaveLength(1);
    // Zero values already null'd by existing zero-guard — no additional change
    expect(vessels[0].grainCapacity).toBeNull();
  });

  it('applies guard independently: nulls grain but keeps bale when only grain is implausible', () => {
    // grain = 50 cbm (implausible), bale = 3000 cbm (plausible), DWT = 2570
    const raw = JSON.stringify({
      vessel_name: 'MV SPLIT',
      imo: '1234567',
      dwt_summer: 2570,
      grain_capacity: 50,
      bale_capacity: 3000,
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels).toHaveLength(1);
    expect(vessels[0].grainCapacity).toBeNull();
    expect(vessels[0].baleCapacity).toBe(3000);
  });
});
