import Database from 'better-sqlite3';
import {
  AIS_CACHE_TTL_MS,
  ensureAisCacheTable,
  getCached,
  getStaleCached,
  setCached,
} from '../../../lib/ais/cache';

describe('lib/ais/cache', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureAisCacheTable(db);
  });

  afterEach(() => {
    db.close();
  });

  // --- happy path ---

  it('put → get returns same payload', () => {
    const payload = { lat: 51.5, lon: -0.1, speedKn: 12 };
    setCached(db, 'IMO1234567', 'position', payload);
    expect(getCached(db, 'IMO1234567', 'position')).toEqual(payload);
  });

  it('get after TTL returns null', () => {
    const payload = { lat: 51.5, lon: -0.1 };
    db.prepare(
      'INSERT OR REPLACE INTO ais_cache (imo, kind, payload, fetched_at) VALUES (?, ?, ?, ?)'
    ).run('IMO1234567', 'position', JSON.stringify(payload), Date.now() - AIS_CACHE_TTL_MS - 1);

    expect(getCached(db, 'IMO1234567', 'position')).toBeNull();
  });

  it('getStaleCached returns expired entry', () => {
    const payload = { lat: 55.0, lon: 10.0 };
    db.prepare(
      'INSERT OR REPLACE INTO ais_cache (imo, kind, payload, fetched_at) VALUES (?, ?, ?, ?)'
    ).run('IMO1234567', 'position', JSON.stringify(payload), Date.now() - AIS_CACHE_TTL_MS - 1);

    expect(getStaleCached(db, 'IMO1234567', 'position')).toEqual(payload);
  });

  it('getStaleCached returns fresh entry too', () => {
    const payload = { lat: 55.0, lon: 10.0 };
    setCached(db, 'IMO1234567', 'position', payload);
    expect(getStaleCached(db, 'IMO1234567', 'position')).toEqual(payload);
  });

  it('setCached overwrites previous value', () => {
    setCached(db, 'IMO1234567', 'position', { lat: 1 });
    setCached(db, 'IMO1234567', 'position', { lat: 2 });
    expect(getCached(db, 'IMO1234567', 'position')).toEqual({ lat: 2 });
  });

  // --- boundary: Input Contract ---

  it('getCached with empty imo returns null', () => {
    expect(getCached(db, '', 'position')).toBeNull();
  });

  it('getCached with empty kind returns null', () => {
    expect(getCached(db, 'IMO1234567', '')).toBeNull();
  });

  it('getStaleCached with empty imo returns null', () => {
    expect(getStaleCached(db, '', 'position')).toBeNull();
  });

  it('setCached with empty imo is a no-op (getCached returns null)', () => {
    setCached(db, '', 'position', { lat: 1 });
    expect(getCached(db, '', 'position')).toBeNull();
  });

  it('setCached with null payload is a no-op', () => {
    setCached(db, 'IMO1234567', 'position', null);
    expect(getCached(db, 'IMO1234567', 'position')).toBeNull();
  });

  it('getCached returns null for missing entry', () => {
    expect(getCached(db, 'IMO9999999', 'position')).toBeNull();
  });

  it('getStaleCached returns null for missing entry', () => {
    expect(getStaleCached(db, 'IMO9999999', 'position')).toBeNull();
  });
});
