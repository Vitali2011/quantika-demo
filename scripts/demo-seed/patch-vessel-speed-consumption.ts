#!/usr/bin/env -S npx tsx
/**
 * patch-vessel-speed-consumption.ts — normalize + default speedLaden + consumption
 * for existing demo-seed vessel rows that were parsed before #736.
 *
 * Normalization rules (EconomicsTab reads via parseLeadingNumber):
 *  - ConfidenceField {value, confidence, ...} → extract numeric → "N kts" / "N mt/day"
 *  - Plain number 13 → "13 kts" / "13 mt/day"
 *  - Non-standard string "13 knts" → "13 kts"
 *  - Already-normalized string "13 kts" / "22 mt/day" → no-op (idempotent)
 *  - Null / absent → apply DWT-based default from build.ts #736
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

// Extract leading decimal from a string (e.g. "13 knts" → 13, "12.5 kts" → 12.5).
function parseLeadingNumber(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Extract numeric value from any shape: plain number, ConfidenceField{value}, or string.
export function extractNumericValue(field: unknown): number | null {
  if (typeof field === 'number') return field > 0 ? field : null;
  if (field && typeof field === 'object' && 'value' in (field as object)) {
    const v = (field as { value: unknown }).value;
    if (typeof v === 'number') return v > 0 ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = parseLeadingNumber(v);
      return n !== null && n > 0 ? n : null;
    }
  }
  if (typeof field === 'string' && field.trim() !== '') {
    const n = parseLeadingNumber(field);
    return n !== null && n > 0 ? n : null;
  }
  return null;
}

// Normalize any speedLaden shape to "N kts" readable string, or null if no value.
export function normalizeSpeedField(field: unknown): string | null {
  const n = extractNumericValue(field);
  return n !== null ? `${n} kts` : null;
}

// Normalize any consumption shape to "N mt/day" readable string, or null if no value.
export function normalizeConsumptionField(field: unknown): string | null {
  const n = extractNumericValue(field);
  return n !== null ? `${n} mt/day` : null;
}

// Patch a single vessel item in-place. Returns true if modified.
//
// Preservation rule: if speedLaden/consumption exists in ANY shape (ConfidenceField,
// number, or non-normalized string) extract the numeric value and write the readable
// string form. Only apply DWT defaults when the value is genuinely absent (null).
// Re-running on already-normalized data is a no-op (idempotent).
export function patchVesselItem(vessel: Record<string, unknown>): boolean {
  const normalizedSpeed = normalizeSpeedField(vessel.speedLaden);
  const normalizedConsumption = normalizeConsumptionField(vessel.consumption);

  // Already in correct normalized string form — nothing to do.
  const alreadySpeed = normalizedSpeed !== null && vessel.speedLaden === normalizedSpeed;
  const alreadyConsumption = normalizedConsumption !== null && vessel.consumption === normalizedConsumption;
  if (alreadySpeed && alreadyConsumption) return false;

  const dwt = extractDwt(vessel.dwtSummer) ?? extractDwt(vessel.dwcc) ?? null;
  const defaults = defaultSpeedConsumption(dwt);

  let modified = false;

  if (!alreadySpeed) {
    if (normalizedSpeed !== null) {
      // Preserve: existing value in non-normalized shape → normalize it.
      vessel.speedLaden = normalizedSpeed;
      modified = true;
    } else if (defaults) {
      // Default: no existing value → apply DWT-based default.
      vessel.speedLaden = defaults.speedLaden;
      modified = true;
    }
  }

  if (!alreadyConsumption) {
    if (normalizedConsumption !== null) {
      vessel.consumption = normalizedConsumption;
      modified = true;
    } else if (defaults) {
      vessel.consumption = defaults.consumption;
      modified = true;
    }
  }

  return modified;
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
  let defaulted = 0;    // was null/absent, applied DWT-based default
  let preserved = 0;    // had existing value in non-normalized shape, normalized it
  let already = 0;      // already in normalized string form, no-op
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

      // Determine whether vessel had ANY existing value before patching.
      const hadExisting =
        extractNumericValue(vessel.speedLaden) !== null ||
        extractNumericValue(vessel.consumption) !== null;

      const modified = patchVesselItem(vessel);

      if (!modified) {
        already++;
      } else {
        rowModified = true;
        if (hadExisting) {
          preserved++;
        } else {
          defaulted++;
        }
        if (samples.length < 3) {
          samples.push({
            id: row.gmail_message_id,
            before,
            after: { speedLaden: vessel.speedLaden, consumption: vessel.consumption },
          });
        }
      }
    }

    if (rowModified && update) {
      update.run(JSON.stringify(items), row.rowid);
    }
  }

  const dryNote = dry ? ' (dry — no write)' : '';
  console.log(`\nVessel rows read: ${rows.length}`);
  console.log(`Total vessel items: ${totalVessels}`);
  console.log(`  Preserved (existing value normalized): ${preserved}${dryNote}`);
  console.log(`  Defaulted (was missing → DWT default): ${defaulted}${dryNote}`);
  console.log(`  Already normalized (no-op): ${already}`);

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
    console.log(`\nDone. Patched ${preserved + defaulted} vessel items in ${rows.length} rows.`);
  }
}

if (require.main === module) {
  main();
}
