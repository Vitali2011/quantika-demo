#!/usr/bin/env tsx
/**
 * Daily EUA (EU Allowance) price refresh cron script (BP-02)
 *
 * Primary:  EEX auction CSV (eex-auction)
 * Fallback: ICAP ETS prices (icap) — activated when EEX fails OR last price > 3 days old
 *
 * Exit 0: at least one price obtained (EEX or ICAP).
 * Exit 1: both sources failed.
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-eua.ts
 */

import { getStore } from '@/lib/session-store';
import { reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '@/lib/knowledge/governance';
import { refreshEex } from '@/lib/knowledge/eua/eex-adapter';
import { refreshIcap } from '@/lib/knowledge/eua/icap-adapter';

const CRON_NAME = 'eua-daily';
const FALLBACK_THRESHOLD_DAYS = 3;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(dateA: string, dateB: string): number {
  const msA = new Date(dateA).getTime();
  const msB = new Date(dateB).getTime();
  return Math.abs(msA - msB) / (1000 * 60 * 60 * 24);
}

export async function main(): Promise<void> {
  console.log(`[${CRON_NAME}] Starting EUA price refresh...`);

  const store = getStore();
  const db = store.getDb();

  let eexOk = false;
  let eexPriceDate: string | null = null;

  // --- EEX (primary) ---
  const eexId = reportSyncStarted(db, 'eua-eex');
  try {
    console.log('[EEX] Fetching auction results from EEX hub...');
    const r = await refreshEex(db);
    if (!r) { reportSyncFailure(db, eexId, new Error('EEX XLSX parse failed — null result')); console.warn('[EEX] ✗ Null result — structure changed'); return; }
    eexPriceDate = r.priceDate;
    reportSyncSuccess(db, eexId, { rowsChanged: r.rowsChanged });
    eexOk = true;
    console.log(`[EEX] ✓ Done: price=${r.price} date=${r.priceDate}`);
  } catch (e) {
    reportSyncFailure(db, eexId, e as Error);
    console.error('[EEX] ✗ Failed:', e);
  }

  // --- ICAP fallback ---
  const needFallback =
    !eexOk ||
    (eexPriceDate !== null && daysBetween(eexPriceDate, today()) > FALLBACK_THRESHOLD_DAYS);

  let icapOk = false;
  if (needFallback) {
    const icapId = reportSyncStarted(db, 'eua-icap');
    try {
      console.log('[ICAP] Fetching ETS prices from ICAP (fallback)...');
      const r = await refreshIcap(db);
      if (!r) { reportSyncFailure(db, icapId, new Error('ICAP parse failed — null result')); console.warn('[ICAP] ✗ Null result — API blocked or structure changed'); }
      else { reportSyncSuccess(db, icapId, { rowsChanged: r.rowsChanged }); icapOk = true; console.log(`[ICAP] ✓ Done: price=${r.price} date=${r.priceDate}`); }
    } catch (e) {
      reportSyncFailure(db, icapId, e as Error);
      console.error('[ICAP] ✗ Failed:', e);
    }
  }

  const success = eexOk || icapOk;
  console.log(
    `[${CRON_NAME}] ${success ? '✓ Completed successfully' : '✗ All sources failed'}`
  );
  process.exit(success ? 0 : 1);
}

// Only run when executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`[${CRON_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}
