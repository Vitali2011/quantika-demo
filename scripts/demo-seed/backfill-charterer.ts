#!/usr/bin/env -S npx tsx
/**
 * backfill-charterer.ts — chartererName backfill for parsed_results (audit A.1)
 *
 * Old demo cargo rows were parsed before the parser extracted charterer_name
 * (commit bb5bcde4), so their items lack `chartererName` and the live
 * charterer-tier lookup never fires. This script re-extracts the charterer
 * from the source email body (emails.body, joined via account_id +
 * gmail_message_id) with the SAME regex the seeder fixture was built from
 * (charterer-extract.ts) and patches it into result_json in-place — all other
 * fields untouched.
 *
 * Usage:
 *   npx tsx scripts/demo-seed/backfill-charterer.ts [--db data/demo-seed.db]   # dry (default)
 *   npx tsx scripts/demo-seed/backfill-charterer.ts --apply                    # write
 *
 * Idempotent: items with an existing non-null chartererName are skipped;
 * a second --apply run patches 0 items.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { extractChartererName, patchResultJson } from './charterer-extract';

// ─── CLI args ─────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

const APPLY = process.argv.includes('--apply');
const DB_PATH = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  console.log(`[backfill-charterer] db=${DB_PATH}${APPLY ? ' (APPLY)' : ' (DRY)'}`);

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backfill-charterer] ERROR: db not found: ${DB_PATH}`);
    process.exit(1);
  }

  const db = new Database(DB_PATH, APPLY ? {} : { readonly: true });
  if (APPLY) db.pragma('journal_mode = WAL');

  const rows = db
    .prepare<[], { account_id: string; gmail_message_id: string; result_json: string }>(
      `SELECT account_id, gmail_message_id, result_json
       FROM parsed_results
       WHERE parse_type = 'cargo'`,
    )
    .all();

  const selectEmail = db.prepare<[string, string], { body: string | null }>(
    `SELECT body FROM emails WHERE account_id = ? AND gmail_message_id = ?`,
  );

  const updateRow = APPLY
    ? db.prepare<[string, string, string]>(
        `UPDATE parsed_results
         SET result_json = ?
         WHERE account_id = ? AND gmail_message_id = ? AND parse_type = 'cargo'`,
      )
    : null;

  let patchedRows = 0;
  let patchedItems = 0;
  let noCharterer = 0;
  let alreadySet = 0;
  let missingEmail = 0;

  console.log(`[backfill-charterer] ${rows.length} cargo rows | email id → extracted name → items touched`);

  for (const row of rows) {
    const emailRow = selectEmail.get(row.account_id, row.gmail_message_id);
    if (!emailRow?.body) {
      console.log(`  ${row.gmail_message_id} → MISSING-EMAIL → 0`);
      missingEmail++;
      continue;
    }

    const name = extractChartererName(emailRow.body);
    if (!name) {
      noCharterer++;
      continue;
    }

    const { json, patched } = patchResultJson(row.result_json, name);
    if (patched === 0) {
      console.log(`  ${row.gmail_message_id} → ${JSON.stringify(name)} → 0 (already set)`);
      alreadySet++;
      continue;
    }

    console.log(`  ${row.gmail_message_id} → ${JSON.stringify(name)} → ${patched}${APPLY ? '' : ' (would set)'}`);
    if (APPLY && updateRow) {
      updateRow.run(json, row.account_id, row.gmail_message_id);
    }
    patchedRows++;
    patchedItems += patched;
  }

  db.close();

  console.log(
    `[backfill-charterer] done${APPLY ? '' : ' (dry)'} — rows-patched=${patchedRows} items-patched=${patchedItems} ` +
      `no-charterer-in-body=${noCharterer} already-set=${alreadySet} missing-email=${missingEmail}`,
  );
}

if (require.main === module) {
  main();
}
