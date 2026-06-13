/**
 * tmi-benchmark-fallback.ts — read the latest TMI value from the DB and
 * return it as a MarketBenchmark when the live scraper is unavailable.
 *
 * Priority:
 *   1. market_indices WHERE index_name='tmi' (demo-seeded rows)
 *   2. baltic_indices WHERE index_code='TOEPFER_TMI' (migration 020 static-seed)
 *
 * Returns null if neither exists. Always sets stale=true (it's a DB fallback,
 * not a fresh fetch).
 */

import type Database from 'better-sqlite3';
import type { MarketBenchmark } from '@/lib/types';

function formatPeriod(isoDate: string): string {
  // '2026-05-09' → 'May 2026'
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function getTmiBenchmarkFromDb(db: Database.Database): MarketBenchmark | null {
  try {
    // 1. Prefer market_indices.tmi (demo-seeded, most recent)
    const miRow = db
      .prepare<[], { value: number; index_date: string }>(
        `SELECT value, index_date FROM market_indices WHERE index_name='tmi' ORDER BY index_date DESC LIMIT 1`,
      )
      .get();

    if (miRow) {
      return {
        indicator: 'TOEPFER_TMI',
        value: miRow.value,
        unit: 'USD/day',
        period: formatPeriod(miRow.index_date),
        sourceUrl: '',
        fetchedAt: miRow.index_date + 'T00:00:00.000Z',
        stale: true,
      };
    }

    // 2. Fall back to baltic_indices TOEPFER_TMI (migration 020 static-seed)
    const biRow = db
      .prepare<[], { value: number; price_date: string }>(
        `SELECT value, price_date FROM baltic_indices WHERE index_code='TOEPFER_TMI' ORDER BY price_date DESC LIMIT 1`,
      )
      .get();

    if (biRow) {
      return {
        indicator: 'TOEPFER_TMI',
        value: biRow.value,
        unit: 'USD/day',
        period: formatPeriod(biRow.price_date),
        sourceUrl: '',
        fetchedAt: biRow.price_date + 'T00:00:00.000Z',
        stale: true,
      };
    }

    return null;
  } catch {
    return null;
  }
}
