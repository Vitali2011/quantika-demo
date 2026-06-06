import { runGolden } from './runner';
import type { GoldenRecord } from './schema';

const rec: GoldenRecord = {
  id: 'GS-99-stub', bugClass: 'control', rationale: 'clean panamax', control: true,
  inputs: {
    cargo: { ref: 'c1', qtyT: 50000, qtyMinT: 50000, qtyMaxT: 50000,
             loadPort: 'CNSHA', dischPort: 'NLRTM',
             laycanStart: '2026-10-01', laycanEnd: '2026-10-20', sourceEmail: 'raw/x.json' },
    vessel: { name: 'MV T', dwt: 55000, speedKn: 14, consumptionT: 30,
              openPort: 'Singapore', openDate: '2026-09-15', sourceEmail: 'raw/y.json' },
  },
  expected: {
    weightT: { value: 50000, toleranceAbs: 0, source: 'stated' },
    distanceNm: { value: 9000, tolerancePct: 20, source: 'web' },
    tcePerDay: { value: 0, tolerancePct: 9999, source: 'double' },
  },
  inputHonesty: { speedKn: 'stated', consumptionT: 'stated', freightRate: 'index', bunkerPrice: 'external' },
  engineMust: {}, provenance: 'stub',
};

it('runs the engine and returns distance, weight, tce', async () => {
  const a = await runGolden(rec, new Date('2026-05-28T00:00:00.000Z'));
  expect(a.weightMt).toBe(50000);
  expect(a.distanceNm).toBeGreaterThan(5000);
  expect(typeof a.tceUsdPerDay).toBe('number');
  expect(['main', 'review', 'insufficient']).toContain(a.bucket);
});
