/**
 * Behavioral tests for lib/market/bdi-adapter.ts
 *
 * PI2: calls parseBdiCsv() with real CSV input (not string-match only).
 * Uses inline fixture CSV that mirrors stooq.com format.
 */

import Database from 'better-sqlite3';
import migration019 from '@/lib/migrations/019-port-master-baltic-indices';
import { parseBdiCsv, refreshBdi, BdiStructureChangedError } from '../bdi-adapter';
import { getLatestBalticIndex } from '../baltic-repository';

const FIXTURE_CSV = [
  'Date,Open,High,Low,Close,Volume',
  '2026-05-26,1440,1465,1425,1455,0',
  '2026-05-23,1410,1445,1405,1440,0',
].join('\n');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  migration019.up(db);
  return db;
}

describe('parseBdiCsv', () => {
  it('parses BDI Close value from fixture CSV (PI2: real parser call)', () => {
    const result = parseBdiCsv(FIXTURE_CSV);
    expect(result).not.toBeNull();
    expect(result!.value).toBe(1455);
  });

  it('parses ISO date from newest row', () => {
    const result = parseBdiCsv(FIXTURE_CSV);
    expect(result!.date).toBe('2026-05-26');
  });

  it('returns null for empty string (boundary: empty)', () => {
    expect(parseBdiCsv('')).toBeNull();
  });

  it('returns null when header has no Date column', () => {
    expect(parseBdiCsv('Open,High,Low,Close,Volume\n1440,1465,1425,1455,0')).toBeNull();
  });

  it('returns null when header has no Close column', () => {
    expect(parseBdiCsv('Date,Open,High,Low,Volume\n2026-05-26,1440,1465,1425,0')).toBeNull();
  });

  it('returns null for malformed date (MM/DD/YYYY)', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n05/26/2026,1440,1465,1425,1455,0';
    expect(parseBdiCsv(csv)).toBeNull();
  });

  it('returns null for zero Close value (boundary: zero)', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2026-05-26,0,0,0,0,0';
    expect(parseBdiCsv(csv)).toBeNull();
  });

  it('returns null when data row is absent (header-only CSV)', () => {
    expect(parseBdiCsv('Date,Open,High,Low,Close,Volume')).toBeNull();
  });
});

describe('refreshBdi (PI2: real DB upsert)', () => {
  it('upserts BDI row into baltic_indices', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_CSV);

    await refreshBdi(db, fakeFetcher);

    const row = getLatestBalticIndex(db, 'BDI');
    expect(row).not.toBeNull();
    expect(row!.value).toBe(1455);
    expect(row!.price_date).toBe('2026-05-26');
    expect(row!.index_code).toBe('BDI');

    db.close();
  });

  it('is idempotent — second call with same date does not duplicate', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockResolvedValue(FIXTURE_CSV);

    await refreshBdi(db, fakeFetcher);
    await refreshBdi(db, fakeFetcher);

    const count = (
      db
        .prepare("SELECT COUNT(*) as n FROM baltic_indices WHERE index_code='BDI'")
        .get() as { n: number }
    ).n;
    expect(count).toBe(1);

    db.close();
  });

  it('throws BdiStructureChangedError when CSV has only a header row', async () => {
    const db = makeDb();
    const fakeFetcher = jest
      .fn()
      .mockResolvedValue('Date,Open,High,Low,Close,Volume\n');

    await expect(refreshBdi(db, fakeFetcher)).rejects.toThrow(BdiStructureChangedError);

    db.close();
  });

  it('propagates network errors', async () => {
    const db = makeDb();
    const fakeFetcher = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(refreshBdi(db, fakeFetcher)).rejects.toThrow('Network error');

    db.close();
  });
});
