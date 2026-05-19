/**
 * Unit tests — listMatches LIKE pattern escaping (M-1 hardening).
 *
 * Route search params containing SQL LIKE metacharacters (%, _, \) must match
 * literally, not as wildcards. Otherwise:
 *   - `route=_` would match every load_port (false positives)
 *   - `route=%foo%` would inject extra wildcards
 *   - `route=\` would break the ESCAPE clause if not handled
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import { listMatches } from '@/lib/matching/matches-repository';

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

function seed(db: Database.Database, load: string, discharge: string, cargo_id = `c-${load}-${discharge}`): void {
  db.prepare(
    `INSERT INTO matches
      (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at,
       load_port, discharge_port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(cargo_id, 'v-1', 70, '{}', 'shortlist', null, Date.now(), Date.now(), load, discharge);
}

describe('listMatches — LIKE pattern escaping (route filter)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration032.up(db);
    migration033Up(db);
  });

  afterEach(() => {
    db.close();
  });

  it('underscore in route is treated literally, not as wildcard', () => {
    seed(db, 'NLRTM', 'USHOU', 'c-rtm');
    seed(db, 'XX_YY', 'ZZAAA', 'c-underscore');

    const results = listMatches(db, {
      sortBy: 'score',
      sortDir: 'desc',
      route: '_',
    });

    // `_` must match only the row that literally contains `_`
    expect(results.map((r) => r.cargo_id).sort()).toEqual(['c-underscore']);
  });

  it('percent in route is treated literally, not as wildcard', () => {
    seed(db, 'NLRTM', 'USHOU', 'c-rtm');
    seed(db, '50%PORT', 'AABBB', 'c-percent');

    const results = listMatches(db, {
      sortBy: 'score',
      sortDir: 'desc',
      route: '%',
    });

    // `%` must match only the row that literally contains `%`
    expect(results.map((r) => r.cargo_id).sort()).toEqual(['c-percent']);
  });

  it('backslash in route is treated literally and does not break the ESCAPE clause', () => {
    seed(db, 'NLRTM', 'USHOU', 'c-rtm');
    seed(db, 'A\\B', 'CCDDD', 'c-backslash');

    const results = listMatches(db, {
      sortBy: 'score',
      sortDir: 'desc',
      route: '\\',
    });

    expect(results.map((r) => r.cargo_id).sort()).toEqual(['c-backslash']);
  });

  it('combined metacharacters: route="%_\\" matches only literal occurrence', () => {
    seed(db, 'PLAIN', 'PORT', 'c-plain');
    seed(db, 'WEIRD%_\\NAME', 'XXYYY', 'c-weird');

    const results = listMatches(db, {
      sortBy: 'score',
      sortDir: 'desc',
      route: '%_\\',
    });

    expect(results.map((r) => r.cargo_id)).toEqual(['c-weird']);
  });

  it('normal alphabetic route still works (regression)', () => {
    seed(db, 'NLRTM', 'USHOU', 'c-rtm');
    seed(db, 'DEHAM', 'BRSSZ', 'c-ham');

    const results = listMatches(db, {
      sortBy: 'score',
      sortDir: 'desc',
      route: 'RTM',
    });

    expect(results.map((r) => r.cargo_id)).toEqual(['c-rtm']);
  });

  it('case-insensitive matching is preserved (regression)', () => {
    seed(db, 'NLRTM', 'USHOU', 'c-rtm');

    const results = listMatches(db, {
      sortBy: 'score',
      sortDir: 'desc',
      route: 'rtm',
    });

    expect(results.map((r) => r.cargo_id)).toEqual(['c-rtm']);
  });
});
