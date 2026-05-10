import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import {
  refreshShipAndBunker,
  parseShipAndBunkerHtml,
  ShipAndBunkerParseError,
  ShipAndBunkerStructureChangedError,
} from '@/lib/knowledge/bunker/shipandbunker-adapter';
import { registerSource } from '@/lib/knowledge/governance';

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, '../../../fixtures/shipandbunker-prices.html'),
  'utf-8',
);

const fixture2026Html = fs.readFileSync(
  path.join(__dirname, '../../../fixtures/shipandbunker-2026-05-10.html'),
  'utf-8',
);

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration023.up(db);
  registerSource(db, {
    slug: 'bunker-shipandbunker',
    name: 'Ship&Bunker Prices',
    kind: 'structured_rows',
    category: 'market',
    source_url: 'https://shipandbunker.com/prices',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
    primary_table: 'bunker_prices',
  });
  return db;
}

describe('shipandbunker-adapter', () => {
  let db: Database.Database;
  const tmpCachePath = '/tmp/test-snb-cache.html';

  beforeEach(() => {
    db = makeDb();
    process.env.BUNKER_CACHE_PATH = tmpCachePath;
    try { fs.unlinkSync(tmpCachePath); } catch { /* ok */ }
  });

  afterEach(() => {
    db.close();
    delete process.env.BUNKER_CACHE_PATH;
    try { fs.unlinkSync(tmpCachePath); } catch { /* ok */ }
  });

  describe('parseShipAndBunkerHtml', () => {
    it('parses 4 ports from fixture HTML', () => {
      const result = parseShipAndBunkerHtml(fixtureHtml);
      expect(result.size).toBe(4);
    });

    it('maps Rotterdam to NLRTM with correct VLSFO price', () => {
      const result = parseShipAndBunkerHtml(fixtureHtml);
      const rtm = result.get('Rotterdam');
      expect(rtm).toBeDefined();
      expect(rtm!.unlocode).toBe('NLRTM');
      expect(rtm!.vlsfo).toBeCloseTo(789.5);
    });

    it('maps all 4 port names to correct UNLOCODEs', () => {
      const result = parseShipAndBunkerHtml(fixtureHtml);
      const expected = [
        ['Rotterdam', 'NLRTM'],
        ['Singapore', 'SGSIN'],
        ['Fujairah', 'AEFJR'],
        ['Houston', 'USHOU'],
      ];
      for (const [port, unlocode] of expected) {
        expect(result.get(port)?.unlocode).toBe(unlocode);
      }
    });

    it('throws ShipAndBunkerStructureChangedError for HTML without VLSFO table', () => {
      expect(() =>
        parseShipAndBunkerHtml('<html><body>No table here</body></html>'),
      ).toThrow(ShipAndBunkerStructureChangedError);
    });

    it('derives UNLOCODE from row ID for unknown port names', () => {
      const html = `<table><tbody>
        <tr class="odd">
          <th id="row-xx-unk-VLSFO" scope="row" class="port"><a href="#">UnknownPort</a></th>
          <td headers="price-VLSFO">999.00<span class="indicator"></span></td>
        </tr>
      </tbody></table>`;
      const result = parseShipAndBunkerHtml(html);
      // Port is accepted via row-ID derived UNLOCODE (xx-unk → XXUNK)
      expect(result.size).toBe(1);
      expect(result.get('UnknownPort')?.unlocode).toBe('XXUNK');
    });

    it('skips rows with non-numeric VLSFO value', () => {
      const html = `<table><tbody>
        <tr class="odd">
          <th id="row-nl-rtm-VLSFO" scope="row" class="port"><a href="#">Rotterdam</a></th>
          <td headers="price-VLSFO">N/A<span class="indicator"></span></td>
        </tr>
      </tbody></table>`;
      const result = parseShipAndBunkerHtml(html);
      expect(result.size).toBe(0);
    });

    it('throws ShipAndBunkerStructureChangedError for completely empty/broken HTML', () => {
      expect(() => parseShipAndBunkerHtml('<html><body></body></html>')).toThrow(
        ShipAndBunkerStructureChangedError,
      );
    });
  });

  describe('parseShipAndBunkerHtml — 2026-05-10 real fixture', () => {
    it('returns ≥8 ports with VLSFO price from 2026 fixture (page shows 8 real ports)', () => {
      const result = parseShipAndBunkerHtml(fixture2026Html);
      expect(result.size).toBeGreaterThanOrEqual(8);
    });

    it('skips regional average rows (av-*) from 2026 fixture', () => {
      const result = parseShipAndBunkerHtml(fixture2026Html);
      for (const portName of result.keys()) {
        expect(portName).not.toMatch(/Average/i);
      }
    });

    it('Rotterdam has correct UNLOCODE and VLSFO price in 2026 fixture', () => {
      const result = parseShipAndBunkerHtml(fixture2026Html);
      const rtm = result.get('Rotterdam');
      expect(rtm).toBeDefined();
      expect(rtm!.unlocode).toBe('NLRTM');
      expect(rtm!.vlsfo).toBeCloseTo(791.5);
    });

    it('Singapore has SGSIN in 2026 fixture', () => {
      const result = parseShipAndBunkerHtml(fixture2026Html);
      expect(result.get('Singapore')?.unlocode).toBe('SGSIN');
    });

    it('all returned ports have numeric VLSFO price > 0', () => {
      const result = parseShipAndBunkerHtml(fixture2026Html);
      for (const [, { vlsfo }] of result) {
        expect(vlsfo).toBeGreaterThan(0);
        expect(Number.isFinite(vlsfo)).toBe(true);
      }
    });
  });

  describe('refreshShipAndBunker', () => {
    it('fetches HTML and inserts 4 VLSFO rows', async () => {
      const fetcher = async () => fixtureHtml;
      const result = await refreshShipAndBunker(db, fetcher);

      expect(result.rowsChanged).toBe(4);
    });

    it('stores source=shipandbunker and fuel_grade=VLSFO', async () => {
      const fetcher = async () => fixtureHtml;
      await refreshShipAndBunker(db, fetcher);

      const row = db.prepare(
        "SELECT * FROM bunker_prices WHERE port_unlocode='NLRTM' AND source='shipandbunker'"
      ).get() as any;
      expect(row).toBeTruthy();
      expect(row.fuel_grade).toBe('VLSFO');
      expect(row.price_usd_per_mt).toBeCloseTo(789.5);
    });

    it('throws ShipAndBunkerStructureChangedError when HTML has no port rows', async () => {
      const fetcher = async () => '<html>broken</html>';

      await expect(refreshShipAndBunker(db, fetcher)).rejects.toThrow(ShipAndBunkerStructureChangedError);
    });

    it('on fetch error → rethrows the error', async () => {
      const fetcher = async () => {
        throw new Error('ECONNRESET');
      };

      await expect(refreshShipAndBunker(db, fetcher)).rejects.toThrow('ECONNRESET');
    });

    it('uses cache when cache file is fresh', async () => {
      fs.writeFileSync(tmpCachePath, fixtureHtml);

      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return fixtureHtml;
      };

      await refreshShipAndBunker(db, fetcher);

      expect(fetchCount).toBe(0);
    });

    it('calls fetcher when no cache exists', async () => {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return fixtureHtml;
      };

      await refreshShipAndBunker(db, fetcher);
      expect(fetchCount).toBe(1);
    });

    it('writes cache after successful fetch', async () => {
      const fetcher = async () => fixtureHtml;
      await refreshShipAndBunker(db, fetcher);

      expect(fs.existsSync(tmpCachePath)).toBe(true);
      const cached = fs.readFileSync(tmpCachePath, 'utf-8');
      expect(cached).toBe(fixtureHtml);
    });
  });
});
