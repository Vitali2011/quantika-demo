#!/usr/bin/env -S npx tsx
/**
 * patch-vessel-speed-consumption.ts — add speedLaden + consumption defaults to
 * existing demo-seed vessel rows that were parsed before #736.
 *
 * The prod demo-seed.db is frozen from before #736 (commit c396093b), which
 * added realistic speed/consumption defaults in build.ts. This script applies
 * the same logic in-place, idempotently.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/patch-vessel-speed-consumption.ts [--db <path>] [--dry]
 *   Defaults: --db data/demo-seed.db
 *
 * --dry: print counts + 2-3 before/after samples, no DB writes.
 */

import path from 'node:path';
import Database from 'better-sqlite3';

// ── Mirrored exactly from build.ts #736 (defaultSpeedConsumption) ─────────────
// DWT thresholds and string values are identical — do NOT change without
// updating build.ts too.
export function defaultSpeedConsumption(
  dwt: number | null,
): { speedLaden: string; consumption: string } | null {
  if (!dwt || dwt <= 0) return null;
  if (dwt < 40_000) return { speedLaden: '12.5 kts', consumption: '22 mt/day' };
  if (dwt < 65_000) return { speedLaden: '13 kts', consumption: '26 mt/day' };
  if (dwt < 100_000) return { speedLaden: '13.5 kts', consumption: '30 mt/day' };
  return { speedLaden: '14.5 kts', consumption: '38 mt/day' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Matches build.ts cfValue — unwraps ConfidenceField<number> or plain number.
export function extractDwt(field: unknown): number | null {
  if (typeof field === 'number') return field > 0 ? field : null;
  if (field && typeof field === 'object' && 'value' in (field as object)) {
    const v = (field as { value: unknown }).value;
    if (typeof v === 'number') return v > 0 ? v : null;
  }
  return null;
}

// result_json is a JSON array of items per email (prod contract); tolerate
// legacy single-object shape.
export function asItems(json: string): Record<string, unknown>[] {
  const parsed = JSON.parse(json) as unknown;
  return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [parsed as Record<string, unknown>];
}

// Patch a single vessel item in-place. Returns true if modified.
export function patchVesselItem(vessel: Record<string, unknown>): boolean {
  const hasSpeed = typeof vessel.speedLaden === 'string' && vessel.speedLaden.trim() !== '';
  const hasConsumption = typeof vessel.consumption === 'string' && vessel.consumption.trim() !== '';
  if (hasSpeed && hasConsumption) return false;

  const dwt = extractDwt(vessel.dwtSummer) ?? extractDwt(vessel.dwcc) ?? null;
  const defaults = defaultSpeedConsumption(dwt);
  if (!defaults) return false;

  if (!hasSpeed) vessel.speedLaden = defaults.speedLaden;
  if (!hasConsumption) vessel.consumption = defaults.consumption;
  return true;
}

// ── CLI entry-point ───────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main() {
  const dbPath = arg('--db') ?? path.join(process.cwd(), 'data', 'demo-seed.db');
  const dry = process.argv.includes('--dry');

  const db = new Database(dbPath, { readonly: dry });

  const rows = db
    .prepare(
      `SELECT rowid, gmail_message_id, result_json
       FROM parsed_results
       WHERE parse_type = 'vessel'`,
    )
    .all() as Array<{ rowid: number; gmail_message_id: string; result_json: string }>;

  let totalVessels = 0;
  let patched = 0;
  let skipped = 0;
  const samples: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }> = [];

  const update = dry
    ? null
    : db.prepare(`UPDATE parsed_results SET result_json = ? WHERE rowid = ?`);

  for (const row of rows) {
    const items = asItems(row.result_json);
    let rowModified = false;

    for (const vessel of items) {
      totalVessels++;
      const before = { speedLaden: vessel.speedLaden, consumption: vessel.consumption };
      const modified = patchVesselItem(vessel);
      if (modified) {
        rowModified = true;
        patched++;
        if (samples.length < 3) {
          samples.push({
            id: row.gmail_message_id,
            before,
            after: { speedLaden: vessel.speedLaden, consumption: vessel.consumption },
          });
        }
      } else {
        skipped++;
      }
    }

    if (rowModified && update) {
      update.run(JSON.stringify(items), row.rowid);
    }
  }

  console.log(`\nVessel rows read: ${rows.length}`);
  console.log(`Total vessel items: ${totalVessels}`);
  console.log(`  Would patch: ${patched}` + (dry ? ' (dry — no write)' : ''));
  console.log(`  Already had speed+consumption: ${skipped}`);

  if (samples.length > 0) {
    console.log('\nSamples (before → after):');
    for (const s of samples) {
      console.log(
        `  ${s.id}: speedLaden ${JSON.stringify(s.before.speedLaden)} → ${JSON.stringify(s.after.speedLaden)},` +
        ` consumption ${JSON.stringify(s.before.consumption)} → ${JSON.stringify(s.after.consumption)}`,
      );
    }
  }

  if (!dry) {
    console.log(`\nDone. Patched ${patched} vessel items in ${rows.length} rows.`);
  }
}

if (require.main === module) {
  main();
}
