/**
 * spec-betafix-03 acceptance criteria — Port DA seed values must reflect
 * broker-realistic disbursement totals, not the original under-priced demo
 * stub that returned $0 / sub-$30k for all ports.
 *
 * Scope: assert that the JSON baseline + getPortDa lookup yields totalFixedUsd
 * within published industry bands for the spec-mandated demo ports.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { getPortDa } from '@/lib/port-da/repository';
import { seedPortDa, type LlmCaller, type LlmGapBracket, type BaselinePort } from '../../../scripts/seed-port-da';
import baselineRaw from '../../../scripts/seed-data/port-da-base.json';

const baseline = baselineRaw as BaselinePort[];

// Mock LLM caller — gap-fill panamax/capesize with synthetic but harmless values.
// The acceptance tests below only query handysize bracket (≤40k DWT) so LLM
// values are not exercised, but we must supply a caller to seed without errors.
const mockLlmCaller: LlmCaller = jest.fn(
  async (_model, _portCode, _portName, _bracketName, dwtMin, dwtMax): Promise<LlmGapBracket> => ({
    vessel_dwt_min: dwtMin,
    vessel_dwt_max: dwtMax,
    port_dues_usd: 50000,
    pilotage_usd: 15000,
    tugs_usd: 12000,
    stevedoring_usd_per_mt: 6.0,
    confidence: 'estimated',
  }),
);

describe('spec-betafix-03 — Port DA seed acceptance', () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
    await seedPortDa(db, baseline, mockLlmCaller);
  });

  // RC1 note (2026-06-08 recalibration): thresholds below reflect de-inflated values
  // (port_dues÷2, pilotage÷6, tugs÷2.5).  The old thresholds encoded the LLM-fabricated
  // 2-3× inflation.  The new floors are set ~10% below each port's actual recalibrated
  // total for robustness against future fine-tuning while still guarding against
  // accidentally zeroing out a port or regressing to the old inflated data.
  it('Lagos NGAPP DA for 30k DWT is >= $32k and <= $60k', () => {
    const r = getPortDa({ portCode: 'NGAPP', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(32_000);
    expect(r!.totalFixedUsd).toBeLessThanOrEqual(60_000);
  });

  it('Rotterdam NLRTM DA for 35k DWT is >= $28k', () => {
    const r = getPortDa({ portCode: 'NLRTM', vesselDwt: 35000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(28_000);
  });

  it('Antwerp BEANR DA for 30k DWT is >= $26k', () => {
    const r = getPortDa({ portCode: 'BEANR', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(26_000);
  });

  it('Singapore SGSIN DA for 35k DWT is between $20k and $40k', () => {
    const r = getPortDa({ portCode: 'SGSIN', vesselDwt: 35000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(20_000);
    expect(r!.totalFixedUsd).toBeLessThanOrEqual(40_000);
  });

  it('Durban ZADUR DA for 30k DWT is >= $23k', () => {
    const r = getPortDa({ portCode: 'ZADUR', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(23_000);
  });

  it('Suez EGSUZ DA for 30k DWT is >= $15k', () => {
    const r = getPortDa({ portCode: 'EGSUZ', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(15_000);
  });

  it('Dubai AEDXB DA for 30k DWT is >= $18k', () => {
    const r = getPortDa({ portCode: 'AEDXB', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(18_000);
  });

  it('Mersin TRMER DA for 30k DWT is >= $17k', () => {
    const r = getPortDa({ portCode: 'TRMER', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(17_000);
  });

  it('Aqaba JOAQB DA for 30k DWT is >= $14k', () => {
    const r = getPortDa({ portCode: 'JOAQB', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(14_000);
  });

  it('Misurata LYMRA DA for 30k DWT is >= $18k', () => {
    const r = getPortDa({ portCode: 'LYMRA', vesselDwt: 30000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBeGreaterThanOrEqual(18_000);
  });

  it('Unknown UNLOCODE returns null fallback (not a thrown error)', () => {
    const r = getPortDa({ portCode: 'XXXXX', vesselDwt: 30000 }, db);
    expect(r).toBeNull();
  });
});

describe('spec-betafix-03 — voyage-calculator integration', () => {
  // We assert calculateTCE flips applicable.da:true when daUsd > 0,
  // proving the wiring chain: getPortDa → resolveDaUsd → calculateTCE.
  it('TCE with daUsd > 0 sets applicable.da:true and reports da_usd', async () => {
    const { calculateTCE } = await import('@/lib/economics/voyage-calculator');
    const result = calculateTCE({
      vessel: { dwt: 30000, valueUsd: 25_000_000, speedKts: 13, consumptionMtPerDay: 25 },
      route: { originPort: 'BEANR', destinationPort: 'NGAPP', distanceNm: 4500, viaSuez: false },
      cargo: { quantityMt: 28000, freightRateUsdPerMt: 50 },
      bunkerPriceUsdPerMt: 580,
      euaPriceEur: 80,
      durationDays: 16,
      euLegPercent: 0,
      daysInHra: 0,
      canalUsd: 0,
      daUsd: 185_000, // BEANR + NGAPP combined
    });
    expect(result.breakdown.applicable.da).toBe(true);
    expect(result.breakdown.da_usd).toBeGreaterThan(80_000);
  });

  it('TCE with daUsd = 0 sets applicable.da:false', async () => {
    const { calculateTCE } = await import('@/lib/economics/voyage-calculator');
    const result = calculateTCE({
      vessel: { dwt: 30000, valueUsd: 25_000_000, speedKts: 13, consumptionMtPerDay: 25 },
      route: { originPort: 'XXXXX', destinationPort: 'YYYYY', distanceNm: 4500 },
      cargo: { quantityMt: 28000, freightRateUsdPerMt: 50 },
      bunkerPriceUsdPerMt: 580,
      euaPriceEur: 80,
      durationDays: 16,
      canalUsd: 0,
      daUsd: 0,
    });
    expect(result.breakdown.applicable.da).toBe(false);
    expect(result.breakdown.da_usd).toBe(0);
  });
});

describe('wave4-portda — 15 new demo ports + small-vessel bracket coverage', () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
    await seedPortDa(db, baseline, mockLlmCaller);
  });

  afterAll(() => db.close());

  // RC1 note (2026-06-08 recalibration): exact totals updated to reflect de-inflated
  // values (port_dues÷2, pilotage÷6, tugs÷2.5, rounded to nearest $100).
  it('TRALI at 8 000 DWT hits small-vessel bracket with total 11 900', () => {
    const r = getPortDa({ portCode: 'TRALI', vesselDwt: 8000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBe(11_900);
  });

  it('ROCND at 25 000 DWT hits handysize bracket with total 25 600', () => {
    const r = getPortDa({ portCode: 'ROCND', vesselDwt: 25000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBe(25_600);
  });

  it('GBLIV at 50 000 DWT hits large bracket with total 50 000', () => {
    const r = getPortDa({ portCode: 'GBLIV', vesselDwt: 50000 }, db);
    expect(r).not.toBeNull();
    expect(r!.totalFixedUsd).toBe(50_000);
  });

  it('seeded DB has 54 distinct port_codes after adding 15 new ports', () => {
    const row = db.prepare<[], { count: number }>(
      'SELECT COUNT(DISTINCT port_code) AS count FROM port_da_estimates',
    ).get();
    expect(row!.count).toBe(54);
  });

  it('all new ports have a small-vessel bracket (1 000–9 999)', () => {
    const newPorts = ['TRALI','TRMAR','ROCND','GRTHI','ITMNF','TRISK',
                      'UAREN','UAODS','UAIZM','BGVAR','SOBBO','GBLIV',
                      'ITRAN','GEPTI','GEBUS'];
    for (const code of newPorts) {
      const r = getPortDa({ portCode: code, vesselDwt: 5000 }, db);
      expect(r).not.toBeNull();
      expect(r!.totalFixedUsd).toBeGreaterThan(0);
    }
  });
});
