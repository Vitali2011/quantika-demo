#!/usr/bin/env tsx
/**
 * Panama Canal tariff sync script (Phase 1: hardcoded, Phase 3: fetch from ACP)
 *
 * Usage:
 *   npx tsx scripts/knowledge/sources/panama-tariffs.ts
 *
 * Behaviour (Phase 1):
 *   - Tariffs are hardcoded in canal_tariffs seed data + YAML reference
 *   - This script only registers/updates the knowledge_sources metadata
 *   - Calls reportSyncSuccess to mark last_synced_at = today
 *   - Future Phase 3: fetch from https://www.pancanal.com/en/op/toll-calculator.html
 *
 * Input contract:
 * - db: Database instance, non-null/undefined → throws Error
 * - Running twice in one day → idempotent (last_synced_at updates, rowsChanged=0)
 */

import { getStore } from '@/lib/session-store';
import { registerSource, reportSyncStarted, reportSyncSuccess } from '@/lib/knowledge/governance';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Count Panama tariff rows in canal_tariffs table
 */
function countPanamaTariffs(db: any): number {
  const result = db
    .prepare(`SELECT COUNT(*) as cnt FROM canal_tariffs WHERE canal = 'panama'`)
    .get() as { cnt: number };
  return result.cnt;
}

/**
 * Main entry point
 */
async function main() {
  console.log('[panama-tariffs] Syncing Panama Canal tariff metadata...');

  const store = getStore();
  const db = store.getDb();

  if (db == null) {
    throw new Error('Database instance required');
  }

  // Verify YAML reference file exists
  const yamlPath = path.join(process.cwd(), 'data', 'knowledge', 'panama', 'tariffs-2025.yaml');
  if (!fs.existsSync(yamlPath)) {
    console.warn(`[panama-tariffs] ⚠ YAML reference not found at ${yamlPath}`);
  } else {
    console.log(`[panama-tariffs] ✓ YAML reference found: ${yamlPath}`);
  }

  // Register source in knowledge_sources
  registerSource(db, {
    slug: 'panama-tariffs',
    name: 'Panama Canal Tariff Schedule',
    kind: 'structured_rows',
    category: 'market',
    stale_threshold_days: 90, // Quarterly refresh
    refresh_mode: 'manual',
    refresh_command: 'npx tsx scripts/knowledge/sources/panama-tariffs.ts',
    primary_table: 'canal_tariffs',
    source_url: 'https://www.pancanal.com/en/op/toll-calculator.html',
    license: 'ACP Public Schedule',
  });

  const syncLogId = reportSyncStarted(db, 'panama-tariffs');

  try {
    // Phase 1: Tariffs are hardcoded in seed data, just count rows
    const rowCount = countPanamaTariffs(db);
    console.log(`[panama-tariffs] Found ${rowCount} Panama tariff rows in canal_tariffs`);

    // Report success (Phase 1: no actual fetch, just metadata sync)
    reportSyncSuccess(db, syncLogId, {
      rowsChanged: 0, // No changes in Phase 1 (hardcoded)
      upstreamVersion: 'acp-2025-q1',
    });

    console.log('[panama-tariffs] ✓ Sync complete (Phase 1: hardcoded rates registered)');
  } catch (error) {
    console.error('[panama-tariffs] ✗ Failed:', error);
    throw error; // Let caller handle failure reporting
  }
}

// Only run main if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('[panama-tariffs] Fatal error:', err);
    process.exit(1);
  });
}

export { main as syncPanamaTariffs };
