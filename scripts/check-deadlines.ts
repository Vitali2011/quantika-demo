#!/usr/bin/env -S npx tsx
/**
 * scripts/check-deadlines.ts
 *
 * Cron entry-point для β-10 Subs Deadline Guardian.
 *
 * Usage:
 *   npx tsx scripts/check-deadlines.ts            # production scan
 *   npx tsx scripts/check-deadlines.ts --dry-run  # log only, no dispatch
 *   npx tsx scripts/check-deadlines.ts --demo     # use demo scenario 13
 *
 * Frequency: every 30 min (см. docs/wave-beta/CRON.md).
 *
 * Этот скрипт намеренно не настраивает реальный cron — это делает devops.
 * Здесь только idempotent сканер: загружает active deals со subs deadline,
 * прогоняет через processDeadline и логирует результат.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import {
  processDeadline,
  type SubsDeadline,
} from '../lib/deadlines/subs-guardian';
import { setDb } from '../lib/db/queries/dispatches';
import migration011 from '../lib/migrations/011-notified-dispatches';

interface CliFlags {
  dryRun: boolean;
  demo: boolean;
}

function parseFlags(argv: string[]): CliFlags {
  return {
    dryRun: argv.includes('--dry-run'),
    demo: argv.includes('--demo'),
  };
}

async function loadActiveDeadlines(flags: CliFlags): Promise<SubsDeadline[]> {
  if (flags.demo) {
    const file = path.join(
      process.cwd(),
      'lib/sample-data/demo-scenarios/13-subs-deadline-2h-warning.json',
    );
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [
      {
        dealId: raw.id,
        counterparty: raw.vessel?.vesselName?.value ?? 'demo-counterparty',
        deadlineAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
        stage: 'pending',
        notifiedStages: [],
      },
    ];
  }
  // TODO: when deals table gets a `subs_deadline_at` column, query it here.
  // Intentionally empty in the demo build so production cron is a no-op.
  // Tracked: https://github.com/Vitali2011/quantika-demo/issues/180
  return [];
}

/**
 * NEW-02 fix: initialize the DB ledger for idempotent dispatches.
 * Without this, live cron runs miss setDb() and tryRecordDispatch()
 * operates on an undefined db → double-dispatch on the next tick.
 *
 * Exported so unit tests can verify the wiring without spawning a subprocess.
 * Accepts an optional dbPath so tests can pass ':memory:'.
 */
export function initDb(
  dbPath: string = process.env.DEADLINES_DB_PATH ?? './data/quantika.db',
): Database.Database {
  const db = new Database(dbPath);
  migration011.up(db); // idempotent — CREATE TABLE IF NOT EXISTS inside
  setDb(db);
  return db;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  initDb(); // NEW-02: wire up dispatch ledger before any deadline processing
  const deadlines = await loadActiveDeadlines(flags);

  if (deadlines.length === 0) {
    console.log('[check-deadlines] no active subs deadlines');
    return;
  }

  // Idempotency lives DOWNSTREAM, not here: each iteration delegates to
  // processDeadline → tryRecordDispatch (lib/db/queries/dispatches). The DB
  // ledger guarantees that re-running this cron after a crash, restart, or
  // overlapping invocation cannot resend a notification. Verified end-to-end
  // by __tests__/deadlines/cron-idempotency.test.ts.
  for (const d of deadlines) {
    if (flags.dryRun) {
      console.log(`[check-deadlines] dry-run deal=${d.dealId} deadline=${d.deadlineAt}`);
      continue;
    }
    const result = await processDeadline(d);
    console.log(
      `[check-deadlines] deal=${d.dealId} stage=${result.newStage} ` +
        `dispatched=${result.notificationsDispatched.join(',') || 'none'} ` +
        `cta=${result.ctaShown}`,
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[check-deadlines] fatal', err);
    process.exit(1);
  });
}
