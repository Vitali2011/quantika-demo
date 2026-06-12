/**
 * createMatch refreshComputed flag (audit B.6).
 *
 * persistSessionMatches recomputes live economics on every render, but the
 * INSERT OR IGNORE against the unique (cargo_id, vessel_id, COALESCE(user_id,''),
 * cargo_item_index, vessel_item_index) index (migration 051) silently discards
 * the recomputed values for existing rows. The opt-in
 * refreshComputed flag updates the engine-computed columns in place — NEVER
 * touching status (user action), created_at, or identity columns.
 *
 * DB setup mirrors write-path-field-parity.test.ts: the full matches migration
 * chain, because migration 034 (unique index) is what makes the duplicate
 * insert a no-op and migration 042 provides fit_percent.
 */
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import migration044 from '@/lib/migrations/044-matches-item-index';
import migration045 from '@/lib/migrations/045-matches-worksheet';
import migration046 from '@/lib/migrations/046-matches-consumption-estimated';
import migration047 from '@/lib/migrations/047-matches-ballast-distance';
import migration050 from '@/lib/migrations/050-matches-breakeven';
import migration051 from '@/lib/migrations/051-matches-item-unique';
import { createMatch, listMatches } from '@/lib/matching/matches-repository';
import { persistSessionMatches } from '@/lib/matching/persist-session-matches';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration032.up(db);
  migration033.up(db);
  migration034.up(db);
  migration035.up(db);
  migration036.up(db);
  migration041.up(db);
  migration042.up(db);
  migration044.up(db);
  migration045.up(db);
  migration046.up(db);
  migration047.up(db);
  migration050.up(db);
  migration051.up(db);
  return db;
}

const base = {
  cargo_id: 'c1',
  vessel_id: 'v1',
  score: 50,
  reason: 'initial',
  user_id: 'sess-1',
  tce_usd_per_day: 1000,
  fit_percent: 61.5,
};

/** Make the second insert land in a later millisecond so the created_at
 *  preservation assertion is load-bearing (not a same-ms coincidence). */
function tick(ms = 5): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('createMatch refreshComputed (audit B.6)', () => {
  it('without the flag, duplicate insert is ignored (legacy semantics intact)', () => {
    const db = makeDb();
    createMatch(db, base);
    createMatch(db, { ...base, tce_usd_per_day: 2222, score: 70 });
    const [row] = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(row.tce_usd_per_day).toBe(1000);
    expect(row.score).toBe(50);
  });

  it('with the flag, computed columns refresh; status/created_at/id survive', async () => {
    const db = makeDb();
    createMatch(db, base);
    const [before] = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    db.prepare("UPDATE matches SET status='saved' WHERE id=?").run(before.id);

    await tick();
    const returned = createMatch(db, {
      ...base,
      tce_usd_per_day: 2222,
      score: 70,
      reason: 'refreshed',
      fit_percent: 72.5,
      refreshComputed: true,
    });

    const [after] = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(after.id).toBe(before.id);
    expect(after.tce_usd_per_day).toBe(2222);
    expect(after.score).toBe(70);
    expect(after.reason).toBe('refreshed');
    expect(after.fit_percent).toBe(72.5);
    expect(after.status).toBe('saved');           // user action NOT clobbered
    expect(after.created_at).toBe(before.created_at);
    // createMatch's existing-row fetch runs after the refresh → returns fresh values
    expect(returned.id).toBe(before.id);
    expect(returned.tce_usd_per_day).toBe(2222);
  });

  it('refresh respects the user_id boundary (NULL seed row vs session copy)', () => {
    const db = makeDb();
    createMatch(db, { ...base, user_id: null, tce_usd_per_day: 5555 });
    createMatch(db, base); // session copy
    createMatch(db, { ...base, tce_usd_per_day: 2222, refreshComputed: true });
    const seedRow = db.prepare('SELECT * FROM matches WHERE user_id IS NULL').get() as { tce_usd_per_day: number };
    expect(seedRow.tce_usd_per_day).toBe(5555);   // NULL-user row untouched
    const [sessionRow] = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(sessionRow.tce_usd_per_day).toBe(2222); // session copy refreshed
  });

  it('refresh with a NULL user_id targets only the NULL row', () => {
    const db = makeDb();
    createMatch(db, base); // session row first
    createMatch(db, { ...base, user_id: null, tce_usd_per_day: 5555 });
    createMatch(db, { ...base, user_id: null, tce_usd_per_day: 7777, refreshComputed: true });
    const seedRow = db.prepare('SELECT * FROM matches WHERE user_id IS NULL').get() as { tce_usd_per_day: number };
    expect(seedRow.tce_usd_per_day).toBe(7777);   // NULL row refreshed
    const [sessionRow] = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(sessionRow.tce_usd_per_day).toBe(1000); // session row untouched
  });
});

/**
 * REWRITTEN 2026-06-12: founder decision (audit C.5) — uniqueness is per item
 * pair; the 044-era one-per-email-pair semantics this test pinned are retired.
 *
 * Two matches for the SAME email pair with different item indices are now two
 * DISTINCT rows (migration 051 widened the unique index to include the item
 * indices). First-wins dedup survives only for duplicates of the SAME item
 * pair: engine output arrives sorted by fitPercent DESC, so the first (best)
 * duplicate persists and refreshComputed must not demote it to a worse later
 * copy.
 */
describe('persistSessionMatches — item-aware dedup (audit C.5)', () => {
  // Same cargo email with two items, both matched against the same vessel.
  const DUP_CARGO_ITEM0 = {
    emailId: 'cargo-dup', itemIndex: 0,
    originPort: { value: 'UAODS', confidence: 'confirmed' },
    destinationPort: { value: 'NLRTM', confidence: 'confirmed' },
    weightMt: { value: 5000, confidence: 'confirmed' },
    cargoType: 'GRAIN',
    freightRateUsd: null,
    missingInfo: [],
  } as unknown as ParsedCargo;

  const DUP_CARGO_ITEM1 = {
    ...DUP_CARGO_ITEM0, itemIndex: 1,
    weightMt: { value: 3000, confidence: 'confirmed' },
  } as unknown as ParsedCargo;

  const DUP_VESSEL = {
    emailId: 'vessel-dup', itemIndex: 0,
    dwtSummer: { value: 28000, confidence: 'confirmed' },
    speedLaden: '12 kn',
    consumption: '22 mt/day',
    restrictions: [],
    specialFeatures: [],
  } as unknown as ParsedVessel;

  function makeEngineMatch(overrides?: Partial<Match>): Match {
    return {
      cargoEmailId: 'cargo-dup',
      cargoItemIndex: 0,
      vesselEmailId: 'vessel-dup',
      vesselItemIndex: 0,
      score: 80,
      matchLevel: 'good',
      matchReasons: ['better item'],
      issues: [],
      fitPercent: 80,
      ...overrides,
    } as unknown as Match;
  }

  it('persists BOTH item rows of the same email pair, each with its own values', () => {
    const db = makeDb();
    const better = makeEngineMatch();
    const worse = makeEngineMatch({
      cargoItemIndex: 1, score: 40, fitPercent: 40, matchReasons: ['worse item'],
    });

    // Engine output is sorted by fitPercent DESC → better arrives first.
    persistSessionMatches(
      db, 'sess-1', [better, worse],
      [DUP_CARGO_ITEM0, DUP_CARGO_ITEM1], [DUP_VESSEL],
    );

    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(2);                 // one row PER ITEM pair (051)
    expect(rows[0].score).toBe(80);
    expect(rows[0].cargo_item_index).toBe(0);
    expect(rows[0].reason).toBe('better item');
    expect(rows[1].score).toBe(40);
    expect(rows[1].cargo_item_index).toBe(1);
    expect(rows[1].reason).toBe('worse item');
  });

  it('SAME item pair emitted twice: first (best) wins; refreshComputed must not demote it', () => {
    const db = makeDb();
    const better = makeEngineMatch();
    const worse = makeEngineMatch({
      score: 40, fitPercent: 40, matchReasons: ['worse duplicate'], // same item pair 0|0
    });

    persistSessionMatches(
      db, 'sess-1', [better, worse],
      [DUP_CARGO_ITEM0, DUP_CARGO_ITEM1], [DUP_VESSEL],
    );

    const rows = listMatches(db, { user_id: 'sess-1', sortBy: 'score', sortDir: 'desc' });
    expect(rows).toHaveLength(1);                 // duplicate item pair collapses
    expect(rows[0].score).toBe(80);               // best score survives
    expect(rows[0].fit_percent).toBe(80);         // best fit survives
    expect(rows[0].cargo_item_index).toBe(0);
    expect(rows[0].reason).toBe('better item');
  });
});
