import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';

test('migration 050 adds breakeven_tce_usd_per_day column', () => {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  const cols = db.prepare(`PRAGMA table_info(matches)`).all() as Array<{ name: string }>;
  expect(cols.map((c) => c.name)).toContain('breakeven_tce_usd_per_day');
});
