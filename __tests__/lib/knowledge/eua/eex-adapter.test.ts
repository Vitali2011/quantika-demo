import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import {
  refreshEex,
  buildEexXlsxUrl,
  parseEexXlsx,
  parseEexCsv,
  EexNoAuctionFoundError,
  EexCsvFormatError,
} from '@/lib/knowledge/eua/eex-adapter';
import { registerSource } from '@/lib/knowledge/governance';

const FIXTURES_DIR = join(__dirname, '../../../fixtures');

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, name));
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration024.up(db);
  registerSource(db, {
    slug: 'eua-eex',
    name: 'EEX EU ETS Auction',
    kind: 'structured_rows',
    category: 'market',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
  });
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

// ---------------------------------------------------------------------------
// buildEexXlsxUrl
// ---------------------------------------------------------------------------

describe('eex-adapter — buildEexXlsxUrl', () => {
  it('returns URL for current year by default', () => {
    const year = new Date().getUTCFullYear();
    const url = buildEexXlsxUrl();
    expect(url).toContain(`${year}-data.xlsx`);
    expect(url).toContain('public.eex-group.com');
  });

  it('returns URL for specified year', () => {
    const url = buildEexXlsxUrl(2025);
    expect(url).toBe(
      'https://public.eex-group.com/eex/eua-auction-report/emission-spot-primary-market-auction-report-2025-data.xlsx',
    );
  });
});

// ---------------------------------------------------------------------------
// parseEexXlsx
// ---------------------------------------------------------------------------

describe('eex-adapter — parseEexXlsx', () => {
  it('parses the XLSX fixture and returns the latest EU CAP3 price', () => {
    const buf = loadFixture('eex-auction-sample.xlsx');
    const { price, priceDate } = parseEexXlsx(buf);
    // Fixture: EU CAP3 row has serial 46030 = 2026-01-08, price 72.65
    expect(priceDate).toBe('2026-01-08');
    expect(price).toBeCloseTo(72.65, 2);
  });

  it('skips non-EU rows (DE-only) and picks CAP3 EU row', () => {
    // Fixture also contains row r=6 for DE with price 87.0 on date 46031 (2026-05-09)
    // parseEexXlsx must return the CAP3 EU row (72.65) not the DE row
    const buf = loadFixture('eex-auction-sample.xlsx');
    const { price } = parseEexXlsx(buf);
    expect(price).toBeCloseTo(72.65, 2);
  });

  it('throws EexNoAuctionFoundError when XLSX has no CAP3 EU rows', () => {
    // Build a minimal buffer without a valid XLSX — will fail to find the entry
    const badBuf = Buffer.from('PK\x03\x04not-a-real-xlsx');
    expect(() => parseEexXlsx(badBuf)).toThrow(EexCsvFormatError);
  });
});

// ---------------------------------------------------------------------------
// parseEexCsv (legacy — kept for coverage)
// ---------------------------------------------------------------------------

describe('eex-adapter — parseEexCsv', () => {
  it('parses sample CSV correctly', () => {
    const csv = loadFixture('eex-auction-sample.csv').toString('utf8');
    const { price, priceDate } = parseEexCsv(csv);
    expect(priceDate).toBe('2026-05-04');
    expect(price).toBeCloseTo(72.65, 2);
  });

  it('throws EexCsvFormatError when Auction Clearing Price column is missing', () => {
    const badCsv = 'Date,Volume,SomeOtherCol\n2026-05-04,1000,72.00\n';
    expect(() => parseEexCsv(badCsv)).toThrow(EexCsvFormatError);
  });

  it('throws EexCsvFormatError when CSV has only header (no data row)', () => {
    const headerOnly = 'Auction Date,Total Volume,Auction Clearing Price (€/EUA),Min Bid,Max Bid\n';
    expect(() => parseEexCsv(headerOnly)).toThrow(EexCsvFormatError);
  });

  it('throws EexCsvFormatError when price is not a number', () => {
    const badPrice = 'Auction Date,Auction Clearing Price (€/EUA)\n2026-05-04,N/A\n';
    expect(() => parseEexCsv(badPrice)).toThrow(EexCsvFormatError);
  });
});

// ---------------------------------------------------------------------------
// refreshEex
// ---------------------------------------------------------------------------

describe('eex-adapter — refreshEex', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('fetches XLSX and upserts the EU CAP3 price', async () => {
    const xlsxBuf = loadFixture('eex-auction-sample.xlsx');
    const fetcher = jest.fn().mockResolvedValue(xlsxBuf);

    const result = await refreshEex(db, fetcher);

    expect(result.priceDate).toBe('2026-01-08');
    expect(result.price).toBeCloseTo(72.65, 2);
    expect(result.rowsChanged).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('public.eex-group.com'));

    const row = db.prepare("SELECT * FROM eua_prices WHERE source='eex-auction'").get() as any;
    expect(row).toBeTruthy();
    expect(row.price_eur_per_tco2).toBeCloseTo(72.65, 2);
    expect(row.contract_type).toBe('spot');
  });

  it('calls upsert with correct source=eex-auction and contract_type=spot', async () => {
    const xlsxBuf = loadFixture('eex-auction-sample.xlsx');
    const fetcher = jest.fn().mockResolvedValue(xlsxBuf);

    await refreshEex(db, fetcher);

    const row = db.prepare("SELECT * FROM eua_prices WHERE source='eex-auction'").get() as any;
    expect(row).toBeTruthy();
    expect(row.source).toBe('eex-auction');
    expect(row.contract_type).toBe('spot');
  });

  it('throws when fetcher network error', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(refreshEex(db, fetcher)).rejects.toThrow('ECONNREFUSED');
  });

  it('is idempotent: second call with same price overwrites (upsert, no duplicate)', async () => {
    const xlsxBuf = loadFixture('eex-auction-sample.xlsx');
    const fetcher = jest.fn().mockResolvedValue(xlsxBuf);

    await refreshEex(db, fetcher);
    const countAfterFirst = (
      db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='eex-auction'").get() as any
    ).c;

    await refreshEex(db, fetcher);
    const countAfterSecond = (
      db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='eex-auction'").get() as any
    ).c;

    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1);
  });
});
