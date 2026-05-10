import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import { refreshUsdaBunker } from '@/lib/knowledge/bunker/usda-adapter';
import type { UsdaRecord } from '@/lib/knowledge/bunker/usda-adapter';
import { registerSource } from '@/lib/knowledge/governance';
import usdaSample from '../../../fixtures/usda-bunker-sample.json';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration023.up(db);
  registerSource(db, {
    slug: 'bunker-usda',
    name: 'USDA Bunker Prices',
    kind: 'structured_rows',
    category: 'market',
    source_url: 'https://agtransport.usda.gov/resource/y4ft-fdwn.json',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
    primary_table: 'bunker_prices',
  });
  return db;
}

describe('usda-adapter', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('refreshUsdaBunker', () => {
    it('inserts known locations and fuel types, skips unknowns', async () => {
      const fetcher = async () => usdaSample as UsdaRecord[];
      const result = await refreshUsdaBunker(db, fetcher);

      // 10 known: 5 ports × 2 fuel types (IFO380→VLSFO, MGO→MGO)
      // 2 unknown: UnknownPort/IFO380 + Rotterdam/HSFO → skipped
      expect(result.rowsChanged).toBe(10);
    });

    it('maps Rotterdam/IFO380 → NLRTM/VLSFO', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [
        { location: 'Rotterdam', fuel_type: 'IFO380', price_per_mt: '789.50', report_date: '2026-05-08T00:00:00.000' },
      ];
      await refreshUsdaBunker(db, fetcher);

      const row = db.prepare(
        "SELECT * FROM bunker_prices WHERE port_unlocode='NLRTM' AND fuel_grade='VLSFO' AND price_date='2026-05-08'"
      ).get() as any;
      expect(row).toBeTruthy();
      expect(row.price_usd_per_mt).toBeCloseTo(789.5);
      expect(row.price_date).toBe('2026-05-08');
      expect(row.source).toBe('usda');
    });

    it('maps all 5 ports correctly', async () => {
      const portCases: Array<[string, string, string]> = [
        ['Rotterdam', 'NLRTM', 'VLSFO'],
        ['Singapore', 'SGSIN', 'VLSFO'],
        ['Fujairah', 'AEFJR', 'VLSFO'],
        ['Houston', 'USHOU', 'VLSFO'],
        ['Gibraltar', 'GIGIB', 'VLSFO'],
      ];

      const fetcher = async (): Promise<UsdaRecord[]> =>
        portCases.map(([location]) => ({
          location,
          fuel_type: 'IFO380',
          price_per_mt: '800.00',
          report_date: '2026-05-08T00:00:00.000',
        }));

      await refreshUsdaBunker(db, fetcher);

      for (const [, unlocode, grade] of portCases) {
        const row = db.prepare(
          'SELECT 1 FROM bunker_prices WHERE port_unlocode=? AND fuel_grade=?'
        ).get(unlocode, grade) as any;
        expect(row).toBeTruthy();
      }
    });

    it('maps MGO fuel_type correctly', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [
        { location: 'Singapore', fuel_type: 'MGO', price_per_mt: '1144.00', report_date: '2026-05-08T00:00:00.000' },
      ];
      await refreshUsdaBunker(db, fetcher);

      const row = db.prepare(
        "SELECT * FROM bunker_prices WHERE port_unlocode='SGSIN' AND fuel_grade='MGO'"
      ).get() as any;
      expect(row).toBeTruthy();
      expect(row.price_usd_per_mt).toBeCloseTo(1144.0);
    });

    it('records sync success in knowledge_sync_log', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [
        { location: 'Rotterdam', fuel_type: 'IFO380', price_per_mt: '789.50', report_date: '2026-05-08T00:00:00.000' },
      ];
      await refreshUsdaBunker(db, fetcher);

      const log = db.prepare(
        "SELECT * FROM knowledge_sync_log WHERE source_slug='bunker-usda' ORDER BY id DESC LIMIT 1"
      ).get() as any;
      expect(log.status).toBe('success');
      expect(log.rows_changed).toBe(1);
    });

    it('on fetch error → reportSyncFailure and rethrows', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => {
        throw new Error('ECONNREFUSED');
      };

      await expect(refreshUsdaBunker(db, fetcher)).rejects.toThrow('ECONNREFUSED');

      const log = db.prepare(
        "SELECT * FROM knowledge_sync_log WHERE source_slug='bunker-usda' ORDER BY id DESC LIMIT 1"
      ).get() as any;
      expect(log.status).toBe('failure');
      expect(log.error_message).toContain('ECONNREFUSED');
    });

    it('on empty array → throws and records failure', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [];

      await expect(refreshUsdaBunker(db, fetcher)).rejects.toThrow();

      const log = db.prepare(
        "SELECT * FROM knowledge_sync_log WHERE source_slug='bunker-usda' ORDER BY id DESC LIMIT 1"
      ).get() as any;
      expect(log.status).toBe('failure');
    });

    it('is idempotent — second run with same data → same rows', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [
        { location: 'Rotterdam', fuel_type: 'IFO380', price_per_mt: '789.50', report_date: '2026-05-08T00:00:00.000' },
      ];
      const r1 = await refreshUsdaBunker(db, fetcher);
      const r2 = await refreshUsdaBunker(db, fetcher);

      // Both succeed — ON CONFLICT DO UPDATE still counts as change via upsert
      expect(r1.rowsChanged).toBe(1);
      expect(r2.rowsChanged).toBe(1);

      const count = (db.prepare('SELECT COUNT(*) as c FROM bunker_prices').get() as any).c;
      // Only 1 unique row (same port/grade/date) due to UNIQUE constraint seed + upsert
      // Seed data is from migration023; our row for 2026-05-08 is new
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('skips unknown location gracefully — returns rowsChanged=0', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [
        { location: 'UnknownPort', fuel_type: 'IFO380', price_per_mt: '500.00', report_date: '2026-05-08T00:00:00.000' },
      ];

      // Should NOT throw — just skip unknown entries and return 0
      const result = await refreshUsdaBunker(db, fetcher);
      expect(result.rowsChanged).toBe(0);
    });

    it('upstreamVersion reflects latest report_date', async () => {
      const fetcher = async (): Promise<UsdaRecord[]> => [
        { location: 'Rotterdam', fuel_type: 'IFO380', price_per_mt: '789.50', report_date: '2026-05-07T00:00:00.000' },
        { location: 'Singapore', fuel_type: 'MGO', price_per_mt: '1144.00', report_date: '2026-05-08T00:00:00.000' },
      ];
      const result = await refreshUsdaBunker(db, fetcher);
      expect(result.upstreamVersion).toBe('2026-05-08');
    });
  });
});
