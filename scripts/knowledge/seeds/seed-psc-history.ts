/**
 * seed-psc-history.ts
 *
 * Seeds the psc_detention_history table with synthetic PSC inspection records
 * for ~5 demo IMOs (see lib/knowledge/sources/psc/fixture.ts).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-psc-history.ts
 *   npx tsx --env-file=.env.local scripts/seed-psc-history.ts --dry-run
 *
 * Env:
 *   SESSIONS_DB_PATH — path to sqlite db (default: data/sessions.db)
 *
 * Idempotent: clears all existing rows, then re-inserts the fixture, so
 * repeated runs converge on the same state.
 */

import { getStore } from '../../../lib/session-store';
import { upsertInspection } from '../../../lib/market/psc-repository';
import { PSC_FIXTURE, PSC_FIXTURE_IMOS } from '../../../lib/knowledge/sources/psc/fixture';

export function seedPscHistory(opts: { dryRun?: boolean } = {}): void {
  const { dryRun = false } = opts;

  console.log(
    `Seeding PSC detention history${dryRun ? ' (DRY RUN — no DB writes)' : ''}...`,
  );
  console.log(`  Fixture: ${PSC_FIXTURE.length} records across ${PSC_FIXTURE_IMOS.length} IMOs`);

  if (dryRun) {
    console.log('\nFirst 5 records that would be inserted:');
    for (const rec of PSC_FIXTURE.slice(0, 5)) {
      console.log(
        `  - ${rec.id} | ${rec.imo} | ${rec.inspection_date} | ${rec.port} | ${rec.authority} | def=${rec.deficiencies} | detained=${rec.detained}`,
      );
    }
    console.log('\nDry run complete — no rows written.');
    return;
  }

  const db = getStore().getDatabase();

  const deleted = db
    .prepare('DELETE FROM psc_detention_history')
    .run().changes;
  console.log(`  Cleared ${deleted} existing row(s).`);

  for (const record of PSC_FIXTURE) {
    upsertInspection(db, record);
  }

  const count = db
    .prepare<[], { c: number }>('SELECT COUNT(*) as c FROM psc_detention_history')
    .get()?.c ?? 0;
  console.log(`  Inserted ${PSC_FIXTURE.length} record(s). Table now has ${count} row(s).`);

  console.log('\nSample rows:');
  const samples = db
    .prepare<[], { id: string; imo: string; inspection_date: string; port: string; authority: string; deficiencies: number; detained: number }>(
      'SELECT id, imo, inspection_date, port, authority, deficiencies, detained FROM psc_detention_history ORDER BY inspection_date DESC LIMIT 5',
    )
    .all();
  for (const row of samples) {
    console.log(
      `  - ${row.id} | ${row.imo} | ${row.inspection_date} | ${row.port} | ${row.authority} | def=${row.deficiencies} | detained=${row.detained === 1}`,
    );
  }

  console.log(`\nSeeded PSC history for IMOs: ${PSC_FIXTURE_IMOS.join(', ')}`);
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  seedPscHistory({ dryRun });
}
