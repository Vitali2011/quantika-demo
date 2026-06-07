import Database from 'better-sqlite3';
import { sumMatchPortDaUsd } from '@/lib/port-da/match-da';

// Minimal in-memory port_da_estimates fixture mirroring the seed schema.
// port codes confirmed: resolvePort('constanta')→ROCND, resolvePort('marmara')→TRMAR
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE port_da_estimates (
      port_code TEXT, vessel_dwt_min INTEGER, vessel_dwt_max INTEGER,
      port_dues_usd REAL, pilotage_usd REAL, tugs_usd REAL,
      stevedoring_usd_per_mt REAL, cargo_type TEXT, confidence TEXT, source TEXT
    );
  `);
  const ins = db.prepare(`INSERT INTO port_da_estimates
    (port_code,vessel_dwt_min,vessel_dwt_max,port_dues_usd,pilotage_usd,tugs_usd,
     stevedoring_usd_per_mt,cargo_type,confidence,source) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  // Constanta (ROCND): 10k + 5k + 3k = 18k fixed (cargo_type='bulk' matches lower-cased 'BULK')
  ins.run('ROCND', 0, 100000, 10000, 5000, 3000, 2, 'bulk', 'verified', 'seed');
  // Marmara (TRMAR): 8k + 4k + 2k = 14k fixed
  ins.run('TRMAR', 0, 100000, 8000, 4000, 2000, 2, 'bulk', 'verified', 'seed');
  return db;
}

describe('sumMatchPortDaUsd', () => {
  test('sums totalFixedUsd across both resolvable ports', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['constanta', 'marmara'], 30000, 'bulk', db);
    expect(total).toBe(18000 + 14000);
    db.close();
  });

  test('unknown port contributes 0, known port still counts', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['constanta', 'no-such-port-xyz'], 30000, 'bulk', db);
    expect(total).toBe(18000);
    db.close();
  });

  test('returns 0 when no ports resolve (never crashes, never fakes)', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['no-such-port-xyz', 'also-fake'], 30000, 'bulk', db);
    expect(total).toBe(0);
    db.close();
  });

  test('null/empty port names are skipped', () => {
    const db = makeDb();
    const total = sumMatchPortDaUsd(['constanta', null, ''], 30000, 'bulk', db);
    expect(total).toBe(18000);
    db.close();
  });
});
