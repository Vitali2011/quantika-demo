/**
 * Group B (#1023) — vessel-DWT requirement fields map through
 * parseCargoAIResponse() into ParsedCargo. Behavioral test: it calls the real
 * parser with a raw JSON payload (not a string-match on source).
 */
import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

describe('parse-cargo-ai — min/max vessel DWT mapping (#1023)', () => {
  it('maps min/max_vessel_dwt_mt to ParsedCargo', () => {
    const raw = JSON.stringify({
      cargo_type: 'OTHER',
      min_vessel_dwt_mt: 12000,
      max_vessel_dwt_mt: 14000,
    });
    const [cargo] = parseCargoAIResponse(raw, 'email-x');
    expect(cargo.minVesselDwtMt).toBe(12000);
    expect(cargo.maxVesselDwtMt).toBe(14000);
  });
  it('defaults missing DWT fields to null', () => {
    const [cargo] = parseCargoAIResponse(JSON.stringify({ cargo_type: 'OTHER' }), 'email-y');
    expect(cargo.minVesselDwtMt).toBeNull();
    expect(cargo.maxVesselDwtMt).toBeNull();
  });
});
