// Regression Lock: QA adversarial 2026-05-12
// Class: C (Negative in positive domain) | Severity: HIGH
// Finding: F-03 — Negative platformCostUsdPerVoyage causes negative ROI
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { getRoiSummary } from '@/lib/analytics/roi-metrics';

describe('regression gamma-18-F03: negative platformCostUsdPerVoyage must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => {
    db.close();
  });

  it('getRoiSummary must reject negative platformCostUsdPerVoyage', () => {
    // ATTACK: Negative cost (negative ROI multiple = misleading)
    expect(() => getRoiSummary(db, -99, 90)).toThrow(RangeError);
    expect(() => getRoiSummary(db, -99, 90)).toThrow(/platformCostUsdPerVoyage cannot be negative/);
  });

  it('getRoiSummary must reject -0.01 platformCostUsdPerVoyage', () => {
    expect(() => getRoiSummary(db, -0.01, 90)).toThrow(RangeError);
  });
});
