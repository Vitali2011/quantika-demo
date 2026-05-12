// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: CRITICAL
// Finding: F-02 — NaN platformCostUsdPerVoyage causes incorrect ROI
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { getRoiSummary } from '@/lib/analytics/roi-metrics';

describe('regression gamma-18-F02: NaN platformCostUsdPerVoyage must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => {
    db.close();
  });

  it('getRoiSummary must reject NaN platformCostUsdPerVoyage', () => {
    // ATTACK: NaN cost (could happen from parseFloat on env var)
    expect(() => getRoiSummary(db, NaN, 90)).toThrow(RangeError);
    expect(() => getRoiSummary(db, NaN, 90)).toThrow(/platformCostUsdPerVoyage must be finite/);
  });

  it('getRoiSummary must reject Infinity platformCostUsdPerVoyage', () => {
    expect(() => getRoiSummary(db, Infinity, 90)).toThrow(RangeError);
    expect(() => getRoiSummary(db, Infinity, 90)).toThrow(/platformCostUsdPerVoyage must be finite/);
  });

  it('getRoiSummary must reject -Infinity platformCostUsdPerVoyage', () => {
    expect(() => getRoiSummary(db, -Infinity, 90)).toThrow(RangeError);
  });
});
