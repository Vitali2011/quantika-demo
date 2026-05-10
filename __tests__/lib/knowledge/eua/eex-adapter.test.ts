import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import {
  refreshEex,
  extractLatestCsvUrl,
  parseEexCsv,
  EexNoAuctionFoundError,
  EexCsvFormatError,
} from '@/lib/knowledge/eua/eex-adapter';
import { registerSource } from '@/lib/knowledge/governance';
import { upsertEuaPrice } from '@/lib/market/eua-repository';

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

describe('eex-adapter — extractLatestCsvUrl', () => {
  it('finds the most recent CSV link from the fixture HTML', () => {
    const html = loadFixture('eex-hub-page.html');
    const { csvUrl, csvDate } = extractLatestCsvUrl(html);
    expect(csvDate).toBe('2026-05-04');
    expect(csvUrl).toContain('auction-results-2026-05-04');
  });

  it('picks the newest date when multiple candidates exist', () => {
    const html = `
      <a href="/cms/files/auction-results-2026-04-28.csv">Old</a>
      <a href="/cms/files/auction-results-2026-05-02.csv">Mid</a>
      <a href="/cms/files/auction-results-2026-05-04.csv">New</a>
    `;
    const { csvDate } = extractLatestCsvUrl(html);
    expect(csvDate).toBe('2026-05-04');
  });

  it('resolves relative href to absolute URL', () => {
    const html = `<a href="/cms/files/auction-results-2026-05-04.csv">x</a>`;
    const { csvUrl } = extractLatestCsvUrl(html);
    expect(csvUrl).toMatch(/^https:\/\/www\.eex\.com/);
  });

  it('throws EexNoAuctionFoundError when no CSV links present', () => {
    const html = '<html><body>No links here</body></html>';
    expect(() => extractLatestCsvUrl(html)).toThrow(EexNoAuctionFoundError);
  });
});

describe('eex-adapter — parseEexCsv', () => {
  it('parses the sample CSV fixture correctly', () => {
    const csv = loadFixture('eex-auction-sample.csv');
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

describe('eex-adapter — refreshEex', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('fetches hub + CSV and upserts the price', async () => {
    const hubHtml = loadFixture('eex-hub-page.html');
    const csvContent = loadFixture('eex-auction-sample.csv');

    const fetcher = jest.fn().mockImplementation((url: string) => {
      if (url.includes('eex.com') && !url.endsWith('.csv')) return Promise.resolve(hubHtml);
      return Promise.resolve(csvContent);
    });

    const result = await refreshEex(db, fetcher);

    expect(result.priceDate).toBe('2026-05-04');
    expect(result.price).toBeCloseTo(72.65, 2);
    expect(result.rowsChanged).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const row = db.prepare("SELECT * FROM eua_prices WHERE source='eex-auction'").get() as any;
    expect(row).toBeTruthy();
    expect(row.price_eur_per_tco2).toBeCloseTo(72.65, 2);
    expect(row.contract_type).toBe('spot');
  });

  it('calls upsert with correct source=eex-auction and contract_type=spot', async () => {
    const hubHtml = loadFixture('eex-hub-page.html');
    const csvContent = loadFixture('eex-auction-sample.csv');

    const fetcher = jest.fn().mockImplementation((url: string) => {
      if (url.includes('.csv')) return Promise.resolve(csvContent);
      return Promise.resolve(hubHtml);
    });

    await refreshEex(db, fetcher);

    const row = db.prepare('SELECT * FROM eua_prices LIMIT 1').get() as any;
    expect(row.source).toBe('eex-auction');
    expect(row.contract_type).toBe('spot');
  });

  it('throws EexNoAuctionFoundError when hub HTML has no CSV links', async () => {
    const fetcher = jest.fn().mockResolvedValue('<html>no csv links</html>');
    await expect(refreshEex(db, fetcher)).rejects.toThrow(EexNoAuctionFoundError);
  });

  it('throws when fetcher network error on hub page', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(refreshEex(db, fetcher)).rejects.toThrow('ECONNREFUSED');
  });

  it('is idempotent: second call with same price overwrites (upsert, no duplicate)', async () => {
    const hubHtml = loadFixture('eex-hub-page.html');
    const csvContent = loadFixture('eex-auction-sample.csv');
    const fetcher = jest.fn().mockImplementation((url: string) => {
      if (url.includes('.csv')) return Promise.resolve(csvContent);
      return Promise.resolve(hubHtml);
    });

    await refreshEex(db, fetcher);
    const countAfterFirst = (db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='eex-auction'").get() as any).c;

    await refreshEex(db, fetcher);
    const countAfterSecond = (db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='eex-auction'").get() as any).c;

    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1); // idempotent: same date → upsert, no new row
  });
});
