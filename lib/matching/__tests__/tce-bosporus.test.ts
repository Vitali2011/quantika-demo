import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

function econ(loadPort: string, dischargePort: string) {
  return buildMatchEconomics({
    loadPort,
    dischargePort,
    vesselDwt: 5000,
    quantityMt: 4000,
    speedKts: 12,
    consumptionMt: 10,
    cargoType: 'GRAIN',
    calculatedAt: '2026-06-08T00:00:00.000Z',
    freight: { rate: 22, source: 'estimate', confidence: 0.6 },
    distanceNm: 430,
  } as any);
}

describe('Bosporus transit detection', () => {
  it('Med↔BlackSea route charges Bosporus dues in canal_usd', () => {
    const r = econ('Piraeus', 'Odesa'); // Med ↔ Black Sea
    expect(r).not.toBeNull();
    expect(r!.breakdown.canal_usd).toBeGreaterThan(0);
  });

  it('intra-Med route charges no Bosporus', () => {
    const r = econ('Piraeus', 'Genoa'); // both Med
    expect(r!.breakdown.canal_usd).toBe(0);
  });

  it('intra-BlackSea route charges no Bosporus', () => {
    const r = econ('Chornomorsk', 'Constanta'); // both Black Sea — strait not transited
    expect(r!.breakdown.canal_usd).toBe(0);
  });
});
