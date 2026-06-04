/**
 * /cargo/[id] detail must render the same parsed/rebased laycan window as /cargo list.
 * Before #665, the detail rendered `cargo.laycan` verbatim — diverged from list which
 * went through parseLaycan + fmtLaycan.
 */
import { resolveLaycanDisplay } from '@/lib/utils/laycan-display';

const REF_YEAR = 2026;

describe('cargo detail — laycan display contract', () => {
  it('range string → same formatted output as /cargo list', () => {
    expect(resolveLaycanDisplay({ cargoRaw: 'Jun 2-9', refYear: REF_YEAR })).toBe('Jun 2–Jun 9');
  });

  it('spot string → "Spot"', () => {
    expect(resolveLaycanDisplay({ cargoRaw: 'Spot — Prompt', refYear: REF_YEAR })).toBe('Spot');
  });

  it('null laycan → null (caller renders nothing)', () => {
    expect(resolveLaycanDisplay({ cargoRaw: null, refYear: REF_YEAR })).toBeNull();
  });
});
