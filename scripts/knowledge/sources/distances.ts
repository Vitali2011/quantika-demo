#!/usr/bin/env tsx
/**
 * Seed port_distances table with top-200 ports × 3 routes
 *
 * Usage:
 *   npx tsx scripts/knowledge/sources/distances.ts
 *
 * Input: data/knowledge/top-200-ports.json (200 LOCODE strings)
 * Output: ~60K rows in port_distances (200×199/2 pairs × 3 routes)
 *
 * Progress: Logs percentage every 60s for ops visibility
 * Idempotency: Uses INSERT OR IGNORE for re-runs
 * Transactions: Batches of 1000 rows for speed
 *
 * Input contract:
 * - db: Database instance, non-null/undefined
 * - portList: array of LOCODE strings, can be empty
 * - Invalid LOCODEs → skipped with warning, others continue
 * - Searoute service down → reports failure, exits 1
 * - SIGTERM mid-run → transaction rollback (ACID)
 * - Special floats (NaN, ±Infinity) → throws Error
 */

import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import { resolvePortStrict, PortNotFoundError } from '@/lib/ports/resolve';
import { calculateDistance, type RouteVia } from '@/lib/knowledge/distances/client';
import { registerSource, reportSyncStarted, reportSyncSuccess, reportSyncFailure } from '@/lib/knowledge/governance';
import * as fs from 'fs';
import * as path from 'path';

const BATCH_SIZE = 1000;
const PROGRESS_INTERVAL_MS = 60_000; // 60s
const ROUTES = ['direct', 'suez', 'cape'] as const;

/**
 * Validates LOCODE format (5 chars: 2-letter country + 3-char port)
 */
function isValidLocode(locode: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{3}$/i.test(locode);
}

/**
 * Validates distance is finite and non-negative
 */
function validateDistance(nm: number): void {
  if (!Number.isFinite(nm)) {
    throw new Error(`Distance must be finite, got ${nm}`);
  }
  if (nm < 0) {
    throw new Error(`Distance must be non-negative, got ${nm}`);
  }
}

/**
 * Generate all unique pairs from port list
 * Filters out invalid LOCODEs with warnings
 */
function generatePairs(locodes: string[]): Array<[string, string]> {
  // Filter and validate LOCODEs
  const validLocodes: string[] = [];
  for (const locode of locodes) {
    if (!isValidLocode(locode)) {
      console.warn(`[distances] ⚠ Skipping invalid LOCODE: "${locode}"`);
      continue;
    }
    validLocodes.push(locode.toUpperCase());
  }

  // Generate unique pairs (avoid duplicates like [A,B] and [B,A])
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < validLocodes.length; i++) {
    for (let j = i + 1; j < validLocodes.length; j++) {
      pairs.push([validLocodes[i], validLocodes[j]]);
    }
  }

  return pairs;
}

/**
 * Batch insert distances into port_distances table
 * Uses transactions for ACID guarantees
 */
function batchInsert(
  db: Database.Database,
  records: Array<{ origin: string; dest: string; route_via: string; distance_nm: number }>,
  batchSize: number = BATCH_SIZE
): number {
  if (records.length === 0) {
    return 0;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO port_distances (origin, dest, route_via, distance_nm, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  let inserted = 0;

  // Process in batches with transactions
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    const tx = db.transaction(() => {
      for (const record of batch) {
        const result = stmt.run(record.origin, record.dest, record.route_via, record.distance_nm);
        if (result.changes > 0) {
          inserted++;
        }
      }
    });

    tx();
  }

  return inserted;
}

/**
 * Seed distances for given port list
 *
 * @param db - SQLite database instance
 * @param portList - Array of LOCODE strings (optional, defaults to top-200-ports.json)
 */
export async function seedDistances(
  db: Database.Database | null | undefined,
  portList?: string[]
): Promise<void> {
  // Input validation
  if (db == null) {
    throw new Error('Database instance required');
  }

  // Load port list if not provided
  let locodes: string[];
  if (portList !== undefined) {
    locodes = portList;
  } else {
    const portListPath = path.join(process.cwd(), 'data', 'knowledge', 'top-200-ports.json');
    if (!fs.existsSync(portListPath)) {
      throw new Error(`Port list file not found: ${portListPath}`);
    }
    const content = fs.readFileSync(portListPath, 'utf-8');
    locodes = JSON.parse(content);
  }

  // Empty port list → log warning and exit
  if (locodes.length === 0) {
    console.warn('[distances] ⚠ Port list is empty, nothing to seed');
    return;
  }

  console.log(`[distances] Starting seed for ${locodes.length} ports`);

  // Generate pairs
  const pairs = generatePairs(locodes);
  console.log(`[distances] Generated ${pairs.length} unique pairs`);

  // Calculate total work: pairs × routes
  const totalTasks = pairs.length * ROUTES.length;
  console.log(`[distances] Total tasks: ${totalTasks} (${pairs.length} pairs × ${ROUTES.length} routes)`);

  // Check how many are already seeded
  const existingCount = db
    .prepare('SELECT COUNT(*) as cnt FROM port_distances')
    .get() as { cnt: number };
  console.log(`[distances] Existing rows in cache: ${existingCount.cnt}`);

  // Collect all distance records to insert
  const records: Array<{ origin: string; dest: string; route_via: string; distance_nm: number }> = [];

  let completed = 0;
  let skipped = 0;
  let lastProgressLog = Date.now();

  // For each pair × route, calculate distance and collect
  for (const [origin, dest] of pairs) {
    for (const route of ROUTES) {
      try {
        // Check if already in cache (for idempotency)
        const cached = db
          .prepare(
            `
            SELECT distance_nm
            FROM port_distances
            WHERE ((origin = ? AND dest = ?) OR (origin = ? AND dest = ?))
              AND route_via = ?
            LIMIT 1
          `
          )
          .get(origin, dest, dest, origin, route) as { distance_nm: number } | undefined;

        if (cached) {
          skipped++;
          completed++;
          continue;
        }

        // Resolve LOCODE → coordinates
        let originPort;
        let destPort;

        try {
          originPort = resolvePortStrict(origin);
        } catch (err) {
          if (err instanceof PortNotFoundError) {
            console.warn(`[distances] ⚠ Cannot resolve origin "${origin}", skipping`);
            continue;
          }
          throw err;
        }

        try {
          destPort = resolvePortStrict(dest);
        } catch (err) {
          if (err instanceof PortNotFoundError) {
            console.warn(`[distances] ⚠ Cannot resolve dest "${dest}", skipping`);
            continue;
          }
          throw err;
        }

        // Validate coordinates exist
        if (
          originPort.lat == null ||
          originPort.lon == null ||
          destPort.lat == null ||
          destPort.lon == null
        ) {
          console.warn(`[distances] ⚠ Missing coordinates for ${origin} or ${dest}, skipping`);
          continue;
        }

        // Calculate distance via searoute service
        const result = await calculateDistance({
          origin: { lat: originPort.lat, lon: originPort.lon },
          dest: { lat: destPort.lat, lon: destPort.lon },
          routeVia: route as RouteVia,
        });

        // Validate distance
        validateDistance(result.distanceNm);

        // Collect record
        records.push({
          origin,
          dest,
          route_via: route,
          distance_nm: result.distanceNm,
        });

        completed++;

        // Log progress every 60s
        const now = Date.now();
        if (now - lastProgressLog >= PROGRESS_INTERVAL_MS) {
          const pct = ((completed / totalTasks) * 100).toFixed(1);
          console.log(
            `[distances] Progress: ${completed}/${totalTasks} (${pct}%) - new: ${records.length}, skipped: ${skipped}`
          );
          lastProgressLog = now;
        }
      } catch (error) {
        // Log error but re-throw to fail the sync (searoute down → exit 1)
        console.error(`[distances] ✗ Failed to calculate ${origin} → ${dest} via ${route}:`, error);
        throw error;
      }
    }
  }

  // Batch insert all new records
  console.log(`[distances] Inserting ${records.length} new records in batches of ${BATCH_SIZE}`);
  const inserted = batchInsert(db, records, BATCH_SIZE);

  console.log(`[distances] ✓ Inserted ${inserted} new rows (skipped ${skipped} cached)`);
}

/**
 * Main entry point for CLI execution
 */
async function main() {
  console.log('[distances] Seeding port_distances table...');

  const store = getStore();
  const db = store.getDb();

  // Register source in knowledge_sources
  registerSource(db, {
    slug: 'port-distances',
    name: 'Port-to-Port Sea Distances',
    kind: 'structured_rows',
    category: 'geo',
    stale_threshold_days: 365, // Distances are stable
    refresh_mode: 'manual',
    refresh_command: 'npx tsx scripts/knowledge/sources/distances.ts',
    primary_table: 'port_distances',
    source_url: 'https://github.com/gis-ops/routingpy (searoute-py)',
    license: 'MIT',
  });

  const syncLogId = reportSyncStarted(db, 'port-distances');

  try {
    await seedDistances(db);

    // Count final rows
    const finalCount = db
      .prepare('SELECT COUNT(*) as cnt FROM port_distances')
      .get() as { cnt: number };

    reportSyncSuccess(db, syncLogId, {
      rowsChanged: finalCount.cnt,
      upstreamVersion: 'searoute-1.0.0',
    });

    console.log('[distances] ✓ Done');
  } catch (error) {
    reportSyncFailure(db, syncLogId, error as Error);
    console.error('[distances] ✗ Failed:', error);
    process.exit(1);
  }
}

// Only run main if executed directly
if (require.main === module) {
  main();
}
