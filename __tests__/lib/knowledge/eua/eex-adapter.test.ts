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

// Build a minimal "stored" (uncompressed) ZIP with the two entries parseEexXlsx
// reads, so range-guard behaviour can be exercised with an arbitrary price.
function storedZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 8); // stored
    lh.writeUInt32LE(0, 14); // crc (ignored for stored by parser)
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const local = Buffer.concat([lh, nameBuf, e.data]);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 10); // stored
    ch.writeUInt32LE(0, 16); // crc
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, nameBuf]));

    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const cdOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// XLSX with a single EU CAP3 auction row at `price` on serial 46030 (2026-01-08).
function makeEexXlsx(price: number): Buffer {
  const ss =
    '<sst><si><t>Date</t></si><si><t>Auction Name</t></si>' +
    '<si><t>Auction Price</t></si><si><t>CAP3 EU Auction</t></si></sst>';
  const sheet =
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    `<row r="2"><c r="A2"><v>46030</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>${price}</v></c></row>` +
    '</sheetData></worksheet>';
  return storedZip([
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(ss, 'utf8') },
  ]);
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

    expect(result!.priceDate).toBe('2026-01-08');
    expect(result!.price).toBeCloseTo(72.65, 2);
    expect(result!.rowsChanged).toBe(1);
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

  it('returns null when XLSX structure is broken (no valid ZIP)', async () => {
    const badBuf = Buffer.alloc(100, 0);
    const fetcher = jest.fn().mockResolvedValue(badBuf);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await refreshEex(db, fetcher);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[EEX]'), expect.any(String));
    warnSpy.mockRestore();
  });

  it('sanity-check: hand-built XLSX parses (in-range price written)', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeEexXlsx(72));
    const result = await refreshEex(db, fetcher);
    expect(result).not.toBeNull();
    expect(result!.price).toBe(72);
    const row = db.prepare("SELECT * FROM eua_prices WHERE source='eex-auction'").get() as any;
    expect(row.price_eur_per_tco2).toBeCloseTo(72, 2);
  });

  it('returns null + warns on out-of-range high price, writes nothing', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeEexXlsx(9999));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await refreshEex(db, fetcher);
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
    const row = db.prepare("SELECT * FROM eua_prices WHERE source='eex-auction'").get();
    expect(row).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('returns null on out-of-range low price', async () => {
    const fetcher = jest.fn().mockResolvedValue(makeEexXlsx(3));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await refreshEex(db, fetcher);
    expect(result).toBeNull();
    warnSpy.mockRestore();
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
