import { fetchPscHistory, type PscRecord } from '../psc-adapter';

/**
 * Input Contract tested:
 * - imo: empty ("", null, undefined) → return []
 * - imo: invalid format → accept as-is, API will decide
 * - PSC_DETENTION_ENABLED !== 'true' → return []
 * - API returns 404 → return []
 * - Network error → return []
 */

// Mock global fetch
const originalFetch = global.fetch;

describe('psc-adapter', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.PSC_DETENTION_ENABLED;
    delete process.env.PSC_API_BASE_URL;
  });

  // RED test: fetchPscHistory returns records when flag enabled
  it('fetchPscHistory returns records when flag enabled', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';
    process.env.PSC_API_BASE_URL = 'https://api.example.com';

    const mockResponse: any[] = [
      {
        id: 'p1',
        imo: '9123456',
        inspection_date: '2025-01-15',
        port: 'Rotterdam',
        authority: 'paris-mou',
        deficiencies: 3,
        detained: true,
        source_url: 'https://example.com/p1',
      },
      {
        id: 'p2',
        imo: '9123456',
        inspection_date: '2025-01-10',
        port: null,
        authority: 'tokyo-mou',
        deficiencies: 0,
        detained: false,
        source_url: null,
      },
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await fetchPscHistory('9123456');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('p1');
    expect(result[0].detained).toBe(true);
    expect(result[1].id).toBe('p2');
    expect(result[1].detained).toBe(false);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/vessels/9123456/inspections',
      expect.any(Object)
    );
  });

  // RED test: fetchPscHistory returns [] when flag disabled
  it('fetchPscHistory returns [] when flag disabled', async () => {
    process.env.PSC_DETENTION_ENABLED = 'false';

    const result = await fetchPscHistory('9123456');

    expect(result).toEqual([]);
  });

  // RED test: fetchPscHistory returns [] when flag not set
  it('fetchPscHistory returns [] when flag not set', async () => {
    delete process.env.PSC_DETENTION_ENABLED;

    const result = await fetchPscHistory('9123456');

    expect(result).toEqual([]);
  });

  // RED test: fetchPscHistory returns [] when API returns 404
  it('fetchPscHistory returns [] when API returns 404', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';
    process.env.PSC_API_BASE_URL = 'https://api.example.com';

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await fetchPscHistory('9123456');

    expect(result).toEqual([]);
  });

  // RED test: fetchPscHistory handles network error gracefully
  it('fetchPscHistory handles network error gracefully', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';
    process.env.PSC_API_BASE_URL = 'https://api.example.com';

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchPscHistory('9123456');

    expect(result).toEqual([]);
  });

  // RED test (boundary): fetchPscHistory with empty imo
  it('fetchPscHistory returns [] for empty imo', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';

    const result1 = await fetchPscHistory('');
    const result2 = await fetchPscHistory(null as any);
    const result3 = await fetchPscHistory(undefined as any);

    expect(result1).toEqual([]);
    expect(result2).toEqual([]);
    expect(result3).toEqual([]);
  });

  // RED test: fetchPscHistory with invalid imo format (accept as-is)
  it('fetchPscHistory accepts invalid imo format', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';
    process.env.PSC_API_BASE_URL = 'https://api.example.com';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const result = await fetchPscHistory('invalid-imo-123');

    expect(result).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/vessels/invalid-imo-123/inspections',
      expect.any(Object)
    );
  });

  // RED test: fetchPscHistory with missing PSC_API_BASE_URL
  it('fetchPscHistory returns [] when PSC_API_BASE_URL not set', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';
    delete process.env.PSC_API_BASE_URL;

    const result = await fetchPscHistory('9123456');

    expect(result).toEqual([]);
  });

  // RED test: fetchPscHistory handles non-JSON response
  it('fetchPscHistory handles non-JSON response gracefully', async () => {
    process.env.PSC_DETENTION_ENABLED = 'true';
    process.env.PSC_API_BASE_URL = 'https://api.example.com';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    } as Response);

    const result = await fetchPscHistory('9123456');

    expect(result).toEqual([]);
  });
});
