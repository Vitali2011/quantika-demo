#!/usr/bin/env tsx
/**
 * Daily bunker price refresh cron script (BP-01)
 *
 * Orchestrates USDA (primary) + Ship&Bunker (fallback/cross-check) + BunkerIndex (VLSFO+MGO, NLRTM/SGSIN/AEFJR).
 * Each source is tracked independently in knowledge_sync_log.
 *
 * Exit code 0 if at least one source succeeded; exit 1 if all failed.
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-bunker.ts
 */

import { getStore } from '@/lib/session-store';
import {
  reportSyncStarted,
  reportSyncSuccess,
  reportSyncFailure,
} from '@/lib/knowledge/governance';
import { refreshUsdaBunker } from '@/lib/knowledge/bunker/usda-adapter';
import { refreshShipAndBunker } from '@/lib/knowledge/bunker/shipandbunker-adapter';
import { refreshBunkerIndex } from '@/lib/knowledge/bunker/bunkerindex-adapter';
import type Database from 'better-sqlite3';

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
  const db = getStore().getDb();

  const okUsda = await runOne(db, 'bunker-usda', refreshUsdaBunker);
  const okSnB = await runOne(db, 'bunker-shipandbunker', refreshShipAndBunker);
  const okBi = await runOne(db, 'bunker-bunkerindex', refreshBunkerIndex);

  process.exit(okUsda || okSnB || okBi ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[refresh-bunker] Fatal error:', e);
    process.exit(1);
  });
}
