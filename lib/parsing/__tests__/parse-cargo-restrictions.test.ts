/**
 * Tests for structured cargo vessel-restriction field extraction.
 * TDD: verify parseCargoAIResponse maps raw AI fields to ParsedCargo restriction fields.
 * Uses REAL corpus input shapes: plain numbers, strings, ConfidenceField wrappers, nulls.
 */

import { parseCargoAIResponse } from '../parse-cargo-ai';
import { PARSE_CARGO_SCHEMA } from '@/lib/schemas/parse-cargo';

// ─── Schema shape tests ───────────────────────────────────────────────────────

describe('PARSE_CARGO_SCHEMA — restriction fields present', () => {
  const itemProps = (PARSE_CARGO_SCHEMA as any).properties.items.items.properties;

  it('has max_vessel_age_yrs as NUMBER nullable', () => {
    expect(itemProps.max_vessel_age_yrs).toBeDefined();
    expect(itemProps.max_vessel_age_yrs.type).toBe('NUMBER');
    expect(itemProps.max_vessel_age_yrs.nullable).toBe(true);
  });

  it('has gear_required as BOOLEAN nullable', () => {
    expect(itemProps.gear_required).toBeDefined();
    expect(itemProps.gear_required.type).toBe('BOOLEAN');
    expect(itemProps.gear_required.nullable).toBe(true);
  });

  it('has max_loa_m as NUMBER nullable', () => {
    expect(itemProps.max_loa_m).toBeDefined();
    expect(itemProps.max_loa_m.type).toBe('NUMBER');
    expect(itemProps.max_loa_m.nullable).toBe(true);
  });

  it('has max_beam_m as NUMBER nullable', () => {
    expect(itemProps.max_beam_m).toBeDefined();
    expect(itemProps.max_beam_m.type).toBe('NUMBER');
    expect(itemProps.max_beam_m.nullable).toBe(true);
  });

  it('has flag_required as STRING nullable', () => {
    expect(itemProps.flag_required).toBeDefined();
    expect(itemProps.flag_required.type).toBe('STRING');
    expect(itemProps.flag_required.nullable).toBe(true);
  });

  it('has class_required as STRING nullable', () => {
    expect(itemProps.class_required).toBeDefined();
    expect(itemProps.class_required.type).toBe('STRING');
    expect(itemProps.class_required.nullable).toBe(true);
  });
});

// ─── parseCargoAIResponse mapping tests ──────────────────────────────────────

function makeRaw(overrides: Record<string, unknown>) {
  return JSON.stringify({
    items: [{
      cargo_type: 'BULK',
      origin_port: { value: 'Alexandria', confidence: 'confirmed', source_text: 'Alexandria' },
      destination_port: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
      cargo_description: { value: 'Wheat', confidence: 'confirmed', source_text: 'wheat' },
      weight_mt: { value: 25000, confidence: 'confirmed', source_text: '25000mt' },
      missing_info: [],
      ...overrides,
    }],
  });
}

describe('parseCargoAIResponse — max_vessel_age_yrs', () => {
  it('"MAX 25 years" → maxVesselAgeYrs: 25 (plain number)', () => {
    const result = parseCargoAIResponse(makeRaw({ max_vessel_age_yrs: 25 }), 'e1');
    expect(result[0].maxVesselAgeYrs).toBe(25);
  });

  it('"max age 20yrs" → maxVesselAgeYrs: 20', () => {
    const result = parseCargoAIResponse(makeRaw({ max_vessel_age_yrs: 20 }), 'e1');
    expect(result[0].maxVesselAgeYrs).toBe(20);
  });

  it('no restriction text → maxVesselAgeYrs: null', () => {
    const result = parseCargoAIResponse(makeRaw({ max_vessel_age_yrs: null }), 'e1');
    expect(result[0].maxVesselAgeYrs).toBeNull();
  });

  it('field absent → maxVesselAgeYrs: null (conservative)', () => {
    const result = parseCargoAIResponse(makeRaw({}), 'e1');
    expect(result[0].maxVesselAgeYrs).toBeNull();
  });
});

describe('parseCargoAIResponse — gear_required', () => {
  it('"Vsl shd be geared" → gearRequired: true', () => {
    const result = parseCargoAIResponse(makeRaw({ gear_required: true }), 'e1');
    expect(result[0].gearRequired).toBe(true);
  });

  it('"NEED GEARED VSLS" → gearRequired: true', () => {
    const result = parseCargoAIResponse(makeRaw({ gear_required: true }), 'e1');
    expect(result[0].gearRequired).toBe(true);
  });

  it('"GRD/Grab fitted vsl req." → gearRequired: true', () => {
    const result = parseCargoAIResponse(makeRaw({ gear_required: true }), 'e1');
    expect(result[0].gearRequired).toBe(true);
  });

  it('no gear req → gearRequired: null (not false)', () => {
    const result = parseCargoAIResponse(makeRaw({ gear_required: null }), 'e1');
    expect(result[0].gearRequired).toBeNull();
  });

  it('field absent → gearRequired: null (conservative)', () => {
    const result = parseCargoAIResponse(makeRaw({}), 'e1');
    expect(result[0].gearRequired).toBeNull();
  });
});

describe('parseCargoAIResponse — max_loa_m + max_beam_m', () => {
  it('"max loa 145 mtr" → maxLoaM: 145', () => {
    const result = parseCargoAIResponse(makeRaw({ max_loa_m: 145 }), 'e1');
    expect(result[0].maxLoaM).toBe(145);
  });

  it('"max beam 16mtr" → maxBeamM: 16', () => {
    const result = parseCargoAIResponse(makeRaw({ max_beam_m: 16 }), 'e1');
    expect(result[0].maxBeamM).toBe(16);
  });

  it('null loa/beam → null (conservative)', () => {
    const result = parseCargoAIResponse(makeRaw({ max_loa_m: null, max_beam_m: null }), 'e1');
    expect(result[0].maxLoaM).toBeNull();
    expect(result[0].maxBeamM).toBeNull();
  });

  it('fields absent → null (conservative)', () => {
    const result = parseCargoAIResponse(makeRaw({}), 'e1');
    expect(result[0].maxLoaM).toBeNull();
    expect(result[0].maxBeamM).toBeNull();
  });
});

describe('parseCargoAIResponse — flag_required + class_required', () => {
  it('"FLAG HK; CLASS CCS" → flagRequired: "HK", classRequired: "CCS"', () => {
    const result = parseCargoAIResponse(makeRaw({ flag_required: 'HK', class_required: 'CCS' }), 'e1');
    expect(result[0].flagRequired).toBe('HK');
    expect(result[0].classRequired).toBe('CCS');
  });

  it('no flag/class req → null', () => {
    const result = parseCargoAIResponse(makeRaw({ flag_required: null, class_required: null }), 'e1');
    expect(result[0].flagRequired).toBeNull();
    expect(result[0].classRequired).toBeNull();
  });

  it('fields absent → null (conservative)', () => {
    const result = parseCargoAIResponse(makeRaw({}), 'e1');
    expect(result[0].flagRequired).toBeNull();
    expect(result[0].classRequired).toBeNull();
  });
});
