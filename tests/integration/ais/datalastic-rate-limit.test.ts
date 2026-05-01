import Database from 'better-sqlite3';
import { DatalasticAdapter } from '../../../lib/ais/datalastic';
import { AIS_CACHE_TTL_MS, ensureAisCacheTable } from '../../../lib/ais/cache';
import type { VesselPosition } from '../../../lib/ais/types';

const STALE_POSITION: VesselPosition = {
  imo: '1234567',
  lat: 55.0,
  lon: 10.0,
  speedKn: 8,
  headingDeg: 180,
  navStatus: 'Under way using engine',
  timestampUtc: '2026-04-29T10:00:00Z',
};

describe('ais/datalastic rate-limit fallback (integration)', () => {
  let db: Database.Database;
  let adapter: DatalasticAdapter;

  beforeEach(() => {
    process.env['DATALASTIC_API_KEY'] = 'test-key';
    db = new Database(':memory:');
    ensureAisCacheTable(db);
    // Fresh adapter per test (resets creditsLow state)
    adapter = new DatalasticAdapter(db);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    db.close();
    jest.restoreAllMocks();
    delete process.env['DATALASTIC_API_KEY'];
  });

  it('response with X-Credit-Remaining: 10 → next call returns stale cache without HTTP', async () => {
    // Pre-populate an expired cache entry
    db.prepare(
      'INSERT OR REPLACE INTO ais_cache (imo, kind, payload, fetched_at) VALUES (?, ?, ?, ?)'
    ).run('IMO1234567', 'position', JSON.stringify(STALE_POSITION), Date.now() - AIS_CACHE_TTL_MS - 1);

    // First call: fetch returns low credits
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (h: string) => (h === 'X-Credit-Remaining' ? '10' : null),
      },
      json: async () => ({
        data: {
          imo: '1234567',
          mmsi: '123456789',
          lat: 56.0,
          lon: 11.0,
          speed: 9,
          heading: 185,
          navigational_status: 'Under way using engine',
          time_utc: '2026-04-29T12:00:00Z',
        },
      }),
    });

    // First call — makes HTTP, sees credits low, returns stale cache
    await adapter.getPosition('IMO1234567');

    // Second call — must NOT call fetch; returns stale cache
    const result2 = await adapter.getPosition('IMO1234567');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result2).toEqual(STALE_POSITION);
  });

  it('when creditsLow and no stale cache → returns null without HTTP', async () => {
    // No cache at all; force creditsLow by calling once with low-credit response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (h: string) => (h === 'X-Credit-Remaining' ? '5' : null),
      },
      json: async () => ({
        data: {
          imo: '9999999',
          lat: 1,
          lon: 1,
          speed: 1,
          heading: 0,
          navigational_status: 'Moored',
          time_utc: '2026-04-29T10:00:00Z',
        },
      }),
    });

    // First call triggers low-credit state
    await adapter.getPosition('IMO9999999');

    // Second call on a DIFFERENT imo that has no stale cache
    const result = await adapter.getPosition('IMO0000001');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });
});
