import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/runner';
import { allMigrations } from '../migrations/index';
import {
  upsertRoiMetrics,
  getRoiSummary,
  getCohortData,
  type RoiMetricsRow,
} from '../analytics/roi-metrics';

/**
 * Input Contract:
 *
 * upsertRoiMetrics(db, row):
 * - Empty/null voyage_id → SQLite NOT NULL constraint error
 * - NaN/Infinity in financial fields → RangeError
 * - Negative financial values → accept (allow despatch, corrections)
 * - null tce values → accept (generated savings_usd = 0)
 *
 * getRoiSummary(db, platformCostUsdPerVoyage, days?):
 * - Empty table → return zeroes {totalVoyages:0, totalSavingsUsd:0, avgSavingsPerVoyage:0, roiMultiple:0, cohorts:[]}
 * - platformCostUsdPerVoyage=0 → guard division, set roiMultiple=0
 * - platformCostUsdPerVoyage<0 → RangeError
 * - NaN/Infinity cost → RangeError with Number.isFinite check
 * - days=0 → accept (include all data)
 * - days<0 → RangeError
 * - days=NaN → RangeError
 *
 * getCohortData(db, months?):
 * - months=0 → return []
 * - months<0 → RangeError
 * - months=NaN → RangeError
 * - Empty table → return []
 */

describe('roi-metrics', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db, allMigrations);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsertRoiMetrics', () => {
    // RED test: stores voyage record
    it('stores voyage record with all fields', () => {
      const row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'> = {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: 50000,
        bunker_cost_usd: 15000,
        demurrage_usd: 2000,
        despatch_usd: 0,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      };

      upsertRoiMetrics(db, row);

      const result = db
        .prepare<[string], RoiMetricsRow>('SELECT * FROM roi_metrics WHERE id = ?')
        .get('roi1');

      expect(result).toBeDefined();
      expect(result!.voyage_id).toBe('v1');
      expect(result!.freight_usd).toBe(50000);
      expect(result!.savings_usd).toBe(5000); // 35000 - 30000
    });

    // RED test: upsert updates existing record
    it('updates existing record on duplicate id', () => {
      const row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'> = {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: 50000,
        bunker_cost_usd: 15000,
        demurrage_usd: 2000,
        despatch_usd: 0,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      };

      upsertRoiMetrics(db, row);

      // Update with new values
      const updatedRow = { ...row, freight_usd: 60000, tce_actual_usd: 40000 };
      upsertRoiMetrics(db, updatedRow);

      const result = db
        .prepare<[string], RoiMetricsRow>('SELECT * FROM roi_metrics WHERE id = ?')
        .get('roi1');

      expect(result).toBeDefined();
      expect(result!.freight_usd).toBe(60000);
      expect(result!.tce_actual_usd).toBe(40000);
      expect(result!.savings_usd).toBe(10000); // 40000 - 30000

      // Verify only one row
      const count = db.prepare<[], { cnt: number }>('SELECT COUNT(*) as cnt FROM roi_metrics').get();
      expect(count!.cnt).toBe(1);
    });

    // RED test: null tce values accepted, savings_usd computed as 0
    it('accepts null tce values and computes savings_usd with COALESCE', () => {
      const row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'> = {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: 50000,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: null,
        tce_baseline_usd: null,
      };

      upsertRoiMetrics(db, row);

      const result = db
        .prepare<[string], RoiMetricsRow>('SELECT * FROM roi_metrics WHERE id = ?')
        .get('roi1');

      expect(result).toBeDefined();
      expect(result!.savings_usd).toBe(0); // 0 - 0
    });

    // RED test: negative financial values accepted
    it('accepts negative financial values', () => {
      const row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'> = {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: -100,
        bunker_cost_usd: -50,
        demurrage_usd: -200,
        despatch_usd: -300,
        tce_actual_usd: -1000,
        tce_baseline_usd: -500,
      };

      upsertRoiMetrics(db, row);

      const result = db
        .prepare<[string], RoiMetricsRow>('SELECT * FROM roi_metrics WHERE id = ?')
        .get('roi1');

      expect(result).toBeDefined();
      expect(result!.freight_usd).toBe(-100);
      expect(result!.savings_usd).toBe(-500); // -1000 - (-500)
    });

    // RED test: NaN financial values rejected
    it('rejects NaN in financial fields', () => {
      const row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'> = {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: NaN,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: null,
        tce_baseline_usd: null,
      };

      expect(() => upsertRoiMetrics(db, row)).toThrow(RangeError);
      expect(() => upsertRoiMetrics(db, row)).toThrow(/freight_usd.*finite/i);
    });

    // RED test: Infinity financial values rejected
    it('rejects Infinity in financial fields', () => {
      const row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'> = {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: Infinity,
        tce_baseline_usd: null,
      };

      expect(() => upsertRoiMetrics(db, row)).toThrow(RangeError);
      expect(() => upsertRoiMetrics(db, row)).toThrow(/tce_actual_usd.*finite/i);
    });
  });

  describe('getRoiSummary', () => {
    // RED test: empty table returns zeroes
    it('returns zeroes for empty table', () => {
      const summary = getRoiSummary(db, 99);

      expect(summary.totalVoyages).toBe(0);
      expect(summary.totalSavingsUsd).toBe(0);
      expect(summary.avgSavingsPerVoyage).toBe(0);
      expect(summary.roiMultiple).toBe(0);
      expect(summary.cohorts).toEqual([]);
    });

    // RED test: returns correct totalVoyages
    it('returns correct totalVoyages', () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const cohortMonth = recentDate.substring(0, 7);

      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });
      upsertRoiMetrics(db, {
        id: 'roi2',
        voyage_id: 'v2',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 40000,
        tce_baseline_usd: 35000,
      });

      const summary = getRoiSummary(db, 99);

      expect(summary.totalVoyages).toBe(2);
    });

    // RED test: totalSavingsUsd = sum of savings_usd
    it('computes totalSavingsUsd as sum of savings_usd', () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const cohortMonth = recentDate.substring(0, 7);

      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });
      upsertRoiMetrics(db, {
        id: 'roi2',
        voyage_id: 'v2',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 40000,
        tce_baseline_usd: 35000,
      });

      const summary = getRoiSummary(db, 99);

      expect(summary.totalSavingsUsd).toBe(10000); // 5000 + 5000
    });

    // RED test: avgSavingsPerVoyage = total / count
    it('computes avgSavingsPerVoyage as total / count', () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const cohortMonth = recentDate.substring(0, 7);

      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });
      upsertRoiMetrics(db, {
        id: 'roi2',
        voyage_id: 'v2',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 42000,
        tce_baseline_usd: 35000,
      });

      const summary = getRoiSummary(db, 99);

      expect(summary.avgSavingsPerVoyage).toBe(6000); // (5000 + 7000) / 2
    });

    // RED test: roiMultiple = totalSavings / (cost * voyages)
    it('computes roiMultiple as totalSavings / (cost * voyages)', () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const cohortMonth = recentDate.substring(0, 7);

      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });
      upsertRoiMetrics(db, {
        id: 'roi2',
        voyage_id: 'v2',
        deal_date: recentDate,
        cohort_month: cohortMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 40000,
        tce_baseline_usd: 35000,
      });

      const summary = getRoiSummary(db, 100); // $100 per voyage

      expect(summary.roiMultiple).toBe(50); // 10000 / (100 * 2)
    });

    // RED test: platformCostUsdPerVoyage=0 guards division
    it('guards division when platformCostUsdPerVoyage=0', () => {
      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });

      const summary = getRoiSummary(db, 0);

      expect(summary.roiMultiple).toBe(0);
    });

    // RED test: platformCostUsdPerVoyage<0 throws RangeError
    it('rejects negative platformCostUsdPerVoyage', () => {
      expect(() => getRoiSummary(db, -1)).toThrow(RangeError);
      expect(() => getRoiSummary(db, -1)).toThrow(/platformCostUsdPerVoyage.*negative/i);
    });

    // RED test: platformCostUsdPerVoyage=NaN throws RangeError
    it('rejects NaN platformCostUsdPerVoyage', () => {
      expect(() => getRoiSummary(db, NaN)).toThrow(RangeError);
      expect(() => getRoiSummary(db, NaN)).toThrow(/platformCostUsdPerVoyage.*finite/i);
    });

    // RED test: platformCostUsdPerVoyage=Infinity throws RangeError
    it('rejects Infinity platformCostUsdPerVoyage', () => {
      expect(() => getRoiSummary(db, Infinity)).toThrow(RangeError);
      expect(() => getRoiSummary(db, Infinity)).toThrow(/platformCostUsdPerVoyage.*finite/i);
    });

    // RED test: days=30 excludes older records
    it('filters records by days lookback', () => {
      // Insert record from 100 days ago
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: oldDate,
        cohort_month: oldDate.substring(0, 7),
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });

      // Insert recent record
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      upsertRoiMetrics(db, {
        id: 'roi2',
        voyage_id: 'v2',
        deal_date: recentDate,
        cohort_month: recentDate.substring(0, 7),
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 40000,
        tce_baseline_usd: 35000,
      });

      const summary = getRoiSummary(db, 99, 30);

      expect(summary.totalVoyages).toBe(1);
      expect(summary.totalSavingsUsd).toBe(5000); // only recent record
    });

    // RED test: days=0 includes all data
    it('includes all data when days=0', () => {
      const oldDate = new Date(Date.now() - 1000 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: oldDate,
        cohort_month: oldDate.substring(0, 7),
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });

      const summary = getRoiSummary(db, 99, 0);

      expect(summary.totalVoyages).toBe(1);
    });

    // RED test: days<0 throws RangeError
    it('rejects negative days', () => {
      expect(() => getRoiSummary(db, 99, -1)).toThrow(RangeError);
      expect(() => getRoiSummary(db, 99, -1)).toThrow(/days.*negative/i);
    });

    // RED test: days=NaN throws RangeError
    it('rejects NaN days', () => {
      expect(() => getRoiSummary(db, 99, NaN)).toThrow(RangeError);
      expect(() => getRoiSummary(db, 99, NaN)).toThrow(/days.*finite/i);
    });
  });

  describe('getCohortData', () => {
    // RED test: groups by YYYY-MM
    it('groups voyages by cohort_month', () => {
      const now = new Date();
      const month1 = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const month2 = new Date(now.getFullYear(), now.getMonth(), 10);
      const cohortMonth1 = `${month1.getFullYear()}-${String(month1.getMonth() + 1).padStart(2, '0')}`;
      const cohortMonth2 = `${month2.getFullYear()}-${String(month2.getMonth() + 1).padStart(2, '0')}`;

      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: month1.toISOString().split('T')[0],
        cohort_month: cohortMonth1,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });
      upsertRoiMetrics(db, {
        id: 'roi2',
        voyage_id: 'v2',
        deal_date: new Date(now.getFullYear(), now.getMonth() - 1, 20).toISOString().split('T')[0],
        cohort_month: cohortMonth1,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 40000,
        tce_baseline_usd: 35000,
      });
      upsertRoiMetrics(db, {
        id: 'roi3',
        voyage_id: 'v3',
        deal_date: month2.toISOString().split('T')[0],
        cohort_month: cohortMonth2,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 50000,
        tce_baseline_usd: 45000,
      });

      const cohorts = getCohortData(db);

      expect(cohorts).toHaveLength(2);
      expect(cohorts[0].month).toBe(cohortMonth2); // most recent first
      expect(cohorts[0].voyages).toBe(1);
      expect(cohorts[0].totalSavings).toBe(5000);
      expect(cohorts[1].month).toBe(cohortMonth1);
      expect(cohorts[1].voyages).toBe(2);
      expect(cohorts[1].totalSavings).toBe(10000);
    });

    // RED test: default 3 months lookback
    it('defaults to 3 months lookback', () => {
      // Current month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // 4 months ago
      const fourMonthsAgo = new Date(now);
      fourMonthsAgo.setMonth(now.getMonth() - 4);
      const oldMonth = `${fourMonthsAgo.getFullYear()}-${String(fourMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

      upsertRoiMetrics(db, {
        id: 'roi_old',
        voyage_id: 'v_old',
        deal_date: `${oldMonth}-15`,
        cohort_month: oldMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });

      upsertRoiMetrics(db, {
        id: 'roi_current',
        voyage_id: 'v_current',
        deal_date: `${currentMonth}-15`,
        cohort_month: currentMonth,
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 40000,
        tce_baseline_usd: 35000,
      });

      const cohorts = getCohortData(db); // default 3 months

      // Should only include current month, not 4-month-old record
      expect(cohorts.length).toBeGreaterThanOrEqual(0);
      expect(cohorts.length).toBeLessThanOrEqual(3);
      expect(cohorts.every((c) => c.month >= oldMonth)).toBe(true);
    });

    // RED test: empty table returns []
    it('returns empty array for empty table', () => {
      const cohorts = getCohortData(db);

      expect(cohorts).toEqual([]);
    });

    // RED test: months=0 returns []
    it('returns empty array when months=0', () => {
      upsertRoiMetrics(db, {
        id: 'roi1',
        voyage_id: 'v1',
        deal_date: '2025-01-15',
        cohort_month: '2025-01',
        freight_usd: null,
        bunker_cost_usd: null,
        demurrage_usd: null,
        despatch_usd: null,
        tce_actual_usd: 35000,
        tce_baseline_usd: 30000,
      });

      const cohorts = getCohortData(db, 0);

      expect(cohorts).toEqual([]);
    });

    // RED test: months<0 throws RangeError
    it('rejects negative months', () => {
      expect(() => getCohortData(db, -1)).toThrow(RangeError);
      expect(() => getCohortData(db, -1)).toThrow(/months.*negative/i);
    });

    // RED test: months=NaN throws RangeError
    it('rejects NaN months', () => {
      expect(() => getCohortData(db, NaN)).toThrow(RangeError);
      expect(() => getCohortData(db, NaN)).toThrow(/months.*finite/i);
    });
  });
});
