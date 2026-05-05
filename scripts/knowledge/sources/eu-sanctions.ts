#!/usr/bin/env tsx
/**
 * Refresh EU Consolidated Sanctions List from EU Commission
 *
 * Usage:
 *   npx tsx scripts/knowledge/sources/eu-sanctions.ts
 *
 * Source: https://webgate.ec.europa.eu/europeaid/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content
 * Output: Updates eu_sanctions_entities table with diff/upsert
 */

import { getStore } from "@/lib/session-store";
import { refreshEu } from "@/lib/knowledge/sanctions/eu-adapter";

export async function refresh() {
  const store = getStore();
  const db = store.getDb();
  const result = await refreshEu(db);
  console.log(
    `[EU] rowsChanged=${result.rowsChanged}, version=${result.upstreamVersion}`
  );
}

async function main() {
  console.log("[EU] Refreshing Consolidated Sanctions from EU Commission...");

  try {
    await refresh();
    console.log("[EU] ✓ Done");
  } catch (error) {
    console.error("[EU] ✗ Failed:", error);
    process.exit(1);
  }
}

// Only run main if executed directly
if (require.main === module) {
  main();
}
