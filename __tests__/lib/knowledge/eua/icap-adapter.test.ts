import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import {
  refreshIcap,
  parseIcapCsv,
  parseIcapApiResponse,
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

// Minimal ICAP API response fixture
function makeApiResponse(overrides?: {
  id?: number;
  dates?: Record<string, number[]>;
}) {
  return [
    {
      id: overrides?.id ?? 34,
      name: 'European Union Emissions Trading System (from 2019)',
      defaultMarketData: 'secondary',
      values: {
        secondary: overrides?.dates ?? {
          '2026-03-27': [83.42, 70.55, 70.55],
          '2026-05-08': [71.30, 60.22, 60.22],
          '2026-03-31': [84.10, 71.13, 71.13],
        },
      },
    },
    {
      id: 5,
      name: 'Regional Greenhouse Gas Initiative',
      values: { secondary: { '2026-05-08': [5.50, 5.50] } },
    },
  ];
}

// ---------------------------------------------------------------------------
// parseIcapApiResponse
// ---------------------------------------------------------------------------

describe('icap-adapter — parseIcapApiResponse', () => {
  it('returns the latest EU ETS secondary price', () => {
    const systems = makeApiResponse();
    const { price, priceDate } = parseIcapApiResponse(systems as any);
    expect(priceDate).toBe('2026-05-08');
    expect(price).toBeCloseTo(71.30, 2);
  });

  it('picks the lexicographically latest date', () => {
    const systems = makeApiResponse({
      dates: {
        '2026-01-10': [65.00, 55.00],
        '2026-05-08': [71.30, 60.22],
        '2026-03-15': [68.00, 57.00],
      },
    });
    const { priceDate } = parseIcapApiResponse(systems as any);
    expect(priceDate).toBe('2026-05-08');
  });

  it('throws IcapNoEuEtsError when system id=34 is absent', () => {
    const systems = [{ id: 5, name: 'RGGI', values: {} }];
    expect(() => parseIcapApiResponse(systems as any)).toThrow(IcapNoEuEtsError);
  });

  it('throws IcapNoEuEtsError when secondary values are empty', () => {
    const systems = [{ id: 34, name: 'EU ETS', values: { secondary: {} } }];
    expect(() => parseIcapApiResponse(systems as any)).toThrow(IcapNoEuEtsError);
  });

  it('throws IcapNoEuEtsError when values key is missing', () => {
    const systems = [{ id: 34, name: 'EU ETS' }];
    expect(() => parseIcapApiResponse(systems as any)).toThrow(IcapNoEuEtsError);
  });
});

// ---------------------------------------------------------------------------
// parseIcapCsv (legacy — kept for coverage)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// refreshIcap
// ---------------------------------------------------------------------------

describe('icap-adapter — refreshIcap', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('fetches JSON API and upserts EU ETS price with source=icap', async () => {
    const apiJson = JSON.stringify(makeApiResponse());
    const fetcher = jest.fn().mockResolvedValue(apiJson);

    const result = await refreshIcap(db, fetcher);

    expect(result.price).toBeCloseTo(71.30, 2);
    expect(result.priceDate).toBe('2026-05-08');
    expect(result.rowsChanged).toBe(1);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('allowancepriceexplorer.icapcarbonaction.com'),
    );

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

  it('throws IcapNoEuEtsError when JSON has no EU ETS system', async () => {
    const apiJson = JSON.stringify([{ id: 5, name: 'RGGI', values: {} }]);
    const fetcher = jest.fn().mockResolvedValue(apiJson);
    await expect(refreshIcap(db, fetcher)).rejects.toThrow(IcapNoEuEtsError);
  });

  it('throws IcapNoEuEtsError when response is not valid JSON', async () => {
    const fetcher = jest.fn().mockResolvedValue('not json');
    await expect(refreshIcap(db, fetcher)).rejects.toThrow(IcapNoEuEtsError);
  });

  it('is idempotent: second upsert with same date overwrites (no duplicate row)', async () => {
    const apiJson = JSON.stringify(makeApiResponse());
    const fetcher = jest.fn().mockResolvedValue(apiJson);

    await refreshIcap(db, fetcher);
    const countAfterFirst = (
      db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='icap'").get() as any
    ).c;

    await refreshIcap(db, fetcher);
    const countAfterSecond = (
      db.prepare("SELECT COUNT(*) as c FROM eua_prices WHERE source='icap'").get() as any
    ).c;

    expect(countAfterFirst).toBe(1);
    expect(countAfterSecond).toBe(1);
  });
});
