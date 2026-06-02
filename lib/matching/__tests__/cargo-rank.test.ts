/**
 * Behavioral tests — per-cargo fit rank cap in listMatches (Layer C)
 *
 * PI2: real DB + real function calls, not string-match.
 * Tests:
 *  - top-3 per cargo: cargo with 7 matches → board returns 3
 *  - rank resets per cargo independently
 *  - saved/dismissed override the cap (always visible)
 *  - tie-breaking: stable by id ASC when fit_percent equal
 *  - topPerCargo absent → all matches returned (no cap)
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';
import type { MatchStatus } from '@/lib/matching/matches-repository';

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

function insertFit(
  db: Database.Database,
  cargo_id: string,
  vessel_id: string,
  fit_percent: number,
  status: MatchStatus = 'shortlist',
) {
  return createMatch(db, {
    cargo_id,
    vessel_id,
    score: fit_percent,
    reason: '{}',
    fit_percent,
    status,
  });
}

describe('listMatches — topPerCargo cap (Layer C)', () => {
  it('returns all matches when topPerCargo not set', () => {
    const db = freshDb();
    for (let i = 1; i <= 7; i++) {
      insertFit(db, 'cargo-A', `vessel-${i}`, 100 - i * 5);
    }
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(results).toHaveLength(7);
  });

  it('caps shortlist matches to topPerCargo per cargo', () => {
    const db = freshDb();
    // 7 matches for cargo-A, fit [90,85,80,75,70,65,60]
    for (let i = 0; i < 7; i++) {
      insertFit(db, 'cargo-A', `vessel-${i + 1}`, 90 - i * 5);
    }
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3 });
    expect(results).toHaveLength(3);
    // Top 3 by fit: 90, 85, 80
    const fits = results.map((r) => r.fit_percent).sort((a, b) => (b ?? 0) - (a ?? 0));
    expect(fits).toEqual([90, 85, 80]);
  });

  it('rank resets per cargo — each cargo gets its own top-3', () => {
    const db = freshDb();
    // 5 matches for cargo-A, 4 matches for cargo-B
    for (let i = 0; i < 5; i++) {
      insertFit(db, 'cargo-A', `vessel-a${i + 1}`, 90 - i * 5);
    }
    for (let i = 0; i < 4; i++) {
      insertFit(db, 'cargo-B', `vessel-b${i + 1}`, 85 - i * 5);
    }
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3 });
    const aResults = results.filter((r) => r.cargo_id === 'cargo-A');
    const bResults = results.filter((r) => r.cargo_id === 'cargo-B');
    // cargo-A top-3, cargo-B top-3
    expect(aResults).toHaveLength(3);
    expect(bResults).toHaveLength(3);
    expect(results).toHaveLength(6);
  });

  it('saved/dismissed matches override the cap — always visible', () => {
    const db = freshDb();
    // 5 shortlist for cargo-A (ranks 1-5), 1 saved (would be rank 6), 1 dismissed (rank 7)
    for (let i = 0; i < 5; i++) {
      insertFit(db, 'cargo-A', `vessel-sl${i + 1}`, 90 - i * 5, 'shortlist');
    }
    const saved = insertFit(db, 'cargo-A', 'vessel-saved', 35, 'saved');
    const dismissed = insertFit(db, 'cargo-A', 'vessel-dismissed', 30, 'dismissed');

    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3 });

    // shortlist: top 3 (90, 85, 80); saved + dismissed: always shown → 5 total
    expect(results).toHaveLength(5);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(saved.id);
    expect(ids).toContain(dismissed.id);
  });

  it('tie-breaking is stable by id ASC', () => {
    const db = freshDb();
    // 5 matches with same fit_percent — rank by id ASC (insertion order)
    for (let i = 0; i < 5; i++) {
      insertFit(db, 'cargo-A', `vessel-tie${i + 1}`, 80);
    }
    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3 });
    expect(results).toHaveLength(3);
    // Should be the first 3 inserted (lowest ids)
    const sortedById = [...results].sort((a, b) => a.id - b.id);
    expect(sortedById[0].vessel_id).toBe('vessel-tie1');
    expect(sortedById[1].vessel_id).toBe('vessel-tie2');
    expect(sortedById[2].vessel_id).toBe('vessel-tie3');
  });

  it('null fit_percent ranked after non-null, stable by id when null', () => {
    const db = freshDb();
    // 4 matches with fit_percent, 2 with null
    for (let i = 0; i < 4; i++) {
      insertFit(db, 'cargo-A', `vessel-fit${i + 1}`, 90 - i * 10);
    }
    createMatch(db, { cargo_id: 'cargo-A', vessel_id: 'vessel-null1', score: 50, reason: '{}', fit_percent: null });
    createMatch(db, { cargo_id: 'cargo-A', vessel_id: 'vessel-null2', score: 48, reason: '{}', fit_percent: null });

    const results = listMatches(db, { sortBy: 'score', sortDir: 'desc', topPerCargo: 3 });
    // top-3 by fit_percent: 90, 80, 70
    expect(results).toHaveLength(3);
    const fits = results.map((r) => r.fit_percent).sort((a, b) => (b ?? 0) - (a ?? 0));
    expect(fits).toEqual([90, 80, 70]);
  });
});
