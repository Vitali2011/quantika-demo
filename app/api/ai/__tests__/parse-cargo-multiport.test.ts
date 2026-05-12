import { parseCargoAIResponse } from '@/app/api/ai/parse-cargo/route';

describe('parseCargoAIResponse multi-port extraction', () => {
  it('extracts origin_port_alternatives as string[]', () => {
    const raw = JSON.stringify({
      items: [
        {
          origin_port: { value: 'El Arish', confidence: 'confirmed' },
          origin_port_alternatives: ['El Dekheila'],
          destination_port: { value: 'Port of Call', confidence: 'interpreted' },
          weight_mt: { value: 16000, confidence: 'confirmed' },
          cargo_description: { value: 'salt', confidence: 'confirmed' },
          cargo_type: 'BULK',
        },
      ],
    });
    const out = parseCargoAIResponse(raw, 'em-test');
    expect(out).toHaveLength(1);
    expect(out[0].originPortAlternatives).toEqual(['El Dekheila']);
    expect(out[0].originPortRotation).toBeNull();
    expect(out[0].destinationPortAlternatives).toBeNull();
    expect(out[0].destinationPortRotation).toBeNull();
    expect(out[0].weightPerPort).toBeNull();
  });

  it('extracts destination_port_rotation and weight_per_port', () => {
    const raw = JSON.stringify({
      items: [
        {
          origin_port: { value: 'Kandla', confidence: 'confirmed' },
          destination_port: { value: 'Banjul', confidence: 'confirmed' },
          destination_port_rotation: ['Banjul', 'Dakar'],
          weight_per_port: [10000, 30000],
          weight_mt: { value: 40000, confidence: 'confirmed' },
          cargo_description: { value: 'rice', confidence: 'confirmed' },
          cargo_type: 'BULK',
        },
      ],
    });
    const out = parseCargoAIResponse(raw, 'em-test2');
    expect(out).toHaveLength(1);
    expect(out[0].destinationPortRotation).toEqual(['Banjul', 'Dakar']);
    expect(out[0].weightPerPort).toEqual([10000, 30000]);
    expect(out[0].originPortAlternatives).toBeNull();
    expect(out[0].originPortRotation).toBeNull();
  });

  it('filters non-string values from alternatives array', () => {
    const raw = JSON.stringify({
      items: [
        {
          origin_port: { value: 'A', confidence: 'confirmed' },
          origin_port_alternatives: ['B', null, '', 123],
          destination_port: { value: 'C', confidence: 'confirmed' },
          weight_mt: { value: 5000, confidence: 'confirmed' },
          cargo_description: { value: 'grain', confidence: 'confirmed' },
          cargo_type: 'BULK',
        },
      ],
    });
    const out = parseCargoAIResponse(raw, 'em-test3');
    // null and '' are filtered out; 123 becomes "123" then filtered if empty → "123" kept
    expect(out[0].originPortAlternatives).toEqual(['B', '123']);
  });

  it('returns null for alternatives when field absent', () => {
    const raw = JSON.stringify({
      items: [
        {
          origin_port: { value: 'Hamburg', confidence: 'confirmed' },
          destination_port: { value: 'Rotterdam', confidence: 'confirmed' },
          weight_mt: { value: 10000, confidence: 'confirmed' },
          cargo_description: { value: 'steel', confidence: 'confirmed' },
          cargo_type: 'GENERAL',
        },
      ],
    });
    const out = parseCargoAIResponse(raw, 'em-test4');
    expect(out[0].originPortAlternatives).toBeNull();
    expect(out[0].originPortRotation).toBeNull();
    expect(out[0].destinationPortAlternatives).toBeNull();
    expect(out[0].destinationPortRotation).toBeNull();
    expect(out[0].weightPerPort).toBeNull();
  });

  it('filters NaN from weight_per_port', () => {
    const raw = JSON.stringify({
      items: [
        {
          origin_port: { value: 'X', confidence: 'confirmed' },
          destination_port: { value: 'Y', confidence: 'confirmed' },
          destination_port_rotation: ['Y', 'Z'],
          weight_per_port: [10000, 'bad', 20000],
          weight_mt: { value: 30000, confidence: 'confirmed' },
          cargo_description: { value: 'coal', confidence: 'confirmed' },
          cargo_type: 'BULK',
        },
      ],
    });
    const out = parseCargoAIResponse(raw, 'em-test5');
    expect(out[0].weightPerPort).toEqual([10000, 20000]);
  });
});
