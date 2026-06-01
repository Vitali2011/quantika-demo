import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import { registerSource } from '@/lib/knowledge/governance';

// We test the cron script logic directly by importing main and mocking adapters
jest.mock('@/lib/knowledge/bunker/usda-adapter', () => ({
  refreshUsdaBunker: jest.fn(),
}));
jest.mock('@/lib/knowledge/bunker/shipandbunker-adapter', () => ({
  refreshShipAndBunker: jest.fn(),
  ShipAndBunkerParseError: class ShipAndBunkerParseError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ShipAndBunkerParseError'; }
  },
}));
jest.mock('@/lib/knowledge/bunker/bunkerindex-adapter', () => ({
  refreshBunkerIndex: jest.fn(),
}));
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(),
}));

import { refreshUsdaBunker } from '@/lib/knowledge/bunker/usda-adapter';
import { refreshShipAndBunker } from '@/lib/knowledge/bunker/shipandbunker-adapter';
import { refreshBunkerIndex } from '@/lib/knowledge/bunker/bunkerindex-adapter';
import { getStore } from '@/lib/session-store';

const mockRefreshUsda = refreshUsdaBunker as jest.MockedFunction<typeof refreshUsdaBunker>;
const mockRefreshSnb = refreshShipAndBunker as jest.MockedFunction<typeof refreshShipAndBunker>;
const mockRefreshBi = refreshBunkerIndex as jest.MockedFunction<typeof refreshBunkerIndex>;
const mockGetStore = getStore as jest.MockedFunction<typeof getStore>;

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration023.up(db);

  for (const slug of ['bunker-usda', 'bunker-shipandbunker', 'bunker-bunkerindex']) {
    registerSource(db, {
      slug,
      name: slug,
      kind: 'structured_rows',
      category: 'market',
      refresh_mode: 'auto-daily',
      stale_threshold_days: 1,
    });
  }
  return db;
}

describe('refresh-bunker cron', () => {
  let db: Database.Database;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    db = makeDb();
    mockGetStore.mockReturnValue({ getDb: () => db } as any);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    jest.clearAllMocks();
    mockGetStore.mockReturnValue({ getDb: () => db } as any);
    // Default BI to succeed (non-disruptive to existing tests)
    mockRefreshBi.mockResolvedValue({ rowsChanged: 6 });
  });

  afterEach(() => {
    db.close();
    exitSpy.mockRestore();
  });

  it('exits 0 when both USDA and SnB succeed', async () => {
    mockRefreshUsda.mockResolvedValue({ rowsChanged: 10, upstreamVersion: '2026-05-08' });
    mockRefreshSnb.mockResolvedValue({ rowsChanged: 5 });

    const { main } = await import('@/scripts/knowledge/cron/refresh-bunker');
    await main();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 0 when only USDA succeeds (Ship&Bunker fails)', async () => {
    mockRefreshUsda.mockResolvedValue({ rowsChanged: 10, upstreamVersion: '2026-05-08' });
    mockRefreshSnb.mockRejectedValue(new Error('Parse failed'));

    const { main } = await import('@/scripts/knowledge/cron/refresh-bunker');
    await main();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 0 when only Ship&Bunker succeeds (USDA fails)', async () => {
    mockRefreshUsda.mockRejectedValue(new Error('Network error'));
    mockRefreshSnb.mockResolvedValue({ rowsChanged: 5 });

    const { main } = await import('@/scripts/knowledge/cron/refresh-bunker');
    await main();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 0 when only BunkerIndex succeeds (USDA and SnB fail)', async () => {
    mockRefreshUsda.mockRejectedValue(new Error('USDA down'));
    mockRefreshSnb.mockRejectedValue(new Error('SnB down'));
    mockRefreshBi.mockResolvedValue({ rowsChanged: 6 });

    const { main } = await import('@/scripts/knowledge/cron/refresh-bunker');
    await main();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits 1 when all three sources fail', async () => {
    mockRefreshUsda.mockRejectedValue(new Error('USDA down'));
    mockRefreshSnb.mockRejectedValue(new Error('SnB down'));
    mockRefreshBi.mockRejectedValue(new Error('BI down'));

    const { main } = await import('@/scripts/knowledge/cron/refresh-bunker');
    await main();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('records sync_log entries for all three slugs independently', async () => {
    mockRefreshUsda.mockResolvedValue({ rowsChanged: 10, upstreamVersion: '2026-05-08' });
    mockRefreshSnb.mockRejectedValue(new Error('SnB error'));
    mockRefreshBi.mockResolvedValue({ rowsChanged: 6 });

    const { main } = await import('@/scripts/knowledge/cron/refresh-bunker');
    await main();

    const usdaLog = db.prepare(
      "SELECT * FROM knowledge_sync_log WHERE source_slug='bunker-usda' ORDER BY id DESC LIMIT 1"
    ).get() as any;
    const snbLog = db.prepare(
      "SELECT * FROM knowledge_sync_log WHERE source_slug='bunker-shipandbunker' ORDER BY id DESC LIMIT 1"
    ).get() as any;
    const biLog = db.prepare(
      "SELECT * FROM knowledge_sync_log WHERE source_slug='bunker-bunkerindex' ORDER BY id DESC LIMIT 1"
    ).get() as any;

    expect(usdaLog.status).toBe('success');
    expect(snbLog.status).toBe('failure');
    expect(biLog.status).toBe('success');
  });
});
