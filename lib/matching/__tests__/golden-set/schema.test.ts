import { parseGoldenRecord, type GoldenRecord } from './schema';

const valid: GoldenRecord = {
  id: 'GS-99-stub',
  bugClass: 'control',
  rationale: 'stub',
  control: true,
  inputs: {
    cargo: { ref: 'c1', qtyT: 50000, loadPort: 'CNSHA', dischPort: 'NLRTM',
             laycanStart: '2026-10-01', laycanEnd: '2026-10-20', sourceEmail: 'raw/x.json' },
    vessel: { name: 'MV T', dwt: 55000, speedKn: 14, consumptionT: 30,
              openPort: 'Singapore', openDate: '2026-09-15', sourceEmail: 'raw/y.json' },
  },
  expected: {
    weightT: { value: 50000, toleranceAbs: 0, source: 'stated:cargo-email' },
    distanceNm: { value: 9000, tolerancePct: 3, source: 'web:searoutes.com' },
    tcePerDay: { value: 12000, toleranceAbs: 500, tolerancePct: 5, source: 'double-compute' },
  },
  inputHonesty: { speedKn: 'stated', consumptionT: 'stated', freightRate: 'index', bunkerPrice: 'external' },
  engineMust: { speedNotDefaulted: true, portFeesNonzero: true },
  provenance: 'stub',
};

it('accepts a valid record', () => {
  expect(() => parseGoldenRecord(valid)).not.toThrow();
});

it('rejects a record missing expected.tcePerDay', () => {
  const bad = { ...valid, expected: { ...valid.expected, tcePerDay: undefined } };
  expect(() => parseGoldenRecord(bad)).toThrow();
});

it('rejects inputHonesty with an unknown enum', () => {
  const bad = { ...valid, inputHonesty: { ...valid.inputHonesty, speedKn: 'banana' } };
  expect(() => parseGoldenRecord(bad as unknown)).toThrow();
});
