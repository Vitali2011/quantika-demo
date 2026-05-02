/**
 * BUG-β-01-NaNCoords — parsePosition must reject NaN/out-of-range lat/lon.
 * Without this, downstream consumers propagate NaN and pollute SQLite cache.
 */

import { DatalasticAdapter } from '@/lib/ais/datalastic';

const realFetch = global.fetch;

beforeAll(() => {
  process.env.DATALASTIC_API_KEY = 'k';
});

afterEach(() => {
  global.fetch = realFetch;
});

function mockFetchOnce(payload: unknown): jest.Mock {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => null },
    json: async () => ({ data: payload }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = fn as any;
  return fn;
}

describe('BUG-β-01 parsePosition rejects bad coords', () => {
  it('returns null when lat is missing', async () => {
    mockFetchOnce({ imo: '9999999' });
    const adapter = new DatalasticAdapter();
    const pos = await adapter.getPosition('9999999');
    expect(pos).toBeNull();
  });

  it('returns null when lat is non-numeric string', async () => {
    mockFetchOnce({ imo: '9999999', lat: 'not-a-number', lon: 0 });
    const adapter = new DatalasticAdapter();
    const pos = await adapter.getPosition('9999999');
    expect(pos).toBeNull();
  });

  it('returns null when lat is out of range', async () => {
    mockFetchOnce({ imo: '9999999', lat: 999, lon: 0 });
    const adapter = new DatalasticAdapter();
    const pos = await adapter.getPosition('9999999');
    expect(pos).toBeNull();
  });

  it('returns null when lon is out of range', async () => {
    mockFetchOnce({ imo: '9999999', lat: 0, lon: 999 });
    const adapter = new DatalasticAdapter();
    const pos = await adapter.getPosition('9999999');
    expect(pos).toBeNull();
  });

  it('returns valid object with finite numbers for good coords', async () => {
    mockFetchOnce({
      imo: '9999999',
      lat: 51.5,
      lon: 0.1,
      speed: 12,
      heading: 90,
      navigational_status: 'under way',
      time_utc: '2026-05-02T00:00:00Z',
    });
    const adapter = new DatalasticAdapter();
    const pos = await adapter.getPosition('9999999');
    expect(pos).not.toBeNull();
    expect(pos!.lat).toBe(51.5);
    expect(pos!.lon).toBe(0.1);
    expect(Number.isFinite(pos!.speedKn)).toBe(true);
    expect(Number.isFinite(pos!.headingDeg)).toBe(true);
    expect(pos!.speedKn).toBe(12);
  });

  it('does NOT poison cache when API returns garbage payload', async () => {
    mockFetchOnce({ imo: '9999999', lat: 'garbage', lon: 'garbage' });

    // Mock db: track setCached writes. We pass a fake Database that records
    // any INSERT/REPLACE attempts via prepare().run().
    const runCalls: unknown[][] = [];
    const fakeDb = {
      prepare: jest.fn((sql: string) => ({
        get: () => undefined,
        run: (...args: unknown[]) => {
          if (/INSERT|REPLACE/i.test(sql)) runCalls.push(args);
          return { changes: 0 } as unknown;
        },
      })),
      exec: jest.fn(),
    } as unknown as ConstructorParameters<typeof DatalasticAdapter>[0];

    const adapter = new DatalasticAdapter(fakeDb);
    const pos = await adapter.getPosition('9999999');
    expect(pos).toBeNull();

    // No write to ais_cache should have occurred for the bad payload.
    const writes = runCalls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('NaN'))
    );
    expect(writes).toHaveLength(0);
    // And, more strictly: no cache INSERT at all when parse returned null.
    expect(runCalls).toHaveLength(0);
  });
});
