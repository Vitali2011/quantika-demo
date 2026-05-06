// Regression Lock: QA adversarial 2026-05-06
// Class: C (negative in positive domain) | Severity: HIGH
// Finding: HIGH-05 — negative vessel_dwt_min accepted
// Spec: spec-01
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { seedPortDa, type BaselinePort } from '@/scripts/seed-port-da';

describe('regression spec01-HIGH05: negative vessel_dwt_min must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => db.close());

  it('seedPortDa must reject baseline with negative vessel_dwt_min', async () => {
    const baseline: BaselinePort[] = [{
      port_code: 'TEST',
      port_name: 'Test Port',
      brackets: [{
        vessel_dwt_min: -10000, // ATTACK: negative DWT
        vessel_dwt_max: 50000,
        port_dues_usd: 1000,
        pilotage_usd: 500,
        tugs_usd: 300,
        stevedoring_usd_per_mt: 10,
        cargo_type: 'general',
        confidence: 'verified',
        source: 'test',
      }],
    }];

    const mockLlm = jest.fn();

    // EXPECTED: Should reject or sanitize negative DWT
    // ACTUAL (if bug exists): Inserts -10000 → query `WHERE vessel_dwt >= -10000` matches invalid results
    await seedPortDa(db, baseline, mockLlm);

    const row = db.prepare('SELECT vessel_dwt_min FROM port_da_estimates WHERE port_code = ?').get('TEST') as any;
    
    // Assertion: vessel_dwt_min must be > 0 (ships have positive displacement)
    expect(row.vessel_dwt_min).toBeGreaterThan(0);
  });

  it('seedPortDa must reject baseline with vessel_dwt_max < vessel_dwt_min', async () => {
    const baseline: BaselinePort[] = [{
      port_code: 'TEST2',
      port_name: 'Test Port 2',
      brackets: [{
        vessel_dwt_min: 80000,
        vessel_dwt_max: 50000, // ATTACK: max < min
        port_dues_usd: 1000,
        pilotage_usd: 500,
        tugs_usd: 300,
        stevedoring_usd_per_mt: 10,
        cargo_type: 'general',
        confidence: 'verified',
        source: 'test',
      }],
    }];

    const mockLlm = jest.fn();

    await seedPortDa(db, baseline, mockLlm);

    const row = db.prepare('SELECT vessel_dwt_min, vessel_dwt_max FROM port_da_estimates WHERE port_code = ?').get('TEST2') as any;
    
    // Assertion: max >= min (valid range)
    expect(row.vessel_dwt_max).toBeGreaterThanOrEqual(row.vessel_dwt_min);
  });
});
