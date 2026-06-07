import { QUARANTINE_PAIRS, isMatchQuarantined } from '@/scripts/demo-seed/regenerate-matches';

describe('QUARANTINE_PAIRS — Thisvi→Monfalcone 18930 DWT thin post-ETS match', () => {
  it('QUARANTINE_PAIRS includes Thisvi→Monfalcone in DWT range 17000-21000', () => {
    expect(
      QUARANTINE_PAIRS.some(
        (q) =>
          q.loadPort.toLowerCase() === 'thisvi' &&
          q.dischargePort.toLowerCase() === 'monfalcone' &&
          q.vesselDwtMin <= 18930 &&
          q.vesselDwtMax >= 18930,
      ),
    ).toBe(true);
  });

  it('isMatchQuarantined returns true for Thisvi→Monfalcone 18930 DWT', () => {
    expect(
      isMatchQuarantined({ loadPort: 'Thisvi', dischargePort: 'Monfalcone', vesselDwt: 18930 }),
    ).toBe(true);
  });

  it('isMatchQuarantined returns false for Thisvi→Monfalcone 9000 DWT (smaller variant stays in main)', () => {
    expect(
      isMatchQuarantined({ loadPort: 'Thisvi', dischargePort: 'Monfalcone', vesselDwt: 9000 }),
    ).toBe(false);
  });

  it('isMatchQuarantined returns false for unrelated route', () => {
    expect(
      isMatchQuarantined({ loadPort: 'Piraeus', dischargePort: 'Constanta', vesselDwt: 18930 }),
    ).toBe(false);
  });
});
