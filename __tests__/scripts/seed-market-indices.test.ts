import Database from 'better-sqlite3';
import migration027 from '@/lib/migrations/027-market-indices';

let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: () => testDb })),
}));

describe('seedMarketIndices', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    migration027.up(testDb);
    jest.resetModules();
  });
  afterEach(() => {
    testDb.close();
  });

  it('seeds rows for all 3 sources: bhsi, tmi, drewry-bb', async () => {
    const { seedMarketIndices } = await import(
      '@/scripts/knowledge/seeds/seed-market-indices'
    );
    seedMarketIndices();
    const sources = (
      testDb
        .prepare('SELECT DISTINCT index_name FROM market_indices ORDER BY index_name')
        .all() as { index_name: string }[]
    ).map((r) => r.index_name);
    expect(sources).toEqual(['bhsi', 'drewry-bb', 'tmi']);
  });

  it('seeds 30 rows for drewry-bb', async () => {
    const { seedMarketIndices } = await import(
      '@/scripts/knowledge/seeds/seed-market-indices'
    );
    seedMarketIndices();
    const count = testDb
      .prepare("SELECT COUNT(*) as cnt FROM market_indices WHERE index_name='drewry-bb'")
      .get() as { cnt: number };
    expect(count.cnt).toBe(30);
  });

  it('drewry-bb values are in range 1400-1800', async () => {
    const { seedMarketIndices } = await import(
      '@/scripts/knowledge/seeds/seed-market-indices'
    );
    seedMarketIndices();
    const rows = testDb
      .prepare("SELECT value FROM market_indices WHERE index_name='drewry-bb'")
      .all() as { value: number }[];
    expect(rows.length).toBe(30);
    for (const row of rows) {
      expect(row.value).toBeGreaterThanOrEqual(1400);
      expect(row.value).toBeLessThanOrEqual(1800);
    }
  });
});
