// Regression Lock: QA adversarial 2026-05-06
// Class: C (negative in positive domain) | Severity: HIGH
// Finding: HIGH-01 — negative port_dues_usd accepted
// Spec: spec-01
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { seedPortDa, type BaselinePort } from '@/scripts/seed-port-da';

describe('regression spec01-HIGH01: negative port_dues_usd must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => db.close());

  it('seedPortDa must reject baseline with negative port_dues_usd', async () => {
    const baseline: BaselinePort[] = [{
      port_code: 'TEST',
      port_name: 'Test Port',
      brackets: [{
        vessel_dwt_min: 10000,
        vessel_dwt_max: 50000,
        port_dues_usd: -1000, // ATTACK: negative cost
        pilotage_usd: 500,
        tugs_usd: 300,
        stevedoring_usd_per_mt: 10,
        cargo_type: 'general',
        confidence: 'verified',
        source: 'test',
      }],
    }];

    // Mock LLM caller to prevent external API calls
    const mockLlm = jest.fn();

    // EXPECTED: Should reject or sanitize negative value
    // ACTUAL (if bug exists): Inserts -1000 → negative cost calculations
    await seedPortDa(db, baseline, mockLlm);

    const row = db.prepare('SELECT port_dues_usd FROM port_da_estimates WHERE port_code = ?').get('TEST') as any;
    
    // Assertion: port_dues_usd must be >= 0
    expect(row.port_dues_usd).toBeGreaterThanOrEqual(0);
  });
});
