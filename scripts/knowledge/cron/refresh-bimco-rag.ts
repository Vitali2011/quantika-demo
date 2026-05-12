#!/usr/bin/env tsx
/**
 * BIMCO RAG refresh cron script.
 *
 * Syncs BIMCO charter party clauses (GENCON 2022, HEAVYCON, PROJECTCON)
 * to bimco_vec (vec0) and bimco_fts (FTS5) tables.
 *
 * Uses fixture data in this version (no real scraping).
 * In production, would scrape bimco.org.
 *
 * Exit 0: clauses synced successfully.
 * Exit 1: sync failed (DB connection, governance, etc.).
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-bimco-rag.ts
 *
 * Spec: gamma-09
 */

import { getStore } from '@/lib/session-store';
import { syncBimcoRag } from '@/lib/knowledge/sources/bimco/adapter';

const CRON_NAME = 'bimco-rag-refresh';

export async function main(): Promise<void> {
  console.log(`[${CRON_NAME}] Starting BIMCO RAG sync...`);

  try {
    const db = getStore().getDb();

    // Sync BIMCO clauses
    const result = await syncBimcoRag(db, false);

    console.log(`[${CRON_NAME}] ✓ Synced ${result.stored} BIMCO clauses to RAG tables`);
    process.exit(0);
  } catch (err) {
    console.error(`[${CRON_NAME}] ✗ Failed:`, err);
    process.exit(1);
  }
}

// Only run when executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`[${CRON_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}
