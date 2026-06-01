#!/usr/bin/env tsx
/**
 * Daily EUA (EU Allowance) price refresh cron script (BP-02)
 *
 * Primary:   EEX auction CSV (eex-auction)
 * Fallback:  ICAP ETS prices (icap) — activated when EEX fails OR last price > 3 days old
 * Tertiary:  TradingEconomics HTML scrape — activated when both EEX and ICAP fail
 *
 * Exit 0: at least one price obtained.
 * Exit 1: all sources failed.
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-eua.ts
 */

import { getStore } from '@/lib/session-store';
import { reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '@/lib/knowledge/governance';
import { refreshEex } from '@/lib/knowledge/eua/eex-adapter';
import { refreshIcap } from '@/lib/knowledge/eua/icap-adapter';
import { refreshTradingEconomics } from '@/lib/knowledge/eua/tradingeconomics-adapter';

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

  // --- TradingEconomics tertiary fallback (demo scrape) ---
  let teOk = false;
  if (!eexOk && !icapOk) {
    const teId = reportSyncStarted(db, 'eua-tradingeconomics');
    try {
      console.log('[TE] Fetching EUA price from TradingEconomics (tertiary fallback)...');
      const r = await refreshTradingEconomics(db);
      if (!r) { reportSyncFailure(db, teId, new Error('TE parse failed — null result')); console.warn('[TE] ✗ Null result — page structure changed or out-of-range'); }
      else { reportSyncSuccess(db, teId, { rowsChanged: r.rowsChanged }); teOk = true; console.log(`[TE] ✓ Done: price=${r.price} date=${r.priceDate}`); }
    } catch (e) {
      reportSyncFailure(db, teId, e as Error);
      console.error('[TE] ✗ Failed:', e);
    }
  }

  const success = eexOk || icapOk || teOk;
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
