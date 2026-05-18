// @ts-nocheck — RED phase: types for M3 fields don't exist yet; impl agent adds them
/**
 * RED tests — matches-repository.ts (M3 advanced filters + new fields)
 *
 * Covers:
 *   - cargo_type filter: single value, multi-value OR, no match, null rows excluded
 *   - route filter: load_port substring, discharge_port substring, case-insensitive, no match
 *   - laycan filter: from-only, to-only, range overlap (laycan_start <= laycan_to AND laycan_end >= laycan_from), null excluded
 *   - score_min filter: above threshold, exact, below excluded
 *   - dwt filter: dwt_min only, dwt_max only, both range
 *   - Combination: cargo_type + score_min + dwt_min
 *   - createMatch: stores new fields; round-trips correctly; null fields stored as null
 *   - Boundary Class 1 (Empty): empty cargo_type array → no filter applied
 *   - Boundary Class 2: score_min = 0 (valid edge)
 *   - Boundary Class 3 (Negative): score_min negative → treated as 0 / ignored (assumption documented)
 *   - Boundary Class 5 (Switch): unknown cargo_type → returns empty, not error
 *   - Boundary Class 10 (Cleanroom): no implementation read
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import {
  listMatches,
  createMatch,
  getMatch,
} from '@/lib/matching/matches-repository';
import type { StoredMatch, MatchStatus } from '@/lib/matching/matches-repository';

// ──────────────────────────────────────────────────────────────────────────────
// Migration 033 helper — applies the M3 schema additions to an in-memory DB
// ──────────────────────────────────────────────────────────────────────────────

function migration033Up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE matches ADD COLUMN reason_structured TEXT;
    ALTER TABLE matches ADD COLUMN cargo_type TEXT;
    ALTER TABLE matches ADD COLUMN load_port TEXT;
    ALTER TABLE matches ADD COLUMN discharge_port TEXT;
    ALTER TABLE matches ADD COLUMN laycan_start INTEGER;
    ALTER TABLE matches ADD COLUMN laycan_end INTEGER;
    ALTER TABLE matches ADD COLUMN vessel_dwt INTEGER;
  `);
}

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033Up(db);
  return db;
}

type NewFieldOverrides = Partial<{
  cargo_type: string | null;
  load_port: string | null;
  discharge_port: string | null;
  laycan_start: number | null;
  laycan_end: number | null;
  vessel_dwt: number | null;
  reason_structured: string | null;
  score: number;
  status: MatchStatus;
}>;

function insertMatch(
  db: Database.Database,
  overrides: NewFieldOverrides & { cargo_id?: string; vessel_id?: string } = {}
): StoredMatch {
  return createMatch(db, {
    cargo_id: overrides.cargo_id ?? 'cargo-1',
    vessel_id: overrides.vessel_id ?? 'vessel-1',
    score: overrides.score ?? 75,
    reason: '{}',
    status: overrides.status ?? 'shortlist',
    user_id: null,
    reason_structured: overrides.reason_structured ?? null,
    cargo_type: overrides.cargo_type ?? null,
    load_port: overrides.load_port ?? null,
    discharge_port: overrides.discharge_port ?? null,
    laycan_start: overrides.laycan_start ?? null,
    laycan_end: overrides.laycan_end ?? null,
    vessel_dwt: overrides.vessel_dwt ?? null,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// createMatch — new fields round-trip
// ──────────────────────────────────────────────────────────────────────────────

describe('createMatch — M3 new fields', () => {
  it('stores reason_structured and returns it in StoredMatch', () => {
    const db = freshDb();
    const structured = JSON.stringify({ score_breakdown: { cargo: 30, route: 40 } });
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 70,
      reason: '{}',
      reason_structured: structured,
    });
    expect(match.reason_structured).toBe(structured);
  });

  it('stores cargo_type and returns it in StoredMatch', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 70,
      reason: '{}',
      cargo_type: 'grain',
    });
    expect(match.cargo_type).toBe('grain');
  });

  it('stores load_port and discharge_port', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 70,
      reason: '{}',
      load_port: 'NLRTM',
      discharge_port: 'USMIA',
    });
    expect(match.load_port).toBe('NLRTM');
    expect(match.discharge_port).toBe('USMIA');
  });

  it('stores laycan_start and laycan_end as unix ms integers', () => {
    const db = freshDb();
    const start = new Date('2026-06-01').getTime();
    const end = new Date('2026-06-30').getTime();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 70,
      reason: '{}',
      laycan_start: start,
      laycan_end: end,
    });
    expect(match.laycan_start).toBe(start);
    expect(match.laycan_end).toBe(end);
  });

  it('stores vessel_dwt as integer', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 70,
      reason: '{}',
      vessel_dwt: 50000,
    });
    expect(match.vessel_dwt).toBe(50000);
  });

  it('stores all null new fields when not provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 50,
      reason: '{}',
    });
    expect(match.reason_structured).toBeNull();
    expect(match.cargo_type).toBeNull();
    expect(match.load_port).toBeNull();
    expect(match.discharge_port).toBeNull();
    expect(match.laycan_start).toBeNull();
    expect(match.laycan_end).toBeNull();
    expect(match.vessel_dwt).toBeNull();
  });

  it('getMatch returns new fields after createMatch', () => {
    const db = freshDb();
    const created = createMatch(db, {
      cargo_id: 'c1',
      vessel_id: 'v1',
      score: 80,
      reason: '{}',
      cargo_type: 'coal',
      load_port: 'GBAMS',
      vessel_dwt: 75000,
    });
    const found = getMatch(db, created.id);
    expect(found).not.toBeNull();
    expect(found!.cargo_type).toBe('coal');
    expect(found!.load_port).toBe('GBAMS');
    expect(found!.vessel_dwt).toBe(75000);
  });

  it('StoredMatch includes reason_structured field (may be null)', () => {
    const db = freshDb();
    const match = insertMatch(db);
    // M3 contract: reason_structured must be a key on StoredMatch (null when not stored)
    expect('reason_structured' in match).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// cargo_type filter
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches — cargo_type filter', () => {
  it('returns matches with matching cargo_type (single value)', () => {
    const db = freshDb();
    insertMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    insertMatch(db, { cargo_type: 'coal', cargo_id: 'c2' });
    const results = listMatches(db, {
      cargo_type: ['grain'],
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].cargo_type).toBe('grain');
  });

  it('returns matches for multiple cargo_type values (OR logic)', () => {
    const db = freshDb();
    insertMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    insertMatch(db, { cargo_type: 'coal', cargo_id: 'c2' });
    insertMatch(db, { cargo_type: 'cement', cargo_id: 'c3' });
    const results = listMatches(db, {
      cargo_type: ['grain', 'coal'],
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(2);
    const types = results.map((r) => r.cargo_type);
    expect(types).toContain('grain');
    expect(types).toContain('coal');
  });

  it('returns empty when no match for cargo_type', () => {
    const db = freshDb();
    insertMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    const results = listMatches(db, {
      cargo_type: ['fertilizer'],
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(0);
  });

  it('excludes rows where cargo_type is null when filter is specified', () => {
    const db = freshDb();
    insertMatch(db, { cargo_type: null, cargo_id: 'c1' });
    insertMatch(db, { cargo_type: 'grain', cargo_id: 'c2' });
    const results = listMatches(db, {
      cargo_type: ['grain'],
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].cargo_type).toBe('grain');
  });

  // Boundary Class 1 — empty array: no filter applied, all results returned
  it('Class 1: empty cargo_type array applies no filter (returns all)', () => {
    const db = freshDb();
    insertMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    insertMatch(db, { cargo_type: null, cargo_id: 'c2' });
    const results = listMatches(db, {
      cargo_type: [],
      sortBy: 'score',
      sortDir: 'desc',
    });
    // Empty array = no filter: all 2 rows returned
    expect(results).toHaveLength(2);
  });

  // Boundary Class 5 — unknown cargo_type returns empty, not error
  it('Class 5: unknown cargo_type returns empty list (not 400 or throw)', () => {
    const db = freshDb();
    insertMatch(db, { cargo_type: 'grain', cargo_id: 'c1' });
    expect(() => {
      const results = listMatches(db, {
        cargo_type: ['__nonexistent__'],
        sortBy: 'score',
        sortDir: 'desc',
      });
      expect(results).toHaveLength(0);
    }).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// route filter
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches — route filter', () => {
  it('finds matches when route matches load_port substring', () => {
    const db = freshDb();
    insertMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });
    insertMatch(db, { load_port: 'GBAMS', discharge_port: 'DEBRV', cargo_id: 'c2' });
    const results = listMatches(db, {
      route: 'NLRTM',
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].load_port).toBe('NLRTM');
  });

  it('finds matches when route matches discharge_port substring', () => {
    const db = freshDb();
    insertMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });
    insertMatch(db, { load_port: 'GBAMS', discharge_port: 'DEBRV', cargo_id: 'c2' });
    const results = listMatches(db, {
      route: 'DEBRV',
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].discharge_port).toBe('DEBRV');
  });

  it('route search is case-insensitive', () => {
    const db = freshDb();
    insertMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });
    const resultsUpper = listMatches(db, {
      route: 'nlrtm',
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(resultsUpper).toHaveLength(1);
    const resultsLower = listMatches(db, {
      route: 'NLRTM',
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(resultsLower).toHaveLength(1);
  });

  it('returns empty when route matches neither load_port nor discharge_port', () => {
    const db = freshDb();
    insertMatch(db, { load_port: 'NLRTM', discharge_port: 'USNYC', cargo_id: 'c1' });
    const results = listMatches(db, {
      route: 'FRPNT',
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(0);
  });

  it('returns match when route substring found in load_port (partial match)', () => {
    const db = freshDb();
    insertMatch(db, { load_port: 'NL-RTM-PORT', discharge_port: 'USNYC', cargo_id: 'c1' });
    const results = listMatches(db, {
      route: 'RTM',
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// laycan filter (range overlap semantics)
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches — laycan filter', () => {
  // Laycan range overlap: match row when laycan_start <= laycan_to AND laycan_end >= laycan_from
  // (i.e., the match's window overlaps with the query window)

  const JUNE1 = new Date('2026-06-01').getTime();
  const JUNE15 = new Date('2026-06-15').getTime();
  const JUNE30 = new Date('2026-06-30').getTime();
  const MAY1 = new Date('2026-05-01').getTime();
  const MAY31 = new Date('2026-05-31').getTime();
  const JULY1 = new Date('2026-07-01').getTime();

  it('laycan_from only: returns match whose laycan_end >= laycan_from', () => {
    const db = freshDb();
    // Match spans June (overlaps with from=June1)
    insertMatch(db, { laycan_start: JUNE1, laycan_end: JUNE30, cargo_id: 'c1' });
    // Match entirely in May (laycan_end < June1)
    insertMatch(db, { laycan_start: MAY1, laycan_end: MAY31, cargo_id: 'c2' });
    const results = listMatches(db, {
      laycan_from: JUNE1,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].cargo_id).toBe('c1');
  });

  it('laycan_to only: returns match whose laycan_start <= laycan_to', () => {
    const db = freshDb();
    // Match starts in June (June1 <= June30 = laycan_to)
    insertMatch(db, { laycan_start: JUNE1, laycan_end: JUNE30, cargo_id: 'c1' });
    // Match starts in July (July1 > June30)
    insertMatch(db, { laycan_start: JULY1, laycan_end: JULY1 + 86400000, cargo_id: 'c2' });
    const results = listMatches(db, {
      laycan_to: JUNE30,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].cargo_id).toBe('c1');
  });

  it('laycan range overlap: both from and to — returns overlapping match', () => {
    const db = freshDb();
    // Fully within query range
    insertMatch(db, { laycan_start: JUNE1, laycan_end: JUNE15, cargo_id: 'c1' });
    // Entirely before query range
    insertMatch(db, { laycan_start: MAY1, laycan_end: MAY31, cargo_id: 'c2' });
    // Partially overlapping (starts before, ends within)
    insertMatch(db, { laycan_start: MAY31, laycan_end: JUNE15, cargo_id: 'c3' });
    // Entirely after query range
    insertMatch(db, { laycan_start: JULY1, laycan_end: JULY1 + 86400000, cargo_id: 'c4' });

    const results = listMatches(db, {
      laycan_from: JUNE1,
      laycan_to: JUNE30,
      sortBy: 'score',
      sortDir: 'desc',
    });
    const ids = results.map((r) => r.cargo_id).sort();
    // c1 (overlaps) and c3 (starts before, ends inside = overlap) should match
    expect(ids).toContain('c1');
    expect(ids).toContain('c3');
    // c2 (entirely before) and c4 (entirely after) should NOT match
    expect(ids).not.toContain('c2');
    expect(ids).not.toContain('c4');
  });

  it('excludes rows where laycan_start and laycan_end are null when filter is specified', () => {
    const db = freshDb();
    insertMatch(db, { laycan_start: null, laycan_end: null, cargo_id: 'c1' });
    insertMatch(db, { laycan_start: JUNE1, laycan_end: JUNE30, cargo_id: 'c2' });
    const results = listMatches(db, {
      laycan_from: JUNE1,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results.map((r) => r.cargo_id)).not.toContain('c1');
    expect(results.map((r) => r.cargo_id)).toContain('c2');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// score_min filter
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches — score_min filter', () => {
  it('returns only matches with score >= score_min', () => {
    const db = freshDb();
    insertMatch(db, { score: 80, cargo_id: 'c1' });
    insertMatch(db, { score: 50, cargo_id: 'c2' });
    insertMatch(db, { score: 30, cargo_id: 'c3' });
    const results = listMatches(db, {
      score_min: 60,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(80);
  });

  it('includes match at exact score_min threshold', () => {
    const db = freshDb();
    insertMatch(db, { score: 60, cargo_id: 'c1' });
    insertMatch(db, { score: 59, cargo_id: 'c2' });
    const results = listMatches(db, {
      score_min: 60,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(60);
  });

  it('excludes all matches below score_min', () => {
    const db = freshDb();
    insertMatch(db, { score: 40, cargo_id: 'c1' });
    insertMatch(db, { score: 20, cargo_id: 'c2' });
    const results = listMatches(db, {
      score_min: 70,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(0);
  });

  // Boundary Class 2 — score_min = 0 is valid and returns all matches
  it('Class 2: score_min=0 returns all matches (valid edge)', () => {
    const db = freshDb();
    insertMatch(db, { score: 0, cargo_id: 'c1' });
    insertMatch(db, { score: 50, cargo_id: 'c2' });
    const results = listMatches(db, {
      score_min: 0,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(2);
  });

  // Boundary Class 3 — negative score_min: assumption is it's treated as 0 (returns all)
  it('Class 3: negative score_min treated as 0 / ignored (returns all)', () => {
    const db = freshDb();
    insertMatch(db, { score: 10, cargo_id: 'c1' });
    insertMatch(db, { score: 50, cargo_id: 'c2' });
    // Assumption: negative score_min is effectively 0 — all rows included
    const results = listMatches(db, {
      score_min: -1,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// dwt filter
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches — dwt filter', () => {
  it('dwt_min only: returns matches with vessel_dwt >= dwt_min', () => {
    const db = freshDb();
    insertMatch(db, { vessel_dwt: 50000, cargo_id: 'c1' });
    insertMatch(db, { vessel_dwt: 20000, cargo_id: 'c2' });
    const results = listMatches(db, {
      dwt_min: 30000,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].vessel_dwt).toBe(50000);
  });

  it('dwt_max only: returns matches with vessel_dwt <= dwt_max', () => {
    const db = freshDb();
    insertMatch(db, { vessel_dwt: 50000, cargo_id: 'c1' });
    insertMatch(db, { vessel_dwt: 90000, cargo_id: 'c2' });
    const results = listMatches(db, {
      dwt_max: 70000,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].vessel_dwt).toBe(50000);
  });

  it('dwt range: both min and max applied (inclusive)', () => {
    const db = freshDb();
    insertMatch(db, { vessel_dwt: 30000, cargo_id: 'c1' });
    insertMatch(db, { vessel_dwt: 55000, cargo_id: 'c2' });
    insertMatch(db, { vessel_dwt: 80000, cargo_id: 'c3' });
    insertMatch(db, { vessel_dwt: 10000, cargo_id: 'c4' });
    const results = listMatches(db, {
      dwt_min: 30000,
      dwt_max: 80000,
      sortBy: 'score',
      sortDir: 'desc',
    });
    const ids = results.map((r) => r.cargo_id).sort();
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
    expect(ids).not.toContain('c4');
  });

  it('excludes rows with null vessel_dwt when dwt filter specified', () => {
    const db = freshDb();
    insertMatch(db, { vessel_dwt: null, cargo_id: 'c1' });
    insertMatch(db, { vessel_dwt: 50000, cargo_id: 'c2' });
    const results = listMatches(db, {
      dwt_min: 30000,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results.map((r) => r.cargo_id)).not.toContain('c1');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Combination filter
// ──────────────────────────────────────────────────────────────────────────────

describe('listMatches — combination filter', () => {
  it('cargo_type + score_min + dwt_min: only returns matches satisfying all three', () => {
    const db = freshDb();
    // Matches all three conditions
    insertMatch(db, { cargo_type: 'grain', score: 80, vessel_dwt: 60000, cargo_id: 'c1' });
    // Wrong cargo_type
    insertMatch(db, { cargo_type: 'coal', score: 80, vessel_dwt: 60000, cargo_id: 'c2' });
    // score too low
    insertMatch(db, { cargo_type: 'grain', score: 50, vessel_dwt: 60000, cargo_id: 'c3' });
    // dwt too low
    insertMatch(db, { cargo_type: 'grain', score: 80, vessel_dwt: 20000, cargo_id: 'c4' });

    const results = listMatches(db, {
      cargo_type: ['grain'],
      score_min: 70,
      dwt_min: 30000,
      sortBy: 'score',
      sortDir: 'desc',
    });
    expect(results).toHaveLength(1);
    expect(results[0].cargo_id).toBe('c1');
  });
});
