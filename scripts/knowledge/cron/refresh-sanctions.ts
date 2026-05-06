#!/usr/bin/env tsx
/**
 * Daily sanctions refresh cron script (C7)
 *
 * Orchestrates OFAC + EU refresh sequentially.
 * On success: sends heartbeat ping to /api/admin/cron-heartbeat
 * On failure: exits 1, no heartbeat (so monitor flags missing heartbeat)
 *
 * Usage:
 *   npx tsx scripts/knowledge/cron/refresh-sanctions.ts
 *
 * Env vars:
 *   CRON_SECRET (required): secret token for heartbeat auth
 *   HEARTBEAT_URL (optional): defaults to http://localhost:3000/api/admin/cron-heartbeat
 *
 * Input contract:
 * - Missing CRON_SECRET: throws error before starting
 * - OFAC fails: exit 1, no heartbeat
 * - EU fails: exit 1, no heartbeat
 * - Both succeed: exit 0, sends heartbeat ping
 */

import { getStore } from "@/lib/session-store";
import { refreshOfac } from "@/lib/knowledge/sanctions/ofac-adapter";
import { refreshEu } from "@/lib/knowledge/sanctions/eu-adapter";

const CRON_NAME = "sanctions-daily";

async function sendHeartbeat() {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error("CRON_SECRET env var is required for heartbeat auth");
  }

  const heartbeatUrl =
    process.env.HEARTBEAT_URL || "http://localhost:3000/api/admin/cron-heartbeat";

  try {
    const response = await fetch(heartbeatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": cronSecret,
      },
      body: JSON.stringify({ cron_name: CRON_NAME }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Heartbeat ping failed: ${response.status} ${response.statusText} - ${text}`
      );
    }

    const json = await response.json();
    console.log(
      `[Heartbeat] ✓ Sent for ${CRON_NAME} at ${json.last_seen_at}`
    );
  } catch (error) {
    console.error("[Heartbeat] ✗ Failed:", error);
    throw error;
  }
}

async function main() {
  // Validate CRON_SECRET is set before starting
  if (!process.env.CRON_SECRET) {
    throw new Error(
      "CRON_SECRET env var is required (used for heartbeat endpoint auth)"
    );
  }

  console.log(`[${CRON_NAME}] Starting sanctions refresh...`);

  const store = getStore();
  const db = store.getDb();

  let allSucceeded = true;

  // 1. Refresh OFAC
  try {
    console.log("[OFAC] Refreshing SDN List from treasury.gov...");
    const ofacResult = await refreshOfac(db);
    console.log(
      `[OFAC] ✓ Done: rowsChanged=${ofacResult.rowsChanged}, version=${ofacResult.upstreamVersion}`
    );
  } catch (error) {
    console.error("[OFAC] ✗ Failed:", error);
    allSucceeded = false;
  }

  // 2. Refresh EU
  try {
    console.log("[EU] Refreshing Consolidated Sanctions from EU Commission...");
    const euResult = await refreshEu(db);
    console.log(
      `[EU] ✓ Done: rowsChanged=${euResult.rowsChanged}, version=${euResult.upstreamVersion}`
    );
  } catch (error) {
    console.error("[EU] ✗ Failed:", error);
    allSucceeded = false;
  }

  // 3. Send heartbeat only if both succeeded
  if (allSucceeded) {
    await sendHeartbeat();
    console.log(`[${CRON_NAME}] ✓ All refreshes succeeded, heartbeat sent`);
    process.exit(0);
  } else {
    console.error(
      `[${CRON_NAME}] ✗ One or more refreshes failed, skipping heartbeat`
    );
    process.exit(1);
  }
}

// Only run main if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error(`[${CRON_NAME}] Fatal error:`, error);
    process.exit(1);
  });
}

export { main };
