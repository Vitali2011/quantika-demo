/**
 * Tests — matches-repository worksheet_json support
 * TDD: write + read worksheet_json; NULL-safe on pre-045 DB
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { runMigrations } from '../lib/migrations/runner';
import { allMigrations } from '../lib/migrations';
import { createMatch } from '../lib/matching/matches-repository';

function makeFullDb(): Database.Database {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  runMigrations(db, allMigrations);
  return db;
}

function makePartialDb(): Database.Database {
  const db = new Database(':memory:');
  sqliteVec.load(db);
  runMigrations(db, allMigrations.slice(0, 44));
  return db;
}

const base = { cargo_id: 'cargo1', vessel_id: 'vessel1', score: 75, reason: 'test' };

const sampleWorksheet = JSON.stringify({
  readiness: {
    openPosition: 'Hamburg',
    openDate: '2026-06-01',
    laycanStart: '2026-06-10',
    laycanEnd: '2026-06-20',
    distanceNm: 500,
    distanceExact: true,
    speedKn: 12,
    sailingDays: 2,
    arrivalDate: '2026-06-03',
    gapDays: 7,
    verdict: 'ideal',
    explanation: 'Good fit',
  },
  vessel: {
    draftMax: 11.5,
    grainCapacity: 45000,
    grainCapacityUnit: 'cbm',
    geared: true,
    vesselType: 'bulk carrier',
    flag: 'BHS',
    built: 2015,
    pandi: 'NorthofEngland',
    classSociety: 'BV',
    lastCargoes: 'grain',
    dwtSummer: 38000,
    dwcc: 36000,
  },
  cargo: { weightMt: 30000, cargoType: 'grain', loadPort: 'Rotterdam', dischargePort: 'Alexandria' },
  hardFilters: {
    draft: { pass: true, reason: 'ok' },
    crane: { pass: true, reason: 'ok' },
    volume: { pass: true, reason: 'ok' },
  },
});

describe('matches-repository — worksheet_json', () => {
  it('createMatch writes worksheet_json when column present', () => {
    const db = makeFullDb();
    const m = createMatch(db, { ...base, worksheet_json: sampleWorksheet });
    const row = db.prepare('SELECT worksheet_json FROM matches WHERE id = ?').get(m.id) as {
      worksheet_json: string | null;
    };
    expect(row.worksheet_json).toBe(sampleWorksheet);
  });

  it('createMatch writes NULL when worksheet_json not provided', () => {
    const db = makeFullDb();
    const m = createMatch(db, { ...base, cargo_id: 'cargo2', vessel_id: 'vessel2' });
    const row = db.prepare('SELECT worksheet_json FROM matches WHERE id = ?').get(m.id) as {
      worksheet_json: string | null;
    };
    expect(row.worksheet_json).toBeNull();
  });

  it('createMatch is NULL-safe on a pre-045 DB (no worksheet column)', () => {
    const db = makePartialDb();
    expect(() =>
      createMatch(db, { ...base, cargo_id: 'cargo3', vessel_id: 'vessel3', worksheet_json: sampleWorksheet }),
    ).not.toThrow();
  });
});
