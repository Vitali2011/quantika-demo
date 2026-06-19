#!/usr/bin/env -S npx tsx
/**
 * backfill-1021-cargo-data.ts — surgical backfill of the cargo fields the T5
 * graft (commit f2999b67) updated only in the create-path JSON
 * (lib/sample-data/demo-parsed-cargoes.json), but never wrote back into the
 * parsed_results.result_json rows that hydrate-demo-session.ts and
 * regenerate-matches.ts read.
 *
 * This is the DATA half of #1033 (engine fixes for #1021 + #1023):
 *   - #1021  CBM volume dropped: 19e07d7c0f5b66c5 item 0 needs volumeCbm=12000
 *   - #1023  DWT-range ignored:  19e07cc3ba833475 item 0 needs
 *            minVesselDwtMt=12000 and maxVesselDwtMt=14000
 *
 * Canonical values are READ from lib/sample-data/demo-parsed-cargoes.json — this
 * script never invents numbers, it only propagates the create-path truth into
 * the DB rows. Only the fields listed in TARGETS are touched; everything else
 * (including the unrelated Egypt-Med salt email 19e07caab607dfe5, whose
 * volumeCbm is intentionally null) is left exactly as-is.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/backfill-1021-cargo-data.ts --db data/demo-seed.db [--dry]
 *
 * --dry  Preview only — logs WOULD-UPDATE lines, writes nothing.
 *
 * Summary line (always printed):
 *   done — updated=N skipped-already-correct=M skipped-missing=K
 *
 * Idempotent: re-run on an already-patched DB produces 0 changes.
 *
 * NOTE: this script only writes to the DB passed via --db. Running the actual
 * prod backfill (and the downstream regenerate-matches) is a separate,
 * orchestrator-sanctioned prod-write step — NOT performed here.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Target {
  emailId: string;
  itemIndex: number;
  fields: string[];
}

/**
 * The exact (emailId, itemIndex, fields) tuples to backfill. Field VALUES are
 * not hard-coded here — they are read from the canonical fixture below.
 */
const TARGETS: Target[] = [
  { emailId: '19e07d7c0f5b66c5', itemIndex: 0, fields: ['volumeCbm'] }, // #1021
  { emailId: '19e07cc3ba833475', itemIndex: 0, fields: ['minVesselDwtMt', 'maxVesselDwtMt'] }, // #1023
];

interface FixtureItem {
  emailId: string;
  itemIndex: number;
  [key: string]: unknown;
}

type ParsedItem = Record<string, unknown>;

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

const DRY = process.argv.includes('--dry');
const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');
const fixturePath = path.resolve(process.cwd(), 'lib/sample-data/demo-parsed-cargoes.json');

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  console.log(`[backfill-1021] db=${dbPath}${DRY ? ' (DRY)' : ''}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[backfill-1021] ERROR: db not found: ${dbPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(fixturePath)) {
    console.error(`[backfill-1021] ERROR: fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  const fixture: FixtureItem[] = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  // canonical[emailId][itemIndex] → fixture item
  const canonical = new Map<string, Map<number, FixtureItem>>();
  for (const item of fixture) {
    const byIndex = canonical.get(item.emailId) ?? new Map<number, FixtureItem>();
    byIndex.set(item.itemIndex, item);
    canonical.set(item.emailId, byIndex);
  }

  const db = new Database(dbPath, DRY ? { readonly: true } : {});
  if (!DRY) db.pragma('journal_mode = WAL');

  const selectRow = db.prepare<[string]>(
    `SELECT result_json FROM parsed_results WHERE gmail_message_id=? AND parse_type='cargo'`,
  );
  const updateRow = DRY
    ? null
    : db.prepare<[string, string]>(
        `UPDATE parsed_results SET result_json=? WHERE gmail_message_id=? AND parse_type='cargo'`,
      );

  let updates = 0;
  let skipped = 0;
  let skippedMissing = 0;

  // Group targets by emailId so each row is read/written once.
  const byEmail = new Map<string, Target[]>();
  for (const t of TARGETS) {
    const arr = byEmail.get(t.emailId) ?? [];
    arr.push(t);
    byEmail.set(t.emailId, arr);
  }

  for (const [emailId, targets] of byEmail) {
    const row = selectRow.get(emailId) as { result_json: string } | undefined;
    if (!row) {
      for (const t of targets) {
        console.log(`[backfill-1021] SKIPPED-MISSING emailId=${emailId} itemIndex=${t.itemIndex} (no parsed_results row)`);
        skippedMissing++;
      }
      continue;
    }

    const items: ParsedItem[] = JSON.parse(row.result_json);
    let rowChanged = false;

    for (const t of targets) {
      const target = items[t.itemIndex];
      if (!target) {
        console.log(`[backfill-1021] SKIPPED-MISSING emailId=${emailId} itemIndex=${t.itemIndex} (item not in result_json)`);
        skippedMissing++;
        continue;
      }

      const source = canonical.get(emailId)?.get(t.itemIndex);
      if (!source) {
        console.log(`[backfill-1021] SKIPPED-MISSING emailId=${emailId} itemIndex=${t.itemIndex} (no canonical fixture item)`);
        skippedMissing++;
        continue;
      }

      const changed: string[] = [];
      const oldVals: Record<string, unknown> = {};
      const newVals: Record<string, unknown> = {};

      for (const field of t.fields) {
        const canonicalVal = source[field];
        const currentVal = target[field];
        if (!jsonEqual(currentVal, canonicalVal)) {
          changed.push(field);
          oldVals[field] = currentVal;
          newVals[field] = canonicalVal;
          target[field] = canonicalVal;
          rowChanged = true;
        }
      }

      if (changed.length > 0) {
        const prefix = DRY ? 'WOULD-UPDATE' : 'UPDATED';
        const oldStr = changed.map((f) => `${f}: ${JSON.stringify(oldVals[f])}`).join(', ');
        const newStr = changed.map((f) => `${f}: ${JSON.stringify(newVals[f])}`).join(', ');
        console.log(
          `[backfill-1021] ${prefix} emailId=${emailId} itemIndex=${t.itemIndex} fields=[${changed.join(',')}] ${oldStr} → ${newStr}`,
        );
        updates++;
      } else {
        skipped++;
      }
    }

    if (rowChanged && !DRY && updateRow) {
      updateRow.run(JSON.stringify(items), emailId);
    }
  }

  console.log(
    `[backfill-1021] done — updated=${updates} skipped-already-correct=${skipped} skipped-missing=${skippedMissing}`,
  );
}

main().catch((err) => {
  console.error('[backfill-1021] fatal:', err);
  process.exit(1);
});
