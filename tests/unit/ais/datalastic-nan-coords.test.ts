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
});
