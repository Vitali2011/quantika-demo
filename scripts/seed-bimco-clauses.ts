#!/usr/bin/env tsx
/**
 * Seed script: populates bimco_fts + bimco_vec with BIMCO charter party clauses.
 *
 * Thin wrapper around syncBimcoRag — uses fixture data (no scraping).
 * Idempotent: truncate=true in adapter means re-runs overwrite, not duplicate.
 *
 * Usage:
 *   npx tsx scripts/seed-bimco-clauses.ts [--dry-run]
 *
 * Spec: F-04
 */

import { getStore } from '@/lib/session-store';
import { syncBimcoRag } from '@/lib/knowledge/sources/bimco/adapter';

async function seed(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const db = getStore().getDb();
  const result = await syncBimcoRag(db, dryRun);
  const prefix = dryRun ? '[DRY RUN] ' : '';
  console.log(`${prefix}BIMCO seed complete: ${result.stored} clauses stored`);
}

seed().catch((err) => {
  console.error('BIMCO seed failed:', err);
  process.exit(1);
});
