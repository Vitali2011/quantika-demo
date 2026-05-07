// Regression Lock: QA adversarial 2026-05-06
// Class: B (special floats) | Severity: HIGH
// Finding: HIGH-02 — NaN in cost fields accepted
// Spec: spec-01
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { seedPortDa, type BaselinePort } from '@/scripts/seed-port-da';

describe('regression spec01-HIGH02: NaN in cost fields must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => db.close());

  it('seedPortDa must reject baseline with NaN port_dues_usd', async () => {
    const baseline: BaselinePort[] = [{
      port_code: 'TEST',
      port_name: 'Test Port',
      brackets: [{
        vessel_dwt_min: 10000,
        vessel_dwt_max: 50000,
        port_dues_usd: NaN, // ATTACK: special float
        pilotage_usd: 500,
        tugs_usd: 300,
        stevedoring_usd_per_mt: 10,
        cargo_type: 'general',
        confidence: 'verified',
        source: 'test',
      }],
    }];

    const mockLlm = jest.fn();

    // EXPECTED: Should reject or coerce to NULL/0
    // ACTUAL (if bug exists): Stores NaN → NaN >= 0.5 = false → unintended branch
    await seedPortDa(db, baseline, mockLlm);

    const row = db.prepare('SELECT port_dues_usd FROM port_da_estimates WHERE port_code = ?').get('TEST') as any;
    
    // Assertion: port_dues_usd must be a valid number (not NaN)
    expect(Number.isNaN(row.port_dues_usd)).toBe(false);
  });

  it('seedPortDa must reject baseline with Infinity stevedoring_usd_per_mt', async () => {
    const baseline: BaselinePort[] = [{
      port_code: 'TEST2',
      port_name: 'Test Port 2',
      brackets: [{
        vessel_dwt_min: 10000,
        vessel_dwt_max: 50000,
        port_dues_usd: 1000,
        pilotage_usd: 500,
        tugs_usd: 300,
        stevedoring_usd_per_mt: Infinity, // ATTACK: special float
        cargo_type: 'general',
        confidence: 'verified',
        source: 'test',
      }],
    }];

    const mockLlm = jest.fn();

    await seedPortDa(db, baseline, mockLlm);

    const row = db.prepare('SELECT stevedoring_usd_per_mt FROM port_da_estimates WHERE port_code = ?').get('TEST2') as any;
    
    // Assertion: must be finite
    expect(Number.isFinite(row.stevedoring_usd_per_mt)).toBe(true);
  });
});
