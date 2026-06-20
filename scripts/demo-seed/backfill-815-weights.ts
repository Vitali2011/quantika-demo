#!/usr/bin/env -S npx tsx
/**
 * backfill-815-weights.ts — surgical weight backfill from the #815 fixture
 * (lib/sample-data/demo-parsed-cargoes.json) into parsed_results.result_json.
 *
 * Only patches: weightMt, weightMtMin, weightMtMax (the three fields confirmed
 * changed by PR #815). All other fields are untouched.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/backfill-815-weights.ts --db data/demo-seed.db [--dry] [--allow-missing]
 *
 * --dry            Preview only — logs WOULD-UPDATE lines, writes nothing.
 * --allow-missing  Skip MISSING_ROW and AMBIGUOUS_MATCH rows instead of aborting.
 *                  Logs SKIPPED-MISSING / SKIPPED-AMBIGUOUS and proceeds with
 *                  cleanly-matched updates. Without this flag (default), any
 *                  MISSING_ROW or AMBIGUOUS_MATCH causes a non-zero exit (strict).
 *
 * Summary line (always printed):
 *   done — updated=N skipped-already-correct=M skipped-missing=K skipped-ambiguous=A
 *
 * Idempotent: re-run on already-patched DB produces 0 changes.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

const WEIGHT_FIELDS = ['weightMt', 'weightMtMin', 'weightMtMax'] as const;
type WeightField = (typeof WEIGHT_FIELDS)[number];

interface FixtureCargo {
  emailId: string;
  itemIndex: number;
  weightMt?: unknown;
  weightMtMin?: unknown;
  weightMtMax?: unknown;
  originPort?: { value?: string };
  destinationPort?: { value?: string };
  cargoDescription?: { value?: string };
  [key: string]: unknown;
}

interface ParsedItem {
  emailId?: string;
  itemIndex?: number;
  originPort?: { value?: string };
  destinationPort?: { value?: string };
  cargoDescription?: { value?: string };
  weightMt?: unknown;
  weightMtMin?: unknown;
  weightMtMax?: unknown;
  [key: string]: unknown;
}

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

const DRY = process.argv.includes('--dry');
const ALLOW_MISSING = process.argv.includes('--allow-missing');
const dbPath = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');
const fixtureDir = path.resolve(process.cwd(), 'lib/sample-data/demo-parsed-cargoes.json');

function fingerprint(item: FixtureCargo | ParsedItem): string {
  const op = (item.originPort as { value?: string } | undefined)?.value ?? '';
  const dp = (item.destinationPort as { value?: string } | undefined)?.value ?? '';
  const cd = (item.cargoDescription as { value?: string } | undefined)?.value ?? '';
  return `${op}|${dp}|${cd.slice(0, 40)}`;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  console.log(`[backfill-815] db=${dbPath}${DRY ? ' (DRY)' : ''}${ALLOW_MISSING ? ' (allow-missing)' : ''}`);

  if (!fs.existsSync(dbPath)) {
    console.error(`[backfill-815] ERROR: db not found: ${dbPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(fixtureDir)) {
    console.error(`[backfill-815] ERROR: fixture not found: ${fixtureDir}`);
    process.exit(1);
  }

  const fixture: FixtureCargo[] = JSON.parse(fs.readFileSync(fixtureDir, 'utf8'));
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
  let skippedAmbiguous = 0;
  let missingRows = 0; // strict-mode counter only; triggers abort at end

  // Group fixture items by emailId
  const byEmail = new Map<string, FixtureCargo[]>();
  for (const c of fixture) {
    const arr = byEmail.get(c.emailId) ?? [];
    arr.push(c);
    byEmail.set(c.emailId, arr);
  }

  // Sentinel thrown at the end of the batch when strict-mode hits a
  // MISSING_ROW/AMBIGUOUS_MATCH. Thrown INSIDE the better-sqlite3 transaction
  // so the whole batch rolls back — making "no writes performed" literally true
  // (previously updateRow.run() flushed each row immediately under WAL, so the
  // abort message was a false claim while partial writes were already committed).
  class AbortMissingRows extends Error {}

  const runBatch = () => {
  for (const [emailId, cargoes] of byEmail) {
    const row = selectRow.get(emailId) as { result_json: string } | undefined;
    if (!row) {
      if (ALLOW_MISSING) {
        console.log(`[backfill-815] SKIPPED-MISSING emailId=${emailId}`);
        skippedMissing++;
      } else {
        console.error(`[backfill-815] MISSING_ROW emailId=${emailId}`);
        missingRows++;
      }
      continue;
    }

    const items: ParsedItem[] = JSON.parse(row.result_json);
    let rowChanged = false;

    for (const c of cargoes) {
      // Primary key: itemIndex. Secondary: fingerprint.
      let target: ParsedItem | undefined = items[c.itemIndex];
      if (!target) {
        const fp = fingerprint(c);
        target = items.find((it) => fingerprint(it) === fp);
        if (!target) {
          if (ALLOW_MISSING) {
            console.log(`[backfill-815] SKIPPED-AMBIGUOUS emailId=${emailId} itemIndex=${c.itemIndex}`);
            skippedAmbiguous++;
          } else {
            console.error(`[backfill-815] AMBIGUOUS_MATCH emailId=${emailId} itemIndex=${c.itemIndex}`);
            missingRows++;
          }
          continue;
        }
      }

      const changed: string[] = [];
      const oldVals: Record<string, unknown> = {};
      const newVals: Record<string, unknown> = {};

      for (const field of WEIGHT_FIELDS) {
        const fixtureVal = c[field as WeightField];
        const currentVal = target[field as WeightField];
        if (!jsonEqual(currentVal, fixtureVal)) {
          changed.push(field);
          oldVals[field] = currentVal;
          newVals[field] = fixtureVal;
          target[field as WeightField] = fixtureVal;
          rowChanged = true;
        }
      }

      if (changed.length > 0) {
        const prefix = DRY ? 'WOULD-UPDATE' : 'UPDATED';
        const oldStr = changed.map((f) => `${f}: ${JSON.stringify(oldVals[f])}`).join(', ');
        const newStr = changed.map((f) => `${f}: ${JSON.stringify(newVals[f])}`).join(', ');
        console.log(`[backfill-815] ${prefix} emailId=${emailId} itemIndex=${c.itemIndex} fields=[${changed.join(',')}] ${oldStr} → ${newStr}`);
        updates++;
      } else {
        skipped++;
      }
    }

    if (rowChanged && !DRY && updateRow) {
      updateRow.run(JSON.stringify(items), emailId);
    }
  }

  // Trigger rollback of every write above when strict mode saw a missing row.
  if (missingRows > 0) throw new AbortMissingRows();
  };

  try {
    // Wrap writes in a single transaction so a strict-mode abort rolls back
    // the whole batch atomically. DRY mode opens the db read-only — no
    // transaction needed (and none would be writable).
    if (!DRY && updateRow) {
      db.transaction(runBatch)();
    } else {
      runBatch();
    }
  } catch (err) {
    if (err instanceof AbortMissingRows) {
      console.log(`[backfill-815] done — updated=${updates} skipped-already-correct=${skipped} skipped-missing=${skippedMissing} skipped-ambiguous=${skippedAmbiguous}`);
      console.error(`[backfill-815] ABORT — ${missingRows} MISSING_ROW or AMBIGUOUS_MATCH; no writes performed`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`[backfill-815] done — updated=${updates} skipped-already-correct=${skipped} skipped-missing=${skippedMissing} skipped-ambiguous=${skippedAmbiguous}`);
}

main().catch((err) => {
  console.error('[backfill-815] fatal:', err);
  process.exit(1);
});
