import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import {
  refreshIcap,
  parseIcapCsv,
  IcapNoEuEtsError,
} from '@/lib/knowledge/eua/icap-adapter';
import { registerSource } from '@/lib/knowledge/governance';

const FIXTURES_DIR = join(__dirname, '../../../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration024.up(db);
  registerSource(db, {
    slug: 'eua-icap',
    name: 'ICAP ETS Prices',
    kind: 'structured_rows',
    category: 'market',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
  });
  return db;
}

describe('icap-adapter — parseIcapCsv', () => {
  it('parses the ICAP fixture and returns EU ETS price', () => {
    const csv = loadFixture('icap-prices.csv');
    const { price, priceDate } = parseIcapCsv(csv);
    expect(priceDate).toBe('2026-05-08');
    expect(price).toBeCloseTo(71.30, 2);
  });

  it('only returns EU ETS row, ignores California/UK rows', () => {
    const csv = loadFixture('icap-prices.csv');
    const { price } = parseIcapCsv(csv);
    // California = 28.50, UK = 35.20, EU = 71.30
    expect(price).toBeCloseTo(71.30, 2);
  });

  it('picks newest date when multiple EU ETS rows exist', () => {
    const csv = [
      'ETS,Date,Price (EUR/tCO2)',
      'EU ETS,2026-05-01,68.00',
      'EU ETS,2026-05-08,71.30',
      'EU ETS,2026-05-03,69.50',
    ].join('\n');
    const { priceDate, price } = parseIcapCsv(csv);
    expect(priceDate).toBe('2026-05-08');
    expect(price).toBeCloseTo(71.30, 2);
  });

  it('throws IcapNoEuEtsError when no EU ETS rows present', () => {
    const csv = [
      'ETS,Date,Price (EUR/tCO2)',
      'California Cap-and-Trade,2026-05-08,28.50',
    ].join('\n');
    expect(() => parseIcapCsv(csv)).toThrow(IcapNoEuEtsError);
  });

  it('throws IcapNoEuEtsError when CSV has only header', () => {
    const csv = 'ETS,Date,Price (EUR/tCO2)\n';
    expect(() => parseIcapCsv(csv)).toThrow(IcapNoEuEtsError);
  });

  it('throws IcapNoEuEtsError when required columns missing', () => {
    const csv = 'Scheme,When,Value\nEU ETS,2026-05-08,71.30\n';
    expect(() => parseIcapCsv(csv)).toThrow(IcapNoEuEtsError);
  });
});

describe('icap-adapter — refreshIcap', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('fetches CSV and upserts EU ETS price with source=icap', async () => {
    const csv = loadFixture('icap-prices.csv');
    const fetcher = jest.fn().mockResolvedValue(csv);

    const result = await refreshIcap(db, fetcher);

    expect(result.price).toBeCloseTo(71.30, 2);
    expect(result.priceDate).toBe('2026-05-08');
    expect(result.rowsChanged).toBe(1);

    const row = db.prepare("SELECT * FROM eua_prices WHERE source='icap'").get() as any;
    expect(row).toBeTruthy();
    expect(row.price_eur_per_tco2).toBeCloseTo(71.30, 2);
    expect(row.contract_type).toBe('spot');
    expect(row.source).toBe('icap');
  });

  it('throws when fetcher rejects', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('network timeout'));
    await expect(refreshIcap(db, fetcher)).rejects.toThrow('network timeout');
  });

  it('throws IcapNoEuEtsError when CSV has no EU ETS rows', async () => {
    const csv = 'ETS,Date,Price (EUR/tCO2)\nCalifornia Cap-and-Trade,2026-05-08,28.50\n';
    const fetcher = jest.fn().mockResolvedValue(csv);
    await expect(refreshIcap(db, fetcher)).rejects.toThrow(IcapNoEuEtsError);
  });

  it('is idempotent: second upsert with same date overwrites (no duplicate row)', async () => {
    const csv = loadFixture('icap-prices.csv');
    const fetcher = jest.fn().mockResolvedValue(csv);

    await refreshIcap(db, fetcher);
    const countAfterFirst = (db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='icap'").get() as any).c;

    await refreshIcap(db, fetcher);
    const countAfterSecond = (db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='icap'").get() as any).c;

    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1); // idempotent: same date → upsert, no new row
  });
});
