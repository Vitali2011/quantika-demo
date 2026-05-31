/**
 * Parser tier-1 contract (Wave #7, L2 #7).
 *
 * The parse-cargo prompt + schema already extract an explicit per-MT freight rate
 * into `freight_rate_usd`; parseCargoAIResponse maps it to `ParsedCargo.freightRateUsd`,
 * which resolveFreightRate consumes as the tier-1 (parsed) rate. This guards that
 * mapping against regression (no LLM — pure response parsing).
 */
import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

function parseOne(item: Record<string, unknown>) {
  return parseCargoAIResponse(JSON.stringify({ items: [item] }), 'email-1');
}

describe('parseCargoAIResponse — freight_rate_usd → freightRateUsd', () => {
  it('maps an explicit per-MT freight rate ("$18/MT")', () => {
    const parsed = parseOne({
      origin_port: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
      destination_port: { value: 'Hamburg', confidence: 'confirmed', source_text: 'Hamburg' },
      cargo_type: 'BULK',
      weight_mt: { value: 5000, confidence: 'confirmed', source_text: '5000mt' },
      freight_rate_usd: 18,
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].freightRateUsd).toBe(18);
  });

  it('preserves a decimal rate (18.5)', () => {
    expect(parseOne({ cargo_type: 'GRAIN', freight_rate_usd: 18.5 })[0].freightRateUsd).toBe(18.5);
  });

  it('is null when no freight rate is stated', () => {
    expect(parseOne({ cargo_type: 'BULK' })[0].freightRateUsd).toBeNull();
  });

  it('non-numeric junk ("TBD") → null (not NaN)', () => {
    expect(parseOne({ cargo_type: 'BULK', freight_rate_usd: 'TBD' })[0].freightRateUsd).toBeNull();
  });
});
