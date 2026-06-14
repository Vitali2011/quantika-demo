/**
 * Demo hydrate: CBFT→CBM conversion of seeded parsed_results before the
 * CAPACITY_PLAUSIBILITY clamp.
 *
 * ROOT (prod-confirmed): 8 seed vessels store grainCapacityUnit="cbft" with the
 * RAW cbft value (e.g. 220577). The previous hydrate relabelled unit→cbm WITHOUT
 * converting the value, so the raw cbft (read as cbm, ~35x too large) tripped the
 * >2.5x DWT clamp and the legit capacity was nulled → volume constraint dropped.
 *
 * FIX: buildDemoSessionBlob converts the VALUE (÷35.314667) and sets unit="cbm"
 * BEFORE the clamp. Oracle: 220577 cbft → 6247 cbm.
 *
 * NOTE: read-time, in-memory recovery only — does NOT write/reseed prod.
 */
import Database from 'better-sqlite3';
import { buildDemoSessionBlob } from '@/lib/demo-mode/hydrate-demo-session';
import type { ParsedVessel } from '@/lib/types';

function makeSeedDb(vessel: Partial<ParsedVessel>): Database.Database {
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
      reason_structured TEXT
    );
  `);
  const full: ParsedVessel = {
    emailId: 'v-cbft', itemIndex: 0,
    vesselName: null, imo: null, flag: null, built: null, classSociety: null, pandi: null,
    dwtSummer: { value: 8000, confidence: 'confirmed', source_text: 'DWT 8000' } as unknown as ParsedVessel['dwtSummer'],
    dwcc: null, draftMax: null, loa: null, beam: null, grt: null, nrt: null,
    holdsCount: null, hatchesCount: null,
    grainCapacity: 220577, grainCapacityUnit: 'cbft', baleCapacity: null,
    holdDimensions: null, hatchDimensions: null, tankTopStrength: null, geared: null,
    craneCapacity: null, hatchType: null, vesselType: null, openPosition: null, openDate: null,
    direction: null, restrictions: [], lastCargoes: null, speedLaden: null, speedBallast: null,
    consumption: null, deckCapacity: null, specialFeatures: [], ciiRating: null,
    verificationWarning: null,
    ...vessel,
  };
  db.prepare(`INSERT INTO parsed_results (parse_type, result_json) VALUES ('vessel', ?)`)
    .run(JSON.stringify([full]));
  return db;
}

describe('hydrate converts seeded cbft grain capacity before the clamp', () => {
  it('220577 cbft → ~6247 cbm, unit cbm, NOT nulled by the >2.5x DWT clamp', () => {
    const db = makeSeedDb({});
    const blob = buildDemoSessionBlob(db);
    db.close();

    expect(blob.parsedVessels).toHaveLength(1);
    const v = blob.parsedVessels[0];
    expect(v.grainCapacity).not.toBeNull();
    expect(v.grainCapacity!).toBeGreaterThanOrEqual(6240);
    expect(v.grainCapacity!).toBeLessThanOrEqual(6250);
    expect(v.grainCapacityUnit).toBe('cbm');
  });

  it('already-cbm seed value is left untouched (no double-convert)', () => {
    const db = makeSeedDb({ grainCapacity: 6247, grainCapacityUnit: 'cbm' });
    const blob = buildDemoSessionBlob(db);
    db.close();
    expect(blob.parsedVessels[0].grainCapacity).toBe(6247);
    expect(blob.parsedVessels[0].grainCapacityUnit).toBe('cbm');
  });
});
