/**
 * RED/GREEN — countQualifyingMatches (Wave 8: I10)
 *
 * Invariants under test:
 *  1. null fit_percent → EXCLUDED from count
 *  2. fit_percent < 60 → EXCLUDED
 *  3. fit_percent >= 60 → INCLUDED
 *  4. dedup applied (same vessel+cargo+port+laycan = one row)
 *  5. result is deterministic for fixed seed
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { createMatch } from '@/lib/matching/matches-repository';
import { countQualifyingMatches } from '@/lib/matching/count-qualifying';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  return db;
}

function insert(db: Database.Database, overrides: {
  cargo_id?: string;
  vessel_id?: string;
  score?: number;
  fit_percent?: number | null;
  user_id?: string;
  vessel_name?: string | null;
  cargo_ref?: string | null;
  load_port?: string | null;
  laycan_start?: number | null;
}) {
  const { fit_percent = null, vessel_name = null, cargo_ref = null, load_port = null, laycan_start = null, ...rest } = overrides;
  const m = createMatch(db, {
    cargo_id: overrides.cargo_id ?? 'cargo-1',
    vessel_id: overrides.vessel_id ?? 'vessel-1',
    score: overrides.score ?? 75,
    reason: '{"summary":"test"}',
    status: 'shortlist',
    user_id: overrides.user_id ?? 'user-1',
    fit_percent,
    vessel_name,
    cargo_ref,
    load_port,
    laycan_start,
  });
  return m;
}

describe('countQualifyingMatches', () => {
  it('excludes match with null fit_percent', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: null });
    const count = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count).toBe(0);
  });

  it('excludes match with fit_percent < 60', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: 59 });
    const count = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count).toBe(0);
  });

  it('includes match with fit_percent exactly 60', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: 60 });
    const count = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count).toBe(1);
  });

  it('includes match with fit_percent > 60', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: 85 });
    const count = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count).toBe(1);
  });

  it('mixed: only counts matches with fit_percent >= 60', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: null });
    insert(db, { cargo_id: 'c2', vessel_id: 'v2', fit_percent: 42 });
    insert(db, { cargo_id: 'c3', vessel_id: 'v3', fit_percent: 60 });
    insert(db, { cargo_id: 'c4', vessel_id: 'v4', fit_percent: 78 });
    const count = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count).toBe(2);
  });

  it('dedup collapses same vessel+cargo+port+laycan into one', () => {
    const db = freshDb();
    // Two rows with same vessel+cargo+port+laycan key but different cargo_id (DB allows it)
    // Note: DB UNIQUE is on cargo_id+vessel_id+user_id, so same cargo_id+vessel_id gives one row.
    // We simulate dedup scenario with different cargo_id but same vessel_name+cargo_ref+load_port+laycan_start.
    insert(db, {
      cargo_id: 'c1', vessel_id: 'v1', fit_percent: 75,
      vessel_name: 'MV ALPHA', cargo_ref: 'GRAIN-001', load_port: 'UAODS', laycan_start: 1748908800000,
    });
    insert(db, {
      cargo_id: 'c2', vessel_id: 'v2', fit_percent: 80,
      vessel_name: 'MV ALPHA', cargo_ref: 'GRAIN-001', load_port: 'UAODS', laycan_start: 1748908800000,
    });
    const count = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count).toBe(1);
  });

  it('is deterministic for a fixed seed', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: 70 });
    insert(db, { cargo_id: 'c2', vessel_id: 'v2', fit_percent: 85 });
    const count1 = countQualifyingMatches(db, { user_id: 'user-1' });
    const count2 = countQualifyingMatches(db, { user_id: 'user-1' });
    expect(count1).toBe(count2);
    expect(count1).toBe(2);
  });

  it('filters by user_id', () => {
    const db = freshDb();
    insert(db, { cargo_id: 'c1', vessel_id: 'v1', fit_percent: 75, user_id: 'user-1' });
    insert(db, { cargo_id: 'c2', vessel_id: 'v2', fit_percent: 80, user_id: 'user-2' });
    const countUser1 = countQualifyingMatches(db, { user_id: 'user-1' });
    const countUser2 = countQualifyingMatches(db, { user_id: 'user-2' });
    expect(countUser1).toBe(1);
    expect(countUser2).toBe(1);
  });
});

