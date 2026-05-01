/**
 * Input Contract for getPortDa:
 *   portCode:   must be truthy; wrong-format returns null (contract only, type-checked at call site)
 *   vesselDwt:  must be finite, positive integer — NaN / Infinity / <=0 → null
 *   cargoType:  unknown value falls back to 'general'; undefined → 'general'
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';
import { getPortDa } from '@/lib/port-da/repository';

// --------------------------------------------------------------------------
// Test DB helpers
// --------------------------------------------------------------------------

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, allMigrations);
  return db;
}

function seedBracket(
  db: Database.Database,
  opts: {
    portCode?: string;
    dwtMin?: number;
    dwtMax?: number;
    portDues?: number;
    pilotage?: number;
    tugs?: number;
    stev?: number;
    cargoType?: string;
    confidence?: string;
    source?: string;
  } = {},
): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO port_da_estimates
      (port_code, port_name, vessel_dwt_min, vessel_dwt_max,
       port_dues_usd, pilotage_usd, tugs_usd, stevedoring_usd_per_mt,
       cargo_type, confidence, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.portCode ?? 'AEJEA',
    'Jebel Ali',
    opts.dwtMin ?? 10000,
    opts.dwtMax ?? 40000,
    opts.portDues ?? 12000,
    opts.pilotage ?? 4000,
    opts.tugs ?? 3500,
    opts.stev ?? 5.5,
    opts.cargoType ?? 'general',
    opts.confidence ?? 'estimated',
    opts.source ?? 'manual',
    now,
  );
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('getPortDa — happy path', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    // bracket 1: handysize 10k–40k
    seedBracket(db, { dwtMin: 10000, dwtMax: 40000, portDues: 12000 });
    // bracket 2: supramax 40k–65k
    seedBracket(db, { dwtMin: 40001, dwtMax: 65000, portDues: 18000 });
  });

  it('returns correct breakdown when DWT falls in bracket 1', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 25000 }, db);
    expect(result).not.toBeNull();
    expect(result!.portCode).toBe('AEJEA');
    expect(result!.portDuesUsd).toBe(12000);
    expect(result!.pilotageUsd).toBe(4000);
    expect(result!.tugsUsd).toBe(3500);
    expect(result!.stevedoringUsdPerMt).toBe(5.5);
    expect(result!.totalFixedUsd).toBe(12000 + 4000 + 3500);
    expect(result!.confidence).toBe('estimated');
    expect(result!.source).toBe('manual');
    expect(result!.vesselDwt).toBe(25000);
  });

  it('returns correct breakdown when DWT falls in bracket 2', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 55000 }, db);
    expect(result).not.toBeNull();
    expect(result!.portDuesUsd).toBe(18000);
    expect(result!.totalFixedUsd).toBe(18000 + 4000 + 3500);
  });

  it('returns null when DWT is outside all brackets', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 9999 }, db);
    expect(result).toBeNull();
  });

  it('returns null for unknown port', () => {
    const result = getPortDa({ portCode: 'ZZZZZ', vesselDwt: 25000 }, db);
    expect(result).toBeNull();
  });
});

describe('getPortDa — multiple confidence matches', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    // Overlapping ranges: DWT 25000 falls in both; different confidence
    seedBracket(db, { dwtMin: 10000, dwtMax: 40000, portDues: 8000, confidence: 'low' });
    seedBracket(db, { dwtMin: 20000, dwtMax: 65000, portDues: 15000, confidence: 'verified', source: 'agent_quote:42' });
  });

  it('returns the record with highest confidence (verified > estimated > low)', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 25000 }, db);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('verified');
    expect(result!.portDuesUsd).toBe(15000);
    expect(result!.source).toBe('agent_quote:42');
  });
});

describe('getPortDa — cargoType matching', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    seedBracket(db, { cargoType: 'general', portDues: 10000 });
    seedBracket(db, { cargoType: 'bulk', portDues: 9000 });
  });

  it('returns bulk row when cargoType=bulk', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 25000, cargoType: 'bulk' }, db);
    expect(result!.portDuesUsd).toBe(9000);
  });

  it('falls back to general when cargoType is undefined', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 25000 }, db);
    expect(result!.portDuesUsd).toBe(10000);
  });

  it('falls back to general when cargoType is unknown value', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 25000, cargoType: 'cruise' }, db);
    expect(result!.portDuesUsd).toBe(10000);
  });
});

describe('getPortDa — boundary/invalid inputs', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    seedBracket(db);
  });

  it('returns null for NaN vesselDwt', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: NaN }, db);
    expect(result).toBeNull();
  });

  it('returns null for Infinity vesselDwt', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: Infinity }, db);
    expect(result).toBeNull();
  });

  it('returns null for zero vesselDwt', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: 0 }, db);
    expect(result).toBeNull();
  });

  it('returns null for negative vesselDwt', () => {
    const result = getPortDa({ portCode: 'AEJEA', vesselDwt: -5000 }, db);
    expect(result).toBeNull();
  });

  it('returns null for empty portCode', () => {
    const result = getPortDa({ portCode: '', vesselDwt: 25000 }, db);
    expect(result).toBeNull();
  });
});
