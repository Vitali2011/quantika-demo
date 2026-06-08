import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

function econ(loadPort: string, dischargePort: string, euaPriceEur = 77) {
  return buildMatchEconomics({
    loadPort,
    dischargePort,
    euaPriceEur,
    vesselDwt: 18930,
    quantityMt: 15000,
    speedKts: 12,
    consumptionMt: 18,
    cargoType: 'GRAIN',
    calculatedAt: '2026-06-08T00:00:00.000Z',
    freight: { rate: 22, source: 'estimate', confidence: 0.6 },
    distanceNm: 708,
  } as any);
}

describe('ETS wiring via buildMatchEconomics', () => {
  it('intra-EU route (Thisvi GR → Monfalcone IT) produces non-zero ETS', () => {
    const r = econ('Thisvi', 'Monfalcone');
    expect(r!.breakdown.ets_usd).toBeGreaterThan(0);
  });

  it('non-EU↔non-EU route produces zero ETS', () => {
    const r = econ('Marmara', 'Novorossiysk'); // both non-EU
    expect(r!.breakdown.ets_usd ?? 0).toBe(0);
  });

  it('one-EU route (non-EU → Ravenna IT) applies ~50% coverage (less than intra-EU equivalent)', () => {
    const oneLeg = econ('Marmara', 'Ravenna')!; // TR → IT
    const bothLeg = econ('Thisvi', 'Ravenna')!;  // GR → IT
    const oneEts = oneLeg.breakdown.ets_usd ?? 0;
    const bothEts = bothLeg.breakdown.ets_usd ?? 0;
    expect(oneEts).toBeGreaterThan(0);
    expect(oneEts).toBeLessThan(bothEts); // 0.5 vs 1.0 coverageFactor
  });
});
