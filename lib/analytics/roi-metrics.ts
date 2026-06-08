import type Database from 'better-sqlite3';

export interface RoiSummary {
  totalVoyages: number;
  totalSavingsUsd: number;
  avgSavingsPerVoyage: number;
  roiMultiple: number;
  cohorts: CohortData[];
}

export interface CohortData {
  month: string;
  voyages: number;
  totalSavings: number;
  avgSavings: number;
}

export interface RoiMetricsRow {
  id: string;
  voyage_id: string;
  deal_date: string;
  cohort_month: string;
  freight_usd: number | null;
  bunker_cost_usd: number | null;
  demurrage_usd: number | null;
  despatch_usd: number | null;
  tce_actual_usd: number | null;
  tce_baseline_usd: number | null;
  savings_usd: number;
  created_at: string;
}

/**
 * Upsert voyage metrics into roi_metrics table.
 *
 * Input validation:
 * - NaN/Infinity in financial fields → RangeError
 * - Negative values → allowed (corrections, despatch)
 * - null values → allowed (COALESCE to 0 in generated column)
 */
export function upsertRoiMetrics(
  db: Database.Database,
  row: Omit<RoiMetricsRow, 'savings_usd' | 'created_at'>
): void {
  // Validate financial fields: no NaN/Infinity
  const financialFields: Array<keyof typeof row> = [
    'freight_usd',
    'bunker_cost_usd',
    'demurrage_usd',
    'despatch_usd',
    'tce_actual_usd',
    'tce_baseline_usd',
  ];

  for (const field of financialFields) {
    const value = row[field];
    if (value !== null && !Number.isFinite(value)) {
      throw new RangeError(`${field} must be finite or null`);
    }
  }

  const stmt = db.prepare(`
    INSERT INTO roi_metrics (
      id, voyage_id, deal_date, cohort_month,
      freight_usd, bunker_cost_usd, demurrage_usd, despatch_usd,
      tce_actual_usd, tce_baseline_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      voyage_id = excluded.voyage_id,
      deal_date = excluded.deal_date,
      cohort_month = excluded.cohort_month,
      freight_usd = excluded.freight_usd,
      bunker_cost_usd = excluded.bunker_cost_usd,
      demurrage_usd = excluded.demurrage_usd,
      despatch_usd = excluded.despatch_usd,
      tce_actual_usd = excluded.tce_actual_usd,
      tce_baseline_usd = excluded.tce_baseline_usd
  `);

  stmt.run(
    row.id,
    row.voyage_id,
    row.deal_date,
    row.cohort_month,
    row.freight_usd,
    row.bunker_cost_usd,
    row.demurrage_usd,
    row.despatch_usd,
    row.tce_actual_usd,
    row.tce_baseline_usd
  );
}

/**
 * Calculate ROI summary from roi_metrics table.
 *
 * Input validation:
 * - platformCostUsdPerVoyage < 0 → RangeError
 * - platformCostUsdPerVoyage = NaN/Infinity → RangeError
 * - platformCostUsdPerVoyage = 0 → guard division, set roiMultiple=0
 * - days < 0 → RangeError
 * - days = NaN → RangeError
 * - days = 0 → include all data
 * - Empty table → return zeroes
 */
export function getRoiSummary(
  db: Database.Database,
  platformCostUsdPerVoyage: number,
  days: number = 90
): RoiSummary {
  // Validate platformCostUsdPerVoyage
  if (!Number.isFinite(platformCostUsdPerVoyage)) {
    throw new RangeError('platformCostUsdPerVoyage must be finite');
  }
  if (platformCostUsdPerVoyage < 0) {
    throw new RangeError('platformCostUsdPerVoyage cannot be negative');
  }

  // Validate days
  if (!Number.isFinite(days)) {
    throw new RangeError('days must be finite');
  }
  if (days < 0) {
    throw new RangeError('days cannot be negative');
  }

  // Build query with optional date filter
  let query = `
    SELECT
      COUNT(*) as totalVoyages,
      COALESCE(SUM(savings_usd), 0) as totalSavingsUsd
    FROM roi_metrics
  `;

  const params: any[] = [];

  if (days > 0) {
    query += ` WHERE deal_date >= date('now', '-' || ? || ' days')`;
    params.push(days);
  }

  const result = db.prepare(query).get(...params) as {
    totalVoyages: number;
    totalSavingsUsd: number;
  };

  const totalVoyages = result.totalVoyages;
  const totalSavingsUsd = result.totalSavingsUsd;

  const avgSavingsPerVoyage = totalVoyages > 0 ? totalSavingsUsd / totalVoyages : 0;

  // Guard division by zero
  const totalCost = platformCostUsdPerVoyage * totalVoyages;
  const roiMultiple = totalCost > 0 ? totalSavingsUsd / totalCost : 0;

  // Get cohorts using the same window as totalVoyages (convert days → months)
  const cohortMonths = days === 0 ? 0 : Math.ceil(days / 30);
  const cohorts = getCohortData(db, cohortMonths);

  return {
    totalVoyages,
    totalSavingsUsd,
    avgSavingsPerVoyage,
    roiMultiple,
    cohorts,
  };
}

/**
 * Get cohort breakdown.
 *
 * Input validation:
 * - months < 0 → RangeError
 * - months = NaN → RangeError
 * - months = 0 → return []
 * - Empty table → return []
 */
export function getCohortData(db: Database.Database, months: number = 3): CohortData[] {
  // Validate months
  if (!Number.isFinite(months)) {
    throw new RangeError('months must be finite');
  }
  if (months < 0) {
    throw new RangeError('months cannot be negative');
  }

  if (months === 0) {
    return [];
  }

  // Calculate cutoff date (N months ago)
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffMonth = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;

  const query = `
    SELECT
      cohort_month as month,
      COUNT(*) as voyages,
      COALESCE(SUM(savings_usd), 0) as totalSavings
    FROM roi_metrics
    WHERE cohort_month >= ?
    GROUP BY cohort_month
    ORDER BY cohort_month DESC
  `;

  const rows = db.prepare(query).all(cutoffMonth) as Array<{
    month: string;
    voyages: number;
    totalSavings: number;
  }>;

  return rows.map((row) => ({
    month: row.month,
    voyages: row.voyages,
    totalSavings: row.totalSavings,
    avgSavings: row.voyages > 0 ? row.totalSavings / row.voyages : 0,
  }));
}
