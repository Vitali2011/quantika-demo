/**
 * test-skill ATTACK-4 (displayed-value-provenance / half-landed producer, audit B.3).
 * Branch: claude/compassionate-jennings-cb6e62 · HEAD: dded0315
 *
 * HISTORY: this file originally PINNED the QA FINDING-002 pre-fix behavior —
 * the demo hydrate producer (lib/demo-mode/hydrate-demo-session.ts
 * rowsToMatches) built economics with ONLY tceUsdPerDay (its SQL did not even
 * SELECT the freight columns), so toBucketRows produced mixed-provenance rows:
 * canonical TCE + NULL freight_rate_usd_per_mt + NULL freight_rate_source →
 * freightBadge(null) rendered "≈ Estimate" (dimmed) over a canonical value,
 * and the seed-resolved rate was dropped on the floor.
 *
 * UPDATED when FINDING-002 was fixed: hydrate now SELECTs
 * freight_rate_usd_per_mt / freight_rate_source and carries them into
 * economics, so these tests assert the FIXED behavior — the seed freight pair
 * survives the full producer chain (seed row → buildDemoSessionBlob →
 * toBucketRows), the same chain /matches uses for bucket tabs
 * (app/matches/page.tsx → toBucketRows(session.lowConfidenceMatches, …)).
 */
import Database from 'better-sqlite3';
import { buildDemoSessionBlob } from '@/lib/demo-mode/hydrate-demo-session';
import { toBucketRows } from '@/lib/matching/session-buckets';
import type { Match, ParsedCargo, ParsedVessel } from '@/lib/types';

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    cargoEmailId: 'c1',
    vesselEmailId: 'v1',
    cargoItemIndex: 0,
    vesselItemIndex: 0,
    score: 50,
    matchLevel: 'possible',
    matchReasons: ['test reason'],
    issues: [],
    ...overrides,
  } as unknown as Match;
}

// Ports that resolve a distance (same fixture as the campaign's own
// session-buckets-economics test, which proves the estimate path CAN fire
// for these fixtures when economics is absent).
const CARGO = {
  emailId: 'c1', itemIndex: 0,
  originPort: { value: 'Rotterdam', confidence: 'confirmed', source_text: 'Rotterdam' },
  destinationPort: { value: 'Santos', confidence: 'confirmed', source_text: 'Santos' },
  cargoType: { value: 'GRAIN', confidence: 'confirmed', source_text: 'grain' },
  weightMt: { value: 50000, confidence: 'confirmed', source_text: '50000' },
} as unknown as ParsedCargo;
const VESSEL = {
  emailId: 'v1', itemIndex: 0,
  dwtSummer: { value: 55000, confidence: 'confirmed', source_text: '55000' },
  speedLaden: '14',
  consumption: '28',
} as unknown as ParsedVessel;

/** Minimal demo-seed DB: schema mirrors lib/demo-mode/__tests__ fixtures; the
 *  freight columns are present (migration 036 shape) so the hydrate SELECT
 *  guard takes the real-column branch. Ports left NULL to keep war-risk out. */
function makeSeedDb(row: {
  tce: number | null;
  freightRate: number | null;
  freightSource: string | null;
}): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE emails (
      account_id TEXT, gmail_message_id TEXT, thread_id TEXT, from_addr TEXT,
      from_name TEXT, from_email TEXT, to_addr TEXT, subject TEXT, date TEXT,
      body TEXT, snippet TEXT, label_ids TEXT, fetched_at INTEGER
    );
    CREATE TABLE parsed_results (
      account_id TEXT, gmail_message_id TEXT, parse_type TEXT, parser_version TEXT,
      result_json TEXT, parsed_at INTEGER
    );
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY, cargo_id TEXT, vessel_id TEXT, score INTEGER,
      reason TEXT, status TEXT, user_id TEXT, created_at INTEGER, updated_at INTEGER,
      reason_structured TEXT,
      tce_usd_per_day REAL, freight_rate_usd_per_mt REAL, freight_rate_source TEXT
    );
  `);
  // Realism-bucket sentinel row — the exact producer FINDING-002 is about:
  // buildDemoSessionBlob reads it into blob.lowConfidenceMatches, which
  // app/matches/page.tsx feeds to toBucketRows.
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured, tce_usd_per_day, freight_rate_usd_per_mt, freight_rate_source)
    VALUES ('c1','v1',50,'review bucket','potential','__demo_review__',0,0,NULL,?,?,?)`)
    .run(row.tce, row.freightRate, row.freightSource);
  return db;
}

describe('hydrate carries the seed freight pair into bucket-row economics (QA FINDING-002 fixed)', () => {
  it('buildDemoSessionBlob economics carries the full triple (tce + freight rate + source) from the seed row', () => {
    const db = makeSeedDb({ tce: 7777, freightRate: 24.5, freightSource: 'baltic' });
    const blob = buildDemoSessionBlob(db);
    db.close();

    expect(blob.lowConfidenceMatches).toHaveLength(1);
    const eco = blob.lowConfidenceMatches![0].economics!;
    expect(eco.tceUsdPerDay).toBe(7777);
    // Pre-fix these were undefined (the SELECT dropped the columns).
    expect(eco.freightRateUsdPerMt).toBe(24.5);
    expect(eco.freightRateSource).toBe('baltic');
  });

  it('end-to-end: hydrated bucket row keeps canonical TCE AND the seed freight rate/source through toBucketRows', () => {
    const db = makeSeedDb({ tce: 7777, freightRate: 24.5, freightSource: 'baltic' });
    const blob = buildDemoSessionBlob(db);
    db.close();

    const [row] = toBucketRows(blob.lowConfidenceMatches!, [CARGO], [VESSEL]);
    expect(row.tce_usd_per_day).toBe(7777);
    // Pre-fix (pinned here): freight_rate_usd_per_mt = NULL, freight_rate_source
    // = NULL even though the seed had resolved a rate → freightBadge(null)
    // rendered "≈ Estimate" dimmed over a canonical TCE.
    expect(row.freight_rate_usd_per_mt).toBe(24.5);
    expect(row.freight_rate_source).toBe('baltic');
  });

  it('residual data gap: seed row with TCE but genuinely NULL freight columns still yields NULL freight (no fabricated provenance)', () => {
    const db = makeSeedDb({ tce: 7777, freightRate: null, freightSource: null });
    const blob = buildDemoSessionBlob(db);
    db.close();

    const [row] = toBucketRows(blob.lowConfidenceMatches!, [CARGO], [VESSEL]);
    // Canonical TCE blocks the estimate fallback (by design — economics-first
    // read), and there is no seed rate to carry: freight stays NULL. This is a
    // seed data gap, not the FINDING-002 producer drop.
    expect(row.tce_usd_per_day).toBe(7777);
    expect(row.freight_rate_usd_per_mt).toBeNull();
    expect(row.freight_rate_source).toBeNull();
  });

  it('control: estimate fallback still fires when economics is fully absent', () => {
    const [row] = toBucketRows([makeMatch()], [CARGO], [VESSEL]);
    expect(row.tce_usd_per_day).not.toBeNull();
    expect(row.freight_rate_source).toBe('estimated');
  });
});
