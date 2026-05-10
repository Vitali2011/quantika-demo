import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import {
  refreshShipAndBunker,
  parseShipAndBunkerHtml,
  ShipAndBunkerParseError,
} from '@/lib/knowledge/bunker/shipandbunker-adapter';
import { registerSource } from '@/lib/knowledge/governance';

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, '../../../fixtures/shipandbunker-prices.html'),
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
    // Override cache path to a temp dir so tests don't touch /var/cache
    process.env.BUNKER_CACHE_PATH = tmpCachePath;
    // Remove any stale cache
    try { fs.unlinkSync(tmpCachePath); } catch { /* ok */ }
  });

  afterEach(() => {
    db.close();
    delete process.env.BUNKER_CACHE_PATH;
    try { fs.unlinkSync(tmpCachePath); } catch { /* ok */ }
  });

  describe('parseShipAndBunkerHtml', () => {
    it('parses 5 ports from fixture HTML', () => {
      const result = parseShipAndBunkerHtml(fixtureHtml);
      expect(result.size).toBe(5);
    });

    it('maps Rotterdam to NLRTM with correct VLSFO price', () => {
      const result = parseShipAndBunkerHtml(fixtureHtml);
      const rtm = result.get('Rotterdam');
      expect(rtm).toBeDefined();
      expect(rtm!.unlocode).toBe('NLRTM');
      expect(rtm!.vlsfo).toBeCloseTo(789.5);
    });

    it('maps all 5 port names to correct UNLOCODEs', () => {
      const result = parseShipAndBunkerHtml(fixtureHtml);
      const expected = [
        ['Rotterdam', 'NLRTM'],
        ['Singapore', 'SGSIN'],
        ['Fujairah', 'AEFJR'],
        ['Houston', 'USHOU'],
        ['Gibraltar', 'GIGIB'],
      ];
      for (const [port, unlocode] of expected) {
        expect(result.get(port)?.unlocode).toBe(unlocode);
      }
    });

    it('returns empty map for HTML without port-row rows', () => {
      const result = parseShipAndBunkerHtml('<html><body>No table here</body></html>');
      expect(result.size).toBe(0);
    });

    it('skips rows with unknown port name', () => {
      const html = `<table><tbody>
        <tr class="port-row"><td class="port-name">UnknownPort</td><td class="vlsfo">999.00</td></tr>
      </tbody></table>`;
      const result = parseShipAndBunkerHtml(html);
      expect(result.size).toBe(0);
    });

    it('skips rows with non-numeric VLSFO value', () => {
      const html = `<table><tbody>
        <tr class="port-row"><td class="port-name">Rotterdam</td><td class="vlsfo">N/A</td></tr>
      </tbody></table>`;
      const result = parseShipAndBunkerHtml(html);
      expect(result.size).toBe(0);
    });
  });

  describe('refreshShipAndBunker', () => {
    it('fetches HTML and inserts 5 VLSFO rows', async () => {
      const fetcher = async () => fixtureHtml;
      const result = await refreshShipAndBunker(db, fetcher);

      expect(result.rowsChanged).toBe(5);
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

    it('throws ShipAndBunkerParseError when HTML has no port rows', async () => {
      const fetcher = async () => '<html>broken</html>';

      await expect(refreshShipAndBunker(db, fetcher)).rejects.toThrow(ShipAndBunkerParseError);
      await expect(refreshShipAndBunker(db, fetcher)).rejects.toThrow(
        'No port rows found in HTML',
      );
    });

    it('on fetch error → rethrows the error', async () => {
      const fetcher = async () => {
        throw new Error('ECONNRESET');
      };

      await expect(refreshShipAndBunker(db, fetcher)).rejects.toThrow('ECONNRESET');
    });

    it('uses cache when cache file is fresh', async () => {
      // Write fixture to cache
      fs.writeFileSync(tmpCachePath, fixtureHtml);

      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount++;
        return fixtureHtml;
      };

      await refreshShipAndBunker(db, fetcher);

      // Should NOT have called fetcher since cache is fresh
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

      // Cache should now exist
      expect(fs.existsSync(tmpCachePath)).toBe(true);
      const cached = fs.readFileSync(tmpCachePath, 'utf-8');
      expect(cached).toBe(fixtureHtml);
    });
  });
});
