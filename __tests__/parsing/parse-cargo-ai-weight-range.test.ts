/**
 * Behavioral test: swapped weight range from LLM must be normalized at parse time.
 *
 * VALUE_CHECK oracle (PI2): a cargo with a swapped weight range must produce the
 * same resolveCargoWeight result as the equivalent non-swapped range, ensuring
 * the OVERLOAD verdict is correct in both cases.
 */
import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';
import { resolveCargoWeight } from '@/lib/sailing/cargo-weight';

function parseOne(item: Record<string, unknown>) {
  return parseCargoAIResponse(JSON.stringify({ items: [item] }), 'email-test')[0];
}

describe('parseCargoAIResponse — weight range ordering', () => {
  it('swapped range: weightMtMin < weightMtMax after parse (min=30000, max=25000 → min=25000, max=30000)', () => {
    const cargo = parseOne({
      cargo_type: 'BULK',
      weight_mt_min: 30000,
      weight_mt_max: 25000,
    });
    expect(cargo.weightMtMin).toBe(25000);
    expect(cargo.weightMtMax).toBe(30000);
  });

  it('swapped range: quantity.min < quantity.max after parse', () => {
    const cargo = parseOne({
      cargo_type: 'BULK',
      weight_mt_min: 30000,
      weight_mt_max: 25000,
    });
    expect(cargo.quantity).toEqual({ min: 25000, max: 30000 });
  });

  it('normal range: preserved as-is (min=25000, max=30000)', () => {
    const cargo = parseOne({
      cargo_type: 'BULK',
      weight_mt_min: 25000,
      weight_mt_max: 30000,
    });
    expect(cargo.weightMtMin).toBe(25000);
    expect(cargo.weightMtMax).toBe(30000);
    expect(cargo.quantity).toEqual({ min: 25000, max: 30000 });
  });

  it('VALUE_CHECK: swapped-range OVERLOAD verdict matches non-swapped equivalent', () => {
    // LLM returns min=30000, max=25000 (swapped). resolveCargoWeight must return 30000,
    // same as the correctly-ordered range (min=25000, max=30000).
    const swapped = parseOne({ cargo_type: 'BULK', weight_mt_min: 30000, weight_mt_max: 25000 });
    const normal  = parseOne({ cargo_type: 'BULK', weight_mt_min: 25000, weight_mt_max: 30000 });
    expect(resolveCargoWeight(swapped)).toBe(resolveCargoWeight(normal));
    expect(resolveCargoWeight(swapped)).toBe(30000);
  });

  it('equal min/max: treated as single value (falls through to quantity scalar)', () => {
    const cargo = parseOne({
      cargo_type: 'BULK',
      weight_mt_min: 5000,
      weight_mt_max: 5000,
      quantity: 5000,
    });
    // wMin === wMax → no range, falls through to extractNum(quantity)
    expect(cargo.quantity).toBe(5000);
  });

  it('only min present: no range created', () => {
    const cargo = parseOne({
      cargo_type: 'BULK',
      weight_mt_min: 5000,
    });
    expect(cargo.weightMtMax).toBeNull();
    // quantity falls through to scalar
    expect(typeof cargo.quantity === 'object' && cargo.quantity !== null).toBe(false);
  });
});
