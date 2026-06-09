/**
 * Regression: parseVesselAIResponse must strip non-string entries from restrictions
 * when LLM returns objects or numbers instead of strings.
 *
 * Hotfix: fix(match): guard non-string restrictions — PR #hotfix
 */
import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

// parse-vessel-helpers reads no external I/O — no mocks needed

describe('#884 — grain_capacity_unit relabel on cbft→cbm conversion', () => {
  it('ConfidenceField grain_capacity with cuft source sets grainCapacityUnit to cbm after converting', () => {
    // Simulates legacy parse path where grain_capacity arrives as ConfidenceField (not plain NUMBER)
    const raw = JSON.stringify({
      vessel_name: 'MV YUCATAN',
      imo: '9367841',
      grain_capacity: { value: 141050, confidence: 'interpreted', source_text: 'G/B 141050,3 cuft' },
      bale_capacity:  { value: 141050, confidence: 'interpreted', source_text: 'G/B 141050,3 cuft' },
      grain_capacity_unit: null,
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels).toHaveLength(1);
    // Value must be converted (÷35.315): 141050 / 35.314667 ≈ 3994
    expect(vessels[0].grainCapacity).toBe(3994);
    // Unit must be relabelled to cbm — this is the #884 fix
    expect(vessels[0].grainCapacityUnit).toBe('cbm');
  });

  it('#884: grain_capacity_unit="cbm" from schema is preserved as-is (no double-convert)', () => {
    const raw = JSON.stringify({
      vessel_name: 'MV TEST',
      imo: '1234567',
      grain_capacity: 3994,
      grain_capacity_unit: 'cbm',
    });
    const vessels = parseVesselAIResponse(raw, 'test-email');
    expect(vessels[0].grainCapacity).toBe(3994);
    expect(vessels[0].grainCapacityUnit).toBe('cbm');
  });
});

describe('parseVesselAIResponse — non-string restrictions filter', () => {
  const emailId = 'test-email-id';

  function parse(restrictions: unknown) {
    const raw = JSON.stringify({
      vessel_name: 'MV Test',
      imo: '1234567',
      restrictions,
    });
    return parseVesselAIResponse(raw, emailId);
  }

  it('returns only strings when restrictions contains objects and numbers', () => {
    const vessels = parse([{ x: 1 }, 123, 'no grain']);
    expect(vessels).toHaveLength(1);
    expect(vessels[0].restrictions).toEqual(['no grain']);
  });

  it('returns empty array when all restrictions are non-strings', () => {
    const vessels = parse([{ type: 'ban' }, 42, true, null]);
    expect(vessels[0].restrictions).toEqual([]);
  });

  it('returns all strings when all restrictions are strings', () => {
    const vessels = parse(['no grain', 'max DWT 60000']);
    expect(vessels[0].restrictions).toEqual(['no grain', 'max DWT 60000']);
  });

  it('returns empty array when restrictions is not an array', () => {
    const vessels = parse('not an array');
    expect(vessels[0].restrictions).toEqual([]);
  });

  it('returns empty array when restrictions is null', () => {
    const vessels = parse(null);
    expect(vessels[0].restrictions).toEqual([]);
  });

  it('mixed array: [{x:1}, 123, "no grain"] → only ["no grain"]', () => {
    const vessels = parse([{ x: 1 }, 123, 'no grain']);
    expect(vessels[0].restrictions).toHaveLength(1);
    expect(vessels[0].restrictions[0]).toBe('no grain');
  });
});
