// Regression Lock: QA adversarial 2026-05-12
// Class: B (Special floats) | Severity: CRITICAL
// Finding: F-01 — NaN in financial field bypasses validation
// Spec: spec/gamma-18-roi-guarantee-workflow
// DO NOT DELETE — see references/regression_lock_workflow.md

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { upsertRoiMetrics } from '@/lib/analytics/roi-metrics';

describe('regression gamma-18-F01: NaN in financial fields must be rejected', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => {
    db.close();
  });

  it('upsertRoiMetrics must reject NaN in freight_usd', () => {
    // Arrange — NaN in financial field (could happen from parseFloat on invalid input)
    const row = {
      id: 'roi-test-1',
      voyage_id: 'voy-1',
      deal_date: '2026-05-01',
      cohort_month: '2026-05',
      freight_usd: NaN, // ATTACK: NaN value
      bunker_cost_usd: 1000,
      demurrage_usd: null,
      despatch_usd: null,
      tce_actual_usd: 5000,
      tce_baseline_usd: 3000,
    };

    // Act + Assert — must throw RangeError per spec:57-59
    expect(() => upsertRoiMetrics(db, row)).toThrow(RangeError);
    expect(() => upsertRoiMetrics(db, row)).toThrow(/freight_usd must be finite/);
  });

  it('upsertRoiMetrics must reject Infinity in tce_actual_usd', () => {
    const row = {
      id: 'roi-test-2',
      voyage_id: 'voy-2',
      deal_date: '2026-05-01',
      cohort_month: '2026-05',
      freight_usd: 10000,
      bunker_cost_usd: 1000,
      demurrage_usd: null,
      despatch_usd: null,
      tce_actual_usd: Infinity, // ATTACK: Infinity value
      tce_baseline_usd: 3000,
    };

    // Must throw RangeError
    expect(() => upsertRoiMetrics(db, row)).toThrow(RangeError);
    expect(() => upsertRoiMetrics(db, row)).toThrow(/tce_actual_usd must be finite/);
  });

  it('upsertRoiMetrics must reject -Infinity in bunker_cost_usd', () => {
    const row = {
      id: 'roi-test-3',
      voyage_id: 'voy-3',
      deal_date: '2026-05-01',
      cohort_month: '2026-05',
      freight_usd: 10000,
      bunker_cost_usd: -Infinity, // ATTACK: -Infinity
      demurrage_usd: null,
      despatch_usd: null,
      tce_actual_usd: 5000,
      tce_baseline_usd: 3000,
    };

    expect(() => upsertRoiMetrics(db, row)).toThrow(RangeError);
    expect(() => upsertRoiMetrics(db, row)).toThrow(/bunker_cost_usd must be finite/);
  });
});
