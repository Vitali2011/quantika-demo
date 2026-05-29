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
import { createMatch, getMatch } from '@/lib/matching/matches-repository';

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
