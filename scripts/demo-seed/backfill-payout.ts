#!/usr/bin/env -S npx tsx
/**
 * backfill-payout.ts — surgical payout_condition backfill for demo-seed.db
 *
 * For each cargo parsed_results row (parser_version='demo-seed-v1') where any
 * item lacks the payoutCondition key, reads the email body from the emails table
 * and calls the LLM to extract ONLY payout_condition, then patches result_json
 * in-place (all other fields untouched).
 *
 * Usage:
 *   npx tsx scripts/demo-seed/backfill-payout.ts --db data/demo-seed.db [--apply]
 *
 * --apply                 Write changes (default: dry run, no writes).
 * --parser-version <v>    Filter rows by parser_version (default: demo-seed-v1).
 * --limit <n>             Stop after N emails (dev/testing).
 * --concurrency <n>       LLM concurrency limit (default: 4, max: 4).
 * --mock-payout-fixture   JSON file mapping gmail_message_id → payout_condition
 *                         string or null. Bypasses LLM (for tests and dry-runs).
 *
 * Idempotency: items that already have the payoutCondition key (even if null)
 * are skipped. Re-running produces 0 patches.
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

import { Type } from '@google/genai';
import pLimit from 'p-limit';
import { callAiJson } from '@/lib/ai-provider';

const SYSTEM_PROMPT = `You are extracting the payment/payout condition from a cargo shipping inquiry email.
Return JSON with exactly one field: payout_condition.

Field definition:
- payout_condition: payment / payout terms stated in the email — e.g. "100% freight payable on completion of discharge", "freight payable within 3 banking days after completion", "LC at sight", "CAD (cash against documents)", "payment 95/5". Capture the verbatim condition as a plain STRING. Return null if the email states no payment/payout condition. Do NOT infer — extract only when explicitly written.`;

export const PAYOUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    payout_condition: { type: Type.STRING, nullable: true },
  },
  required: ['payout_condition'],
};

const LLM_TIMEOUT_MS = 45_000;

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export type ParsedItem = Record<string, unknown>;

/** Returns true if any item in the array is missing the payoutCondition key. */
export function needsPayoutPatch(items: ParsedItem[]): boolean {
  return items.some((item) => !('payoutCondition' in item));
}

/**
 * Mutates `items` in place: sets `payoutCondition` on each item that lacks the key.
 * Items that already have the key (even null) are skipped.
 * Returns the count of items that were patched.
 */
export function applyPayoutPatch(
  items: ParsedItem[],
  payoutCondition: string | null,
): { patched: number } {
  let patched = 0;
  for (const item of items) {
    if (!('payoutCondition' in item)) {
      item['payoutCondition'] = payoutCondition;
      patched++;
    }
  }
  return { patched };
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

function arg(k: string): string | undefined {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
}

const APPLY = process.argv.includes('--apply');
const DB_PATH = arg('--db') ?? path.resolve(process.cwd(), 'data/demo-seed.db');
const PARSER_VERSION = arg('--parser-version') ?? 'demo-seed-v1';
const LIMIT = arg('--limit') ? parseInt(arg('--limit')!, 10) : null;
const CONCURRENCY = Math.min(parseInt(arg('--concurrency') ?? '4', 10), 4);
const MOCK_FIXTURE_PATH = arg('--mock-payout-fixture');

// ─── LLM extraction ──────────────────────────────────────────────────────────

async function extractPayoutCondition(emailBody: string): Promise<string | null> {
  const result = await callAiJson<{ payout_condition: string | null }>(
    'PARSE_CARGO',
    SYSTEM_PROMPT,
    emailBody,
    { responseSchema: PAYOUT_SCHEMA, timeoutMs: LLM_TIMEOUT_MS },
  );
  return result.payout_condition ?? null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    `[backfill-payout] db=${DB_PATH} parser_version=${PARSER_VERSION}${APPLY ? ' (APPLY)' : ' (DRY)'}${MOCK_FIXTURE_PATH ? ' (mock-fixture)' : ''}`,
  );

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backfill-payout] ERROR: db not found: ${DB_PATH}`);
    process.exit(1);
  }

  // Load mock fixture if provided
  let mockFixture: Record<string, string | null> | null = null;
  if (MOCK_FIXTURE_PATH) {
    if (!fs.existsSync(MOCK_FIXTURE_PATH)) {
      console.error(`[backfill-payout] ERROR: mock fixture not found: ${MOCK_FIXTURE_PATH}`);
      process.exit(1);
    }
    mockFixture = JSON.parse(fs.readFileSync(MOCK_FIXTURE_PATH, 'utf8'));
  }

  const db = new Database(DB_PATH, APPLY ? {} : { readonly: true });
  if (APPLY) db.pragma('journal_mode = WAL');

  const selectRows = db.prepare<[string], { account_id: string; gmail_message_id: string; result_json: string }>(
    `SELECT account_id, gmail_message_id, result_json
     FROM parsed_results
     WHERE parse_type = 'cargo' AND parser_version = ?`,
  );

  const selectEmail = db.prepare<[string, string], { body: string | null }>(
    `SELECT body FROM emails WHERE account_id = ? AND gmail_message_id = ?`,
  );

  const updateRow = APPLY
    ? db.prepare<[string, string, string, string]>(
        `UPDATE parsed_results
         SET result_json = ?
         WHERE account_id = ? AND gmail_message_id = ? AND parse_type = 'cargo' AND parser_version = ?`,
      )
    : null;

  const rows = selectRows.all(PARSER_VERSION);
  const toProcess = rows.filter((row) => {
    const items: ParsedItem[] = JSON.parse(row.result_json);
    return needsPayoutPatch(items);
  });

  const target = LIMIT ? toProcess.slice(0, LIMIT) : toProcess;

  console.log(
    `[backfill-payout] ${rows.length} cargo rows total, ${toProcess.length} need patching${LIMIT ? ` (limit=${LIMIT})` : ''}`,
  );

  let patchedRows = 0;
  let patchedItems = 0;
  let skippedAlreadyCorrect = rows.length - toProcess.length;
  let skippedMissingEmail = 0;
  const failedRows: string[] = [];

  const limit = pLimit(CONCURRENCY);

  const results = await Promise.allSettled(
    target.map((row) =>
      limit(async () => {
        const items: ParsedItem[] = JSON.parse(row.result_json);

        // Read email body
        const emailRow = selectEmail.get(row.account_id, row.gmail_message_id);
        if (!emailRow) {
          console.log(
            `[backfill-payout] MISSING-EMAIL account=${row.account_id} emailId=${row.gmail_message_id} — skipping`,
          );
          skippedMissingEmail++;
          return;
        }
        if (!emailRow.body) {
          console.log(
            `[backfill-payout] EMPTY-BODY account=${row.account_id} emailId=${row.gmail_message_id} — skipping`,
          );
          skippedMissingEmail++;
          return;
        }

        // Extract payout condition (mock or LLM)
        let payoutCondition: string | null;
        if (mockFixture !== null) {
          payoutCondition = mockFixture[row.gmail_message_id] ?? null;
        } else {
          payoutCondition = await extractPayoutCondition(emailRow.body);
        }

        const { patched } = applyPayoutPatch(items, payoutCondition);
        const prefix = APPLY ? 'PATCHED' : 'WOULD-PATCH';
        console.log(
          `[backfill-payout] ${prefix} emailId=${row.gmail_message_id} items_patched=${patched} payout_condition=${JSON.stringify(payoutCondition)}`,
        );

        if (APPLY && updateRow) {
          updateRow.run(JSON.stringify(items), row.account_id, row.gmail_message_id, PARSER_VERSION);
        }

        patchedRows++;
        patchedItems += patched;
      }),
    ),
  );

  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    if (r.status === 'rejected') {
      const emailId = target[idx].gmail_message_id;
      console.error(`[backfill-payout] ROW-ERROR emailId=${emailId}:`, r.reason);
      failedRows.push(emailId);
    }
  }

  console.log(
    `[backfill-payout] done — patched=${patchedRows} skipped-already-correct=${skippedAlreadyCorrect} skipped-missing-email=${skippedMissingEmail} items_patched=${patchedItems}${failedRows.length ? ` failed=${failedRows.length} failed-ids=${failedRows.join(',')}` : ''}`,
  );

  db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[backfill-payout] FATAL:', err);
    process.exit(1);
  });
}
