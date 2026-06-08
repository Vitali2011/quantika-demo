import Database from 'better-sqlite3';
import { sumMatchPortDaUsd } from '@/lib/port-da/match-da';

// Minimal in-memory port_da_estimates fixture mirroring the seed schema.
// port codes confirmed: resolvePort('constanta')→ROCND, resolvePort('marmara')→TRMAR
//
// RC1 note (2026-06-08): the fixture was previously seeded with cargo_type='bulk'.
// The old test was verifying a code path (passing lowercase cargoType → DB lookup)
// that returned 0 rows against the real 'general'-only seed data, which is the
// exact parity bug.  The fixture is now corrected to cargo_type='general' (matching
// port-da-base.json), and cargoType is passed to sumMatchPortDaUsd but is deliberately
// ignored inside (port infra costs are cargo-agnostic — see match-da.ts comment).
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
  // Constanta (ROCND): 10k + 5k + 3k = 18k fixed (cargo_type='general' — the only
  // type in the real seed; sumMatchPortDaUsd ignores the cargoType argument and
  // resolves against 'general' for parity with the detail route).
  ins.run('ROCND', 0, 100000, 10000, 5000, 3000, 2, 'general', 'verified', 'seed');
  // Marmara (TRMAR): 8k + 4k + 2k = 14k fixed
  ins.run('TRMAR', 0, 100000, 8000, 4000, 2000, 2, 'general', 'verified', 'seed');
  return db;
}

describe('sumMatchPortDaUsd', () => {
  test('sums totalFixedUsd across both resolvable ports', () => {
    const db = makeDb();
    // cargoType='bulk' is accepted in the signature but ignored inside — DA resolves
    // against 'general' rows regardless, matching the detail-route behaviour.
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
