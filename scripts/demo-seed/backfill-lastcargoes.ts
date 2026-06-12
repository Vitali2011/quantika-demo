#!/usr/bin/env -S npx tsx
/**
 * backfill-lastcargoes.ts — lastCargoes backfill for parsed_results (audit D revive)
 *
 * Old demo vessel rows were parsed before the regex fallback
 * (lib/parsing/lastcargoes-fallback.ts) was wired into the normalizer, so
 * many items lack `lastCargoes` and the hold-cleanliness gate
 * (lib/matching/hold-cleanliness.ts) is silently a no-op for them. This
 * script re-extracts last cargoes from the source email body (emails.body,
 * joined via account_id + gmail_message_id) with the SAME regex the live
 * parser fallback uses and patches it into result_json in-place — all other
 * fields untouched.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/backfill-lastcargoes.ts [--db data/demo-seed.db]   # dry (default)
 *   npx tsx scripts/demo-seed/backfill-lastcargoes.ts --apply                    # write
 *
 * Idempotent: items with an existing non-null lastCargoes are skipped;
 * a second --apply run patches 0 items. Cargo rows (parse_type='cargo')
 * are never touched.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { extractLastCargoesFromBody } from '../../lib/parsing/lastcargoes-fallback';
import { patchResultJsonLastCargoes } from './lastcargoes-patch';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

const APPLY = process.argv.includes('--apply');
const DB_PATH = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`[backfill-lastcargoes] db=${DB_PATH}${APPLY ? ' (APPLY)' : ' (DRY)'}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backfill-lastcargoes] ERROR: db not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, APPLY ? {} : { readonly: true });
  if (APPLY) db.pragma('journal_mode = WAL');

  const rows = db
    .prepare<[], { account_id: string; gmail_message_id: string; result_json: string }>(
      `SELECT account_id, gmail_message_id, result_json
       FROM parsed_results
       WHERE parse_type = 'vessel'`,
    )
    .all();

  const selectEmail = db.prepare<[string, string], { body: string | null }>(
    `SELECT body FROM emails WHERE account_id = ? AND gmail_message_id = ?`,
  );

  const updateRow = APPLY
    ? db.prepare<[string, string, string]>(
        `UPDATE parsed_results
         SET result_json = ?
         WHERE account_id = ? AND gmail_message_id = ? AND parse_type = 'vessel'`,
      )
    : null;

  let patchedRows = 0;
  let patchedItems = 0;
  let noLastCargoes = 0;
  let alreadySet = 0;
  let missingEmail = 0;

  console.log(`[backfill-lastcargoes] ${rows.length} vessel rows | email id → extracted → items touched`);

  for (const row of rows) {
    const emailRow = selectEmail.get(row.account_id, row.gmail_message_id);
    if (!emailRow?.body) {
      console.log(`  ${row.gmail_message_id} → MISSING-EMAIL → 0`);
      missingEmail++;
      continue;
    }

    const lastCargoes = extractLastCargoesFromBody(emailRow.body);
    if (!lastCargoes) {
      noLastCargoes++;
      continue;
    }

    const { json, patched } = patchResultJsonLastCargoes(row.result_json, lastCargoes);
    if (patched === 0) {
      console.log(`  ${row.gmail_message_id} → ${JSON.stringify(lastCargoes)} → 0 (already set)`);
      alreadySet++;
      continue;
    }

    console.log(`  ${row.gmail_message_id} → ${JSON.stringify(lastCargoes)} → ${patched}${APPLY ? '' : ' (would set)'}`);
    if (APPLY && updateRow) {
      updateRow.run(json, row.account_id, row.gmail_message_id);
    }
    patchedRows++;
    patchedItems += patched;
  }

  db.close();

  console.log(
    `[backfill-lastcargoes] done${APPLY ? '' : ' (dry)'} — rows-patched=${patchedRows} items-patched=${patchedItems} ` +
      `no-lc-in-body=${noLastCargoes} already-set=${alreadySet} missing-email=${missingEmail}`,
  );
}

if (require.main === module) {
  main();
}
