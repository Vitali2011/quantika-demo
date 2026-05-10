import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration024 from '@/lib/migrations/024-eua-prices-rewrite';
import { registerSource } from '@/lib/knowledge/governance';

// Mock session-store
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(),
}));

// Mock adapters
jest.mock('@/lib/knowledge/eua/eex-adapter', () => ({
  refreshEex: jest.fn(),
  EexNoAuctionFoundError: class EexNoAuctionFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = 'EexNoAuctionFoundError'; }
  },
}));

jest.mock('@/lib/knowledge/eua/icap-adapter', () => ({
  refreshIcap: jest.fn(),
}));

import { getStore } from '@/lib/session-store';
import { refreshEex } from '@/lib/knowledge/eua/eex-adapter';
import { refreshIcap } from '@/lib/knowledge/eua/icap-adapter';

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

describe('refresh-eua cron — orchestration logic', () => {
  let db: Database.Database;
  let mockExit: jest.SpyInstance;

  beforeEach(() => {
    db = makeDb();
    (getStore as jest.Mock).mockReturnValue({ getDb: () => db });
    mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    jest.clearAllMocks();
    (getStore as jest.Mock).mockReturnValue({ getDb: () => db });
  });

  afterEach(() => {
    db.close();
    mockExit.mockRestore();
  });

  it('EEX success → exit 0, ICAP not called', async () => {
    (refreshEex as jest.Mock).mockResolvedValue({
      rowsChanged: 1,
      priceDate: new Date().toISOString().slice(0, 10), // today
      price: 72.65,
    });

    const { main } = await import('@/scripts/knowledge/cron/refresh-eua');
    await main();

    expect(refreshEex).toHaveBeenCalledTimes(1);
    expect(refreshIcap).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('EEX fail → ICAP called → exit 0', async () => {
    (refreshEex as jest.Mock).mockRejectedValue(new Error('EEX unavailable'));
    (refreshIcap as jest.Mock).mockResolvedValue({
      rowsChanged: 1,
      priceDate: '2026-05-08',
      price: 71.30,
    });

    const { main } = await import('@/scripts/knowledge/cron/refresh-eua');
    await main();

    expect(refreshIcap).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('EEX success but stale price (>3 days ago) → ICAP called as fallback → exit 0', async () => {
    (refreshEex as jest.Mock).mockResolvedValue({
      rowsChanged: 1,
      priceDate: '2026-04-01', // 39+ days ago (well over 3)
      price: 68.00,
    });
    (refreshIcap as jest.Mock).mockResolvedValue({
      rowsChanged: 1,
      priceDate: '2026-05-08',
      price: 71.30,
    });

    const { main } = await import('@/scripts/knowledge/cron/refresh-eua');
    await main();

    expect(refreshIcap).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('both EEX and ICAP fail → exit 1', async () => {
    (refreshEex as jest.Mock).mockRejectedValue(new Error('EEX down'));
    (refreshIcap as jest.Mock).mockRejectedValue(new Error('ICAP down'));

    const { main } = await import('@/scripts/knowledge/cron/refresh-eua');
    await main();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('governance reportSyncStarted called for eua-eex always', async () => {
    (refreshEex as jest.Mock).mockResolvedValue({
      rowsChanged: 1,
      priceDate: new Date().toISOString().slice(0, 10),
      price: 72.65,
    });

    const { main } = await import('@/scripts/knowledge/cron/refresh-eua');
    await main();

    // Verify sync log entry was created for eua-eex
    const log = db.prepare(
      "SELECT * FROM knowledge_sync_log WHERE source_slug='eua-eex' ORDER BY id DESC LIMIT 1"
    ).get() as any;
    expect(log).toBeTruthy();
    expect(log.status).toBe('success');
  });

  it('governance log eua-icap only when fallback activated', async () => {
    (refreshEex as jest.Mock).mockResolvedValue({
      rowsChanged: 1,
      priceDate: new Date().toISOString().slice(0, 10),
      price: 72.65,
    });

    const { main } = await import('@/scripts/knowledge/cron/refresh-eua');
    await main();

    const icapLog = db.prepare(
      "SELECT * FROM knowledge_sync_log WHERE source_slug='eua-icap' ORDER BY id DESC LIMIT 1"
    ).get();
    // SQLite .get() returns undefined (not null) when no row found
    expect(icapLog).toBeUndefined(); // ICAP not used when EEX fresh
  });
});
