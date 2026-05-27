/**
 * DEMO_MODE flag — strict "true" string match.
 * See docs/superpowers/specs/2026-05-27-quantika-demo-frozen-snapshot-design.md
 */
import type Database from 'better-sqlite3';
import { getDb } from './db/index';

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

let _cachedFrozenDate: string | null = null;

export function getDemoFrozenDate(db: Database.Database = getDb()): string {
  if (_cachedFrozenDate !== null) return _cachedFrozenDate;
  const row = db
    .prepare('SELECT frozen_date FROM demo_seed_meta WHERE id = 1')
    .get() as { frozen_date: string } | undefined;
  if (!row) throw new Error('demo_seed_meta has no row — run scripts/demo-seed/build.ts');
  _cachedFrozenDate = row.frozen_date;
  return _cachedFrozenDate;
}

// Test helper — DO NOT call in production code
export function _resetDemoFrozenDateCache(): void {
  _cachedFrozenDate = null;
}
