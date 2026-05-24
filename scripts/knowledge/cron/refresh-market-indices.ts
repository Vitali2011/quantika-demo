#!/usr/bin/env tsx
/**
 * Market indices refresh cron script
 *
 * BHSI  — fetched daily from handybulk.com (Baltic Handysize Index, USD/day)
 * WCI   — fetched weekly from drewry.co.uk (World Container Index composite, USD/FEU)
 *
 * Exit 0: at least one source succeeded.
 * Exit 1: all sources failed.
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-market-indices.ts
 */

import { getStore } from '@/lib/session-store';
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from '@/lib/knowledge/governance';
import { refreshBhsi } from '@/lib/market/bhsi-adapter';
import { refreshDrewryWci } from '@/lib/market/drewry-adapter';
import type Database from 'better-sqlite3';

const CRON_NAME = 'market-indices-refresh';

async function runOne(
  db: Database.Database,
  slug: string,
  fn: (db: Database.Database) => Promise<{ rowsChanged: number }>,
): Promise<boolean> {
  const id = reportSyncStarted(db, slug);
  try {
    const r = await fn(db);
    reportSyncSuccess(db, id, { rowsChanged: r.rowsChanged });
    console.log(`[${slug}] ✓ rowsChanged=${r.rowsChanged}`);
    return true;
  } catch (e) {
    reportSyncFailure(db, id, e as Error);
    console.error(`[${slug}] ✗ Failed:`, (e as Error).message);
    return false;
  }
}

export async function main(): Promise<void> {
  console.log(`[${CRON_NAME}] Starting market indices refresh...`);

  const db = getStore().getDb();

  const okBhsi = await runOne(db, 'market-bhsi', (d) => refreshBhsi(d));
  const okDrewry = await runOne(db, 'market-drewry-wci', (d) => refreshDrewryWci(d));

  const success = okBhsi || okDrewry;
  console.log(
    `[${CRON_NAME}] ${success ? '✓ Completed successfully' : '✗ All sources failed'}`,
  );
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`[${CRON_NAME}] Fatal error:`, e);
    process.exit(1);
  });
}
