/**
 * audit-1 LOW item 8 — bucket-TCE vs board divergence.
 *
 * The board/shortlist path (lib/matching/persist-session-matches.ts) recomputes
 * economics LIVE on every render via resolveRecommendedBunkerPort +
 * computeStoredMatchEconomics. The realism-bucket path read m.economics.tceUsdPerDay
 * straight from the SEEDED matches.tce_usd_per_day column (a regen-time snapshot),
 * so when bunker prices drift the SAME cargo/vessel pair showed a STALE TCE in the
 * bucket tabs and a LIVE TCE on the board.
 *
 * Fix: buildDemoSessionBlob.rowsToMatches recomputes bucket-row economics with the
 * SAME helper + inputs as the board when the seeded cargo/vessel carry resolvable
 * ports — so bucket economics.tceUsdPerDay == the board's live value, not the seed
 * column. Falls back to the seed column only when ports are unresolvable.
 */
import Database from 'better-sqlite3';
import { buildDemoSessionBlob } from '../hydrate-demo-session';
import { computeStoredMatchEconomics } from '@/lib/matching/stored-match-economics';
import { resolveRecommendedBunkerPort } from '@/lib/economics/bunker-routing';
import { estimateVoyageDays } from '@/lib/economics/voyage-days';
import { parseLeadingNumber, parseConsumption } from '@/lib/matching/tce-calculator';
import { getPortDistance } from '@/lib/sailing/port-distances';
import { cfValue } from '@/lib/types';
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

// A cargo whose ports resolve a real distance (Rotterdam → Santos), so the live
// economics recompute can actually fire. Mirrors the session-buckets-economics
// fixture shape (cfValue reads `.value`).
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

// A TCE no Rotterdam→Santos recompute would ever produce — proves the blob did
// NOT carry the raw seed column.
const SEED_SENTINEL_TCE = 999_999;

function makeSeedDb(): Database.Database {
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
  db.prepare(`INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES ('demo','c1','t1','a@demo.local','me@demo.local','Cargo','2026-05-20','b','s','[]',0)`).run();
  db.prepare(`INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, to_addr, subject, date, body, snippet, label_ids, fetched_at)
    VALUES ('demo','v1','t2','b@demo.local','me@demo.local','Vessel','2026-05-21','b','s','[]',0)`).run();
  db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES ('demo','c1','cargo','v1',?,0)`).run(JSON.stringify([CARGO]));
  db.prepare(`INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
    VALUES ('demo','v1','vessel','v1',?,0)`).run(JSON.stringify([VESSEL]));
  // Realism-bucket sentinel row carrying a STALE seed TCE.
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured, tce_usd_per_day, freight_rate_usd_per_mt, freight_rate_source)
    VALUES ('c1','v1',50,'review bucket','potential','__demo_review__',0,0,NULL,?,NULL,NULL)`).run(SEED_SENTINEL_TCE);
  // Main shortlist sentinel row (user_id IS NULL) — same resolvable ports, STALE seed TCE.
  db.prepare(`INSERT INTO matches (cargo_id, vessel_id, score, reason, status, user_id, created_at, updated_at, reason_structured, tce_usd_per_day, freight_rate_usd_per_mt, freight_rate_source)
    VALUES ('c1','v1',80,'shortlist',NULL,NULL,0,0,NULL,?,NULL,NULL)`).run(SEED_SENTINEL_TCE);
  return db;
}

/** Replicate the board's live recompute (persist-session-matches.ts 86-98). */
function liveBoardTce(db: Database.Database): number | null {
  const loadPort = cfValue(CARGO.originPort);
  const dischargePort = cfValue(CARGO.destinationPort);
  const distance = loadPort && dischargePort ? getPortDistance(loadPort, dischargePort) : null;
  const recoSpeed = parseLeadingNumber(VESSEL.speedLaden) || 0;
  const reco = resolveRecommendedBunkerPort(db, loadPort, dischargePort, 'VLSFO', {
    dwt: cfValue(VESSEL.dwtSummer) ?? 0,
    speedKn: recoSpeed,
    consMtPerDay: parseConsumption(VESSEL.consumption, 0),
    voyageDays: estimateVoyageDays(distance?.nm ?? null, recoSpeed),
  });
  return computeStoredMatchEconomics({ cargo: CARGO, vessel: VESSEL, db, bunkerPriceUsdPerMt: reco.priceUsdPerMt })
    .tce_usd_per_day;
}

describe('buildDemoSessionBlob bucket economics == live board TCE (audit-1 LOW 8)', () => {
  it('recomputes bucket-row economics.tceUsdPerDay live (not the stale seed column) when ports resolve', () => {
    const db = makeSeedDb();
    const expectedLive = liveBoardTce(db);
    const blob = buildDemoSessionBlob(db);
    db.close();

    // The live recompute must actually produce a number for this fixture, else
    // the assertion below is vacuous.
    expect(expectedLive).not.toBeNull();
    expect(expectedLive).not.toBe(SEED_SENTINEL_TCE);

    expect(blob.lowConfidenceMatches).toHaveLength(1);
    const tce = blob.lowConfidenceMatches![0].economics!.tceUsdPerDay;
    // Bucket TCE matches the board's live recompute, NOT the stale seed column.
    expect(tce).toBe(expectedLive);
    expect(tce).not.toBe(SEED_SENTINEL_TCE);
  });

  it('does NOT live-recompute main shortlist economics at hydrate (perf: persist-session-matches owns it)', () => {
    // audit-1 LOW 8 perf follow-up: the live recompute is scoped to bucket rows
    // only. Main matchRows (user_id IS NULL) carry the cheap seed economics — they
    // are recomputed later by persist-session-matches, so a live recompute here is
    // redundant O(N_main) work on every demo login. Proof: the main row keeps the
    // seed-sentinel TCE (which a live Rotterdam→Santos recompute would never yield),
    // while the bucket row in the test above DID get live-recomputed.
    const db = makeSeedDb();
    const expectedLive = liveBoardTce(db);
    const blob = buildDemoSessionBlob(db);
    db.close();

    expect(expectedLive).not.toBe(SEED_SENTINEL_TCE);
    expect(blob.matches).toHaveLength(1);
    const mainTce = blob.matches[0].economics!.tceUsdPerDay;
    // Main row kept the seed column — NOT live-recomputed.
    expect(mainTce).toBe(SEED_SENTINEL_TCE);
    expect(mainTce).not.toBe(expectedLive);
  });
});
