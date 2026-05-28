/**
 * Behavioral tests — distance_nm UNLOCODE populate gap fix (#407)
 *
 * PI2: Tests the full persist path. The mock below redirects @/lib/sailing/port-distances
 * (which normally resolves to the main repo via @/ alias) to the worktree's own module,
 * so the UNLOCODE fix is exercised end-to-end through persistSessionMatches.
 *
 * Root cause: load_port='CNSHA' / discharge_port='NLRTM' are UNLOCODE codes.
 * getPortDistance() calls normalizePortName() which had no UNLOCODE lookup path,
 * so it returned null → distance_nm stored as null for all demo-seed matches.
 *
 * Fix: normalizePortName() now checks for 5-char all-caps UNLOCODE pattern
 * and resolves via PortMasterIndex.byUnlocode() before the alias table.
 */

// Redirect @/lib/sailing/port-distances to the worktree's module so the UNLOCODE
// fix in this branch is exercised (not the main repo's pre-fix version).
jest.mock('@/lib/sailing/port-distances', () =>
  jest.requireActual('../../sailing/port-distances'),
);

import Database from 'better-sqlite3';
import migration032 from '../../migrations/032-matches';
import migration033 from '../../migrations/033-matches-score-breakdown';
import migration034 from '../../migrations/034-matches-unique-constraint';
import migration035 from '../../migrations/035-matches-tce-distance';
import { persistSessionMatches } from '../persist-session-matches';
import { listMatches } from '../matches-repository';
import { resolveSyntheticCargo, resolveSyntheticVessel } from '../../sample-data/synthetic-economics';
import type { Match } from '../../types';

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

describe('distance_nm UNLOCODE populate fix — full persist path (#407)', () => {
  const now = new Date();
  const demoCargo = resolveSyntheticCargo(now);
  const demoVessel = resolveSyntheticVessel(now);

  it('load_port is CNSHA (UNLOCODE, not human name)', () => {
    // Confirm the demo cargo actually uses a UNLOCODE so the fix is exercised
    expect(demoCargo.originPort?.value).toBe('CNSHA');
    expect(demoCargo.destinationPort?.value).toBe('NLRTM');
  });

  it('distance_nm is non-null after persist (CNSHA→NLRTM resolves via UNLOCODE fix)', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-unlocode-1', [DEMO_MATCH], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match).toBeDefined();
    expect(match.distance_nm).not.toBeNull();
    expect(match.distance_nm).toBeGreaterThan(0);
  });

  it('distance_nm matches getPortDistance("Shanghai", "Rotterdam") via name', () => {
    // The UNLOCODE path must resolve to the same distance as the human-name path
    const { getPortDistance } = require('../../sailing/port-distances');
    const expected = getPortDistance('Shanghai', 'Rotterdam');
    expect(expected).not.toBeNull();

    const db = freshDb();
    persistSessionMatches(db, 'session-unlocode-2', [DEMO_MATCH], [demoCargo], [demoVessel]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match.distance_nm).toBe(expected!.nm);
  });
});
