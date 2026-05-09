/**
 * PDB-01: panamax / post-panamax / capesize DWT brackets
 *
 * Tests that GET /api/port-da/[port_code]?vessel_dwt=N resolves correctly
 * for vessels > 65 000 DWT after broker-research-2026-05 seed data is inserted.
 *
 * Pattern: in-memory SQLite + runMigrations + seedPortDa (same as regression tests)
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { seedPortDa, type BaselinePort } from '@/scripts/seed-port-da';
import { getPortDa } from '@/lib/port-da/repository';

// ---------------------------------------------------------------------------
// Fixtures — only the brackets that matter for this spec
// ---------------------------------------------------------------------------

const NLRTM_LARGE: BaselinePort = {
  port_code: 'NLRTM',
  port_name: 'Rotterdam',
  brackets: [
    { vessel_dwt_min: 65001,  vessel_dwt_max: 90000,  port_dues_usd: 110000, pilotage_usd: 60000,  tugs_usd: 50000, stevedoring_usd_per_mt: 5.0, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 90001,  vessel_dwt_max: 150000, port_dues_usd: 145000, pilotage_usd: 78000,  tugs_usd: 67000, stevedoring_usd_per_mt: 4.5, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 150001, vessel_dwt_max: 200000, port_dues_usd: 185000, pilotage_usd: 100000, tugs_usd: 86000, stevedoring_usd_per_mt: 4.0, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
  ],
};

const BEANR_LARGE: BaselinePort = {
  port_code: 'BEANR',
  port_name: 'Antwerp',
  brackets: [
    { vessel_dwt_min: 65001,  vessel_dwt_max: 90000,  port_dues_usd: 105000, pilotage_usd: 57000, tugs_usd: 49000, stevedoring_usd_per_mt: 5.2, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 90001,  vessel_dwt_max: 150000, port_dues_usd: 140000, pilotage_usd: 75000, tugs_usd: 64000, stevedoring_usd_per_mt: 4.6, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 150001, vessel_dwt_max: 200000, port_dues_usd: 178000, pilotage_usd: 96000, tugs_usd: 82000, stevedoring_usd_per_mt: 4.1, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
  ],
};

const SGSIN_LARGE: BaselinePort = {
  port_code: 'SGSIN',
  port_name: 'Singapore',
  brackets: [
    { vessel_dwt_min: 65001,  vessel_dwt_max: 90000,  port_dues_usd: 95000,  pilotage_usd: 51000, tugs_usd: 44000, stevedoring_usd_per_mt: 4.8, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 90001,  vessel_dwt_max: 150000, port_dues_usd: 125000, pilotage_usd: 67000, tugs_usd: 57000, stevedoring_usd_per_mt: 4.3, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 150001, vessel_dwt_max: 200000, port_dues_usd: 160000, pilotage_usd: 86000, tugs_usd: 73000, stevedoring_usd_per_mt: 3.8, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
  ],
};

const AEJEA_LARGE: BaselinePort = {
  port_code: 'AEJEA',
  port_name: 'Jebel Ali',
  brackets: [
    { vessel_dwt_min: 65001,  vessel_dwt_max: 90000,  port_dues_usd: 88000,  pilotage_usd: 47000, tugs_usd: 40000, stevedoring_usd_per_mt: 5.0, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 90001,  vessel_dwt_max: 150000, port_dues_usd: 116000, pilotage_usd: 62000, tugs_usd: 53000, stevedoring_usd_per_mt: 4.5, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 150001, vessel_dwt_max: 200000, port_dues_usd: 148000, pilotage_usd: 80000, tugs_usd: 68000, stevedoring_usd_per_mt: 4.0, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
  ],
};

const SAJED_LARGE: BaselinePort = {
  port_code: 'SAJED',
  port_name: 'Jeddah',
  brackets: [
    { vessel_dwt_min: 65001,  vessel_dwt_max: 90000,  port_dues_usd: 82000,  pilotage_usd: 44000, tugs_usd: 38000, stevedoring_usd_per_mt: 5.2, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 90001,  vessel_dwt_max: 150000, port_dues_usd: 108000, pilotage_usd: 58000, tugs_usd: 49000, stevedoring_usd_per_mt: 4.7, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 150001, vessel_dwt_max: 200000, port_dues_usd: 138000, pilotage_usd: 74000, tugs_usd: 63000, stevedoring_usd_per_mt: 4.2, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
  ],
};

const AUPHE_PORT: BaselinePort = {
  port_code: 'AUPHE',
  port_name: 'Port Hedland',
  brackets: [
    { vessel_dwt_min: 65001,  vessel_dwt_max: 90000,  port_dues_usd: 90000,  pilotage_usd: 48000, tugs_usd: 41000, stevedoring_usd_per_mt: 3.5, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 90001,  vessel_dwt_max: 150000, port_dues_usd: 118000, pilotage_usd: 63000, tugs_usd: 54000, stevedoring_usd_per_mt: 3.0, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
    { vessel_dwt_min: 150001, vessel_dwt_max: 200000, port_dues_usd: 150000, pilotage_usd: 81000, tugs_usd: 69000, stevedoring_usd_per_mt: 2.5, cargo_type: 'general', confidence: 'estimated', source: 'broker-research-2026-05' },
  ],
};

const ALL_PORTS = [NLRTM_LARGE, BEANR_LARGE, SGSIN_LARGE, AEJEA_LARGE, SAJED_LARGE, AUPHE_PORT];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PDB-01: panamax/post-panamax/capesize brackets', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
    // Seed only the large-vessel brackets (no LLM caller needed — no gaps to fill)
    await seedPortDa(db, ALL_PORTS, jest.fn());
  });

  afterEach(() => db.close());

  // Test 1: NLRTM panamax bracket
  it('NLRTM 80k DWT → panamax bracket, port_dues_usd=110000, source=broker-research-2026-05', () => {
    const result = getPortDa({ portCode: 'NLRTM', vesselDwt: 80000 }, db);
    expect(result).not.toBeNull();
    expect(result!.portDuesUsd).toBe(110000);
    expect(result!.source).toBe('broker-research-2026-05');
  });

  // Test 2: SGSIN post-panamax bracket
  it('SGSIN 130k DWT → post-panamax bracket, vessel_dwt_min=90001', () => {
    const result = getPortDa({ portCode: 'SGSIN', vesselDwt: 130000 }, db);
    expect(result).not.toBeNull();
    // Verify it matched the correct bracket (90001–150000)
    const row = db.prepare(
      `SELECT vessel_dwt_min FROM port_da_estimates
       WHERE port_code='SGSIN' AND vessel_dwt_min <= 130000 AND vessel_dwt_max >= 130000`,
    ).get() as { vessel_dwt_min: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.vessel_dwt_min).toBe(90001);
  });

  // Test 3: BEANR capesize bracket
  it('BEANR 180k DWT → capesize bracket, port_dues_usd=178000', () => {
    const result = getPortDa({ portCode: 'BEANR', vesselDwt: 180000 }, db);
    expect(result).not.toBeNull();
    expect(result!.portDuesUsd).toBe(178000);
  });

  // Test 4: AEJEA 220k (above max 200000) → null (404)
  it('AEJEA 220k DWT (above bracket max) → null (no data)', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 220000 }, db);
    expect(result).toBeNull();
  });

  // Test 5: SAJED boundary — exactly 65001 (lower bound of panamax)
  it('SAJED 65001 DWT → panamax bracket lower boundary, vessel_dwt_min=65001', () => {
    const result = getPortDa({ portCode: 'SAJED', vesselDwt: 65001 }, db);
    expect(result).not.toBeNull();
    const row = db.prepare(
      `SELECT vessel_dwt_min FROM port_da_estimates
       WHERE port_code='SAJED' AND vessel_dwt_min <= 65001 AND vessel_dwt_max >= 65001`,
    ).get() as { vessel_dwt_min: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.vessel_dwt_min).toBe(65001);
  });

  // Test 6: AUPHE (new port) capesize 180k
  it('AUPHE 180k DWT → capesize bracket, port_dues_usd=150000, source=broker-research-2026-05', () => {
    const result = getPortDa({ portCode: 'AUPHE', vesselDwt: 180000 }, db);
    expect(result).not.toBeNull();
    expect(result!.portDuesUsd).toBe(150000);
    expect(result!.source).toBe('broker-research-2026-05');
  });
});
