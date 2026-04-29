import Database from 'better-sqlite3';
import { AisAdapterError, type VesselPosition } from '../../../lib/ais/types';
import { DatalasticAdapter } from '../../../lib/ais/datalastic';
import { ensureAisCacheTable, setCached } from '../../../lib/ais/cache';

const MOCK_POSITION_RESPONSE = {
  data: {
    imo: '1234567',
    mmsi: '123456789',
    lat: 51.5,
    lon: -0.1,
    speed: 12.5,
    heading: 270,
    navigational_status: 'Under way using engine',
    time_utc: '2026-04-29T12:00:00Z',
  },
};

function makeOkResponse(body: unknown, creditsRemaining = 500) {
  return {
    ok: true,
    headers: {
      get: (h: string) => (h === 'X-Credit-Remaining' ? String(creditsRemaining) : null),
    },
    json: async () => body,
  };
}

describe('lib/ais/datalastic', () => {
  let db: Database.Database;
  let adapter: DatalasticAdapter;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureAisCacheTable(db);
    adapter = new DatalasticAdapter(db);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    db.close();
    jest.restoreAllMocks();
    delete process.env['DATALASTIC_API_KEY'];
  });

  // --- Input Contract: missing API key ---

  it('missing API key → throws AisAdapterError', async () => {
    delete process.env['DATALASTIC_API_KEY'];
    await expect(adapter.getPosition('IMO1234567')).rejects.toThrow(AisAdapterError);
  });

  it('missing API key for getEta → throws AisAdapterError', async () => {
    delete process.env['DATALASTIC_API_KEY'];
    await expect(adapter.getEta('IMO1234567')).rejects.toThrow(AisAdapterError);
  });

  // --- Input Contract: empty imo ---

  it('empty imo → throws AisAdapterError', async () => {
    process.env['DATALASTIC_API_KEY'] = 'test-key';
    await expect(adapter.getPosition('')).rejects.toThrow(AisAdapterError);
  });

  // --- Input Contract: empty imos array ---

  it('getStatusFeed with empty array → returns []', async () => {
    process.env['DATALASTIC_API_KEY'] = 'test-key';
    const result = await adapter.getStatusFeed([]);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // --- getPosition parses response ---

  it('getPosition parses Datalastic response into VesselPosition shape', async () => {
    process.env['DATALASTIC_API_KEY'] = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeOkResponse(MOCK_POSITION_RESPONSE)
    );

    const result = await adapter.getPosition('IMO1234567');

    expect(result).toMatchObject({
      imo: '1234567',
      mmsi: '123456789',
      lat: 51.5,
      lon: -0.1,
      speedKn: 12.5,
      headingDeg: 270,
      navStatus: 'Under way using engine',
      timestampUtc: '2026-04-29T12:00:00Z',
    });
  });

  // --- cache hit avoids fetch ---

  it('getPosition cache hit → no fetch call', async () => {
    process.env['DATALASTIC_API_KEY'] = 'test-key';
    const cached: VesselPosition = {
      imo: '1234567',
      lat: 51.5,
      lon: -0.1,
      speedKn: 10,
      headingDeg: 90,
      navStatus: 'At anchor',
      timestampUtc: '2026-04-29T11:00:00Z',
    };
    setCached(db, 'IMO1234567', 'position', cached);

    const result = await adapter.getPosition('IMO1234567');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual(cached);
  });

  // --- 404 / non-ok response → null ---

  it('non-ok response → returns null', async () => {
    process.env['DATALASTIC_API_KEY'] = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await adapter.getPosition('IMO9999999');
    expect(result).toBeNull();
  });
});
