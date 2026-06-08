import type Database from 'better-sqlite3';
import { getLatestBalticIndex } from '@/lib/market/baltic-repository';

/**
 * Per-vessel-class Baltic timecharter day-rate codes ($/day) — see migration 039.
 * Distinct from the index-POINTS codes (BHSI/BSI/…) which are a different unit.
 */
export type BalticTcCode = 'BHSI_TC' | 'BSI_TC' | 'BPI_TC';

export interface BalticDayRate {
  usdPerDay: number;
  date: string;
  indexCode: string;
  /** Source identifier from the DB row (e.g. 'static-seed'). Used for staleness labelling. */
  source: string;
}

/**
 * Map a vessel DWT to its Baltic class day-rate code (brief's class mapping):
 *   < 45,000          → BHSI_TC (handysize / handymax)
 *   45,000 – 69,999   → BSI_TC  (supramax / ultramax)
 *   ≥ 70,000          → BPI_TC  (panamax+)
 */
export function balticIndexCodeForDwt(dwt: number): BalticTcCode {
  if (dwt < 45000) return 'BHSI_TC';
  if (dwt < 70000) return 'BSI_TC';
  return 'BPI_TC';
}

/**
 * Resolve the latest per-class Baltic timecharter day-rate for a vessel DWT.
 * Panamax falls back to BSI_TC when BPI_TC is unavailable (brief). Returns null
 * when no positive day-rate row exists — or, defensively, when the baltic_indices
 * table is absent (so callers whose DB never ran migration 019/039 just skip tier-2
 * rather than throw).
 */
export function getBalticDayRate(db: Database.Database, dwt: number): BalticDayRate | null {
  const primary = balticIndexCodeForDwt(dwt);
  const codes: BalticTcCode[] = primary === 'BPI_TC' ? ['BPI_TC', 'BSI_TC'] : [primary];
  try {
    for (const code of codes) {
      const row = getLatestBalticIndex(db, code);
      if (row && Number.isFinite(row.value) && row.value > 0) {
        return { usdPerDay: row.value, date: row.price_date, indexCode: row.index_code, source: row.source };
      }
    }
    return null;
  } catch {
    // baltic_indices table missing (e.g. a minimal test DB) — skip tier-2 cleanly.
    return null;
  }
}
