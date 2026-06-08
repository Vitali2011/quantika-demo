/**
 * W5 refactor: EconomicsResult.dataQuality.consumption maps W2 consumptionEstimated boolean
 * into the unified data-quality channel.
 */
import { buildMatchEconomics } from '@/lib/matching/tce-calculator';

test('buildMatchEconomics with zero consumption populates dataQuality.consumption.tier=estimated', () => {
  const result = buildMatchEconomics({
    cargoType: 'GRAIN',
    distanceNm: 3000,
    vesselDwt: 28000,
    quantityMt: 18000,
    speedKts: 12,
    consumptionMt: 0,
    loadPort: 'NLRTM',
    dischargePort: 'EGPSD',
    calculatedAt: new Date().toISOString(),
    excludeWarRiskFromDailyTce: true,
  });
  expect(result).not.toBeNull();
  expect(result!.dataQuality?.consumption?.tier).toBe('estimated');
});

test('buildMatchEconomics with explicit consumption: no dataQuality.consumption entry or tier=live', () => {
  const result = buildMatchEconomics({
    cargoType: 'GRAIN',
    distanceNm: 3000,
    vesselDwt: 28000,
    quantityMt: 18000,
    speedKts: 12,
    consumptionMt: 22,
    loadPort: 'NLRTM',
    dischargePort: 'EGPSD',
    calculatedAt: new Date().toISOString(),
    excludeWarRiskFromDailyTce: true,
  });
  expect(result).not.toBeNull();
  const tier = result!.dataQuality?.consumption?.tier;
  expect(tier === undefined || tier === 'live').toBe(true);
});
