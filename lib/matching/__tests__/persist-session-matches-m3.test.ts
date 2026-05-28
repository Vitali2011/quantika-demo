/**
 * Behavioral tests — persistSessionMatches M3 field write-through (demo match)
 *
 * PI2: real DB + real function call. Verifies that the guaranteed demo match
 * injected by /api/sample is persisted with non-null M3 fields when the
 * session carries parsed cargo/vessel data.
 *
 * Regression guard for #393 (demo match had NULL cargo_type/ports/laycan/dwt).
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { listMatches } from '@/lib/matching/matches-repository';
import { resolveSyntheticCargo, resolveSyntheticVessel } from '@/lib/sample-data/synthetic-economics';
import type { Match } from '@/lib/types';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  return db;
}

const DEMO_MATCH: Match = {
  cargoEmailId: 'demo-cargo-economics',
  cargoItemIndex: 0,
  vesselEmailId: 'demo-vessel-economics',
  vesselItemIndex: 0,
  score: 92,
  matchLevel: 'good',
  matchReasons: ['Good DWT fit — 58,000 mt vessel vs 50,000 mt grain cargo'],
  issues: [],
};

describe('persistSessionMatches — M3 field write-through (demo match, #393)', () => {
  const now = new Date();
  const demoCargo = resolveSyntheticCargo(now);
  const demoVessel = resolveSyntheticVessel(now);

  it('persists cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt as non-null', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-demo-1', [DEMO_MATCH], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match).toBeDefined();

    expect(match.cargo_type).toBe('BULK');
    expect(match.load_port).toBe('CNSHA');
    expect(match.discharge_port).toBe('NLRTM');
    expect(match.laycan_start).not.toBeNull();
    expect(match.laycan_end).not.toBeNull();
    expect(match.vessel_dwt).toBe(58000);
  });

  it('laycan_start < laycan_end (valid date range)', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-demo-2', [DEMO_MATCH], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match.laycan_start!).toBeLessThan(match.laycan_end!);
  });

  it('reason field contains realistic match text without internal template tokens', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-demo-3', [DEMO_MATCH], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match.reason).toBe('Good DWT fit — 58,000 mt vessel vs 50,000 mt grain cargo');
    expect(match.reason).not.toContain('EconomicsTab');
  });

  it('null-safe: no parsed cargo/vessel → M3 fields stored as null (no crash)', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-demo-4', [DEMO_MATCH], [], []);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match).toBeDefined();
    expect(match.cargo_type).toBeNull();
    expect(match.load_port).toBeNull();
    expect(match.discharge_port).toBeNull();
    expect(match.laycan_start).toBeNull();
    expect(match.laycan_end).toBeNull();
    expect(match.vessel_dwt).toBeNull();
  });

});
