// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: HIGH
// Finding: F-04 — NaN days parameter causes incorrect date filter
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { getRoiSummary } from '@/lib/analytics/roi-metrics';

describe('regression gamma-18-F04: NaN days parameter must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => {
    db.close();
  });

  it('getRoiSummary must reject NaN days', () => {
    // ATTACK: NaN days (could happen from parseInt on invalid query param)
    expect(() => getRoiSummary(db, 99, NaN)).toThrow(RangeError);
    expect(() => getRoiSummary(db, 99, NaN)).toThrow(/days must be finite/);
  });

  it('getRoiSummary must reject Infinity days', () => {
    expect(() => getRoiSummary(db, 99, Infinity)).toThrow(RangeError);
  });

  it('getRoiSummary must reject negative days', () => {
    // Negative days should be rejected per spec:123-125
    expect(() => getRoiSummary(db, 99, -1)).toThrow(RangeError);
    expect(() => getRoiSummary(db, 99, -1)).toThrow(/days cannot be negative/);
  });
});
