// Regression Lock: QA adversarial 2026-05-12
// Class: C (Negative in positive domain) | Severity: MEDIUM
// Finding: F-08 — Negative months in getCohortData causes invalid query
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { getCohortData } from '@/lib/analytics/roi-metrics';

describe('regression gamma-18-F08: negative months in getCohortData must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => {
    db.close();
  });

  it('getCohortData must reject negative months', () => {
    // ATTACK: Negative months (invalid lookback period)
    expect(() => getCohortData(db, -3)).toThrow(RangeError);
    expect(() => getCohortData(db, -3)).toThrow(/months cannot be negative/);
  });

  it('getCohortData must reject NaN months', () => {
    expect(() => getCohortData(db, NaN)).toThrow(RangeError);
    expect(() => getCohortData(db, NaN)).toThrow(/months must be finite/);
  });

  it('getCohortData must return empty array for 0 months', () => {
    // Per spec:186-188, 0 months returns []
    const result = getCohortData(db, 0);
    expect(result).toEqual([]);
  });
});
