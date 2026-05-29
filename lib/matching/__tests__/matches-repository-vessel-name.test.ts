/**
 * Tests — createMatch vessel_name / cargo_ref write-through.
 *
 * Uses migration 041 DB so vessel_name and cargo_ref columns exist.
 * PI2 behavioral: round-trips through createMatch and reads back via getMatch.
 */

import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import { createMatch, getMatch, listMatches } from '@/lib/matching/matches-repository';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import { computeAndPersistMatches } from '@/lib/matching/compute-matches';
import { resolveSyntheticCargo, resolveSyntheticVessel } from '@/lib/sample-data/synthetic-economics';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: jest.fn(),
}));
import { analyzePairs } from '@/lib/matching/pair-analyzer';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  return db;
}

describe('createMatch — vessel_name / cargo_ref columns', () => {
  it('persists vessel_name when provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'cargo-1',
      vessel_id: 'vessel-1',
      score: 80,
      reason: 'good fit',
      vessel_name: 'MV BARABULKA',
    });
    const fetched = getMatch(db, match.id);
    expect(fetched!.vessel_name).toBe('MV BARABULKA');
  });

  it('persists cargo_ref when provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'cargo-1',
      vessel_id: 'vessel-1',
      score: 80,
      reason: 'good fit',
      cargo_ref: 'Cement in sling bags, 10 000 mt',
    });
    const fetched = getMatch(db, match.id);
    expect(fetched!.cargo_ref).toBe('Cement in sling bags, 10 000 mt');
  });

  it('vessel_name is null when not provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'cargo-2',
      vessel_id: 'vessel-2',
      score: 60,
      reason: 'ok fit',
    });
    const fetched = getMatch(db, match.id);
    expect(fetched!.vessel_name).toBeNull();
  });

  it('cargo_ref is null when not provided', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'cargo-2',
      vessel_id: 'vessel-2',
      score: 60,
      reason: 'ok fit',
    });
    const fetched = getMatch(db, match.id);
    expect(fetched!.cargo_ref).toBeNull();
  });

  it('persists both vessel_name and cargo_ref together', () => {
    const db = freshDb();
    const match = createMatch(db, {
      cargo_id: 'cargo-3',
      vessel_id: 'vessel-3',
      score: 90,
      reason: 'excellent',
      vessel_name: 'PANTHERA J',
      cargo_ref: 'Iron ore, 50 000 mt',
    });
    const fetched = getMatch(db, match.id);
    expect(fetched!.vessel_name).toBe('PANTHERA J');
    expect(fetched!.cargo_ref).toBe('Iron ore, 50 000 mt');
  });
});

/**
 * Producer write-through — empty-string normalization.
 *
 * cfValue() returns the raw field value, so a ConfidenceField parsed as
 * { value: '' } yields "" (NOT null). The UI fallback `vessel_name ?? vessel_id`
 * uses ?? (null/undefined only), so a stored "" would render as a BLANK cell
 * instead of falling back to vessel_id. The producers must therefore normalize
 * "" -> null at write time (|| null, not ?? null).
 *
 * PI2 behavioral: drives the real persist/compute producers (where the
 * normalization lives — createMatch faithfully stores whatever it is given)
 * and reads back via listMatches.
 */
describe('producer write-through — empty-string vesselName/cargoDescription → null', () => {
  // Links to the synthetic demo cargo/vessel (same emailIds + itemIndex 0).
  const DEMO_MATCH: Match = {
    cargoEmailId: 'demo-cargo-economics',
    cargoItemIndex: 0,
    vesselEmailId: 'demo-vessel-economics',
    vesselItemIndex: 0,
    score: 88,
    matchLevel: 'good',
    matchReasons: ['DWT fit'],
    issues: [],
  };

  // The exact shape cfValue() collapses to "" — a parsed-but-empty ConfidenceField.
  const EMPTY_CF = { value: '', confidence: 'uncertain' as const };
  const emptyNameVessel = (): ParsedVessel => ({ ...resolveSyntheticVessel(new Date()), vesselName: EMPTY_CF });
  const emptyDescCargo = (): ParsedCargo => ({ ...resolveSyntheticCargo(new Date()), cargoDescription: EMPTY_CF });

  it('persistSessionMatches: empty cfValue("") stored as null (UI ?? fallback engages)', () => {
    const db = freshDb();
    persistSessionMatches(db, 'session-empty-cf', [DEMO_MATCH], [emptyDescCargo()], [emptyNameVessel()]);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match).toBeDefined();
    // Guard against a false-green: prove the vessel/cargo were actually linked
    // (otherwise the `vessel ? ... : null` branch yields null regardless of the fix).
    expect(match.vessel_dwt).toBe(58000);
    expect(match.load_port).toBe('CNSHA');
    // The fix under test: "" is normalized to null so the UI fallback engages.
    expect(match.vessel_name).toBeNull();
    expect(match.cargo_ref).toBeNull();
  });

  it('computeAndPersistMatches: empty cfValue("") stored as null', async () => {
    const db = freshDb();
    (analyzePairs as jest.Mock).mockResolvedValueOnce({ matches: [DEMO_MATCH], blockedMatches: [] });

    await computeAndPersistMatches([emptyDescCargo()], [emptyNameVessel()], 'session-empty-compute', db);

    const [match] = listMatches(db, { sortBy: 'score', sortDir: 'desc' });
    expect(match).toBeDefined();
    expect(match.vessel_dwt).toBe(58000);
    expect(match.load_port).toBe('CNSHA');
    expect(match.vessel_name).toBeNull();
    expect(match.cargo_ref).toBeNull();
  });
});
