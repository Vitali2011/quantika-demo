/**
 * Behavioral test — persistSessionMatches carries all 14 hard filters + sanctions
 * into worksheet_json (stage 0). PI2: real in-memory DB + real function call.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { resolveSyntheticCargo, resolveSyntheticVessel } from '@/lib/sample-data/synthetic-economics';
import type { Match, MatchWorksheet, MatchHardFilters } from '@/lib/types';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

const FULL_HARD_FILTERS: MatchHardFilters = {
  draft:  { pass: true },
  crane:  { pass: true, warning: true, reason: 'Confirm cranes' },
  volume: { pass: true },
  cargoVessel: { pass: true },
  destDraft: { pass: true },
  destCrane: { pass: true },
  cargoWeight: { pass: true },
  imsbc: { pass: false, reason: 'IMSBC Group B + DG-restricted' },
  vesselAge: { pass: true },
  dimensions: { pass: true },
  gearRequired: { pass: true },
  voyage: { pass: true },
  flagClass: { pass: true },
  warPositionVoyage: { pass: true },
};

function makeMatch(now: Date): Match {
  const cargo = resolveSyntheticCargo(now);
  const vessel = resolveSyntheticVessel(now);
  const worksheet: MatchWorksheet = {
    readiness: { verdict: 'ideal', explanation: '', openPosition: null,
      openDate: null, laycanStart: null, laycanEnd: null, distanceNm: null,
      distanceExact: false, speedKn: null, sailingDays: null, arrivalDate: null, gapDays: null },
    vessel: { draftMax: null, grainCapacity: null, grainCapacityUnit: null, geared: true,
      vesselType: 'BULK CARRIER', flag: 'PAN', built: 2010, pandi: null, classSociety: null,
      lastCargoes: null, dwtSummer: 57000, dwcc: null },
    cargo: { weightMt: 50000, cargoType: 'GRAIN', loadPort: 'NOLA', dischargePort: 'Rotterdam' },
    hardFilters: { draft: { pass: true }, crane: { pass: true }, volume: { pass: true } },
  };
  return {
    cargoEmailId: cargo.emailId,
    cargoItemIndex: 0,
    vesselEmailId: vessel.emailId,
    vesselItemIndex: 0,
    score: 80,
    matchLevel: 'good',
    matchReasons: ['test'],
    issues: [],
    hardFilters: FULL_HARD_FILTERS,
    sanctions: { risk: 'MEDIUM', reason: 'flag on watch list', blocking: false },
    worksheet,
  };
}

test('worksheet_json carries all 14 hard-filter keys', () => {
  const now = new Date();
  const db = freshDb();
  const cargo = resolveSyntheticCargo(now);
  const vessel = resolveSyntheticVessel(now);
  const m = makeMatch(now);
  persistSessionMatches(db, 'sess-1', [m], [cargo], [vessel]);
  const [row] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
  const ws = JSON.parse(row.worksheet_json!);
  const keys = Object.keys(ws.hardFilters);
  expect(keys).toEqual(expect.arrayContaining([
    'draft','crane','volume','cargoVessel','destDraft','destCrane','cargoWeight',
    'imsbc','vesselAge','dimensions','gearRequired','voyage','flagClass','warPositionVoyage',
  ]));
  expect(ws.hardFilters.imsbc.reason).toMatch(/IMSBC Group B/);
  expect(ws.hardFilters.crane.warning).toBe(true);
});

test('worksheet_json carries sanctions', () => {
  const now = new Date();
  const db = freshDb();
  const cargo = resolveSyntheticCargo(now);
  const vessel = resolveSyntheticVessel(now);
  const m = makeMatch(now);
  persistSessionMatches(db, 'sess-2', [m], [cargo], [vessel]);
  const [row] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
  const ws = JSON.parse(row.worksheet_json!);
  expect(ws.sanctions).toEqual({ risk: 'MEDIUM', reason: 'flag on watch list', blocking: false });
});

test('worksheet_json gracefully omits sanctions when absent on Match', () => {
  const now = new Date();
  const db = freshDb();
  const cargo = resolveSyntheticCargo(now);
  const vessel = resolveSyntheticVessel(now);
  const m = makeMatch(now);
  delete (m as Partial<Match>).sanctions;
  persistSessionMatches(db, 'sess-3', [m], [cargo], [vessel]);
  const [row] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
  const ws = JSON.parse(row.worksheet_json!);
  expect(ws.sanctions).toBeUndefined();
});
