#!/usr/bin/env tsx
/**
 * Refresh OFAC SDN List from treasury.gov
 *
 * Usage:
 *   npx tsx scripts/knowledge/sources/ofac.ts
 *
 * Source: https://www.treasury.gov/ofac/downloads/sdn.xml
 * Output: Updates ofac_entities table with diff/upsert
 */

import { getStore } from "@/lib/session-store";
import { refreshOfac } from "@/lib/knowledge/sanctions/ofac-adapter";

export async function refresh() {
  const store = getStore();
  const db = store.getDb();
  const result = await refreshOfac(db);
  console.log(
    `[OFAC] rowsChanged=${result.rowsChanged}, version=${result.upstreamVersion}`
  );
}

async function main() {
  console.log("[OFAC] Refreshing SDN List from treasury.gov...");

  try {
    await refresh();
    console.log("[OFAC] ✓ Done");
  } catch (error) {
    console.error("[OFAC] ✗ Failed:", error);
    process.exit(1);
  }
}

// Only run main if executed directly
if (require.main === module) {
  main();
}
