import { searchOpenSanctions, checkVesselSanctions } from '../opensanctions';
import type { OsMatch } from '../opensanctions';

const MOCK_MATCH: OsMatch = {
  id: 'Q123',
  caption: 'Test Vessel',
  score: 0.92,
  datasets: ['us_ofac_sdn'],
  properties: { name: ['Test Vessel'] },
};

const MOCK_LOW_SCORE_MATCH: OsMatch = {
  id: 'Q456',
  caption: 'Similar Vessel',
  score: 0.70,
  datasets: ['eu_fsf'],
  properties: { name: ['Similar Vessel'] },
};

describe('searchOpenSanctions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls the OpenSanctions API with correct URL and returns matches', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        responses: { 'q-0': { results: [MOCK_MATCH] } },
      }),
    } as unknown as Response);

    const matches = await searchOpenSanctions('Test Vessel');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.opensanctions.org'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].score).toBe(0.92);
  });

  it('returns empty array when API returns no results', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ responses: { 'q-0': { results: [] } } }),
    } as unknown as Response);

    const matches = await searchOpenSanctions('Unknown Vessel');
    expect(matches).toHaveLength(0);
  });

  it('returns empty array on network error (graceful fallback)', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    const matches = await searchOpenSanctions('Vessel Name');
    expect(matches).toHaveLength(0);
  });

  it('returns empty array on non-ok HTTP response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as unknown as Response);

    const matches = await searchOpenSanctions('Vessel Name');
    expect(matches).toHaveLength(0);
  });
});

describe('checkVesselSanctions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns sanctioned=true when match score >= 0.85', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ responses: { 'q-0': { results: [MOCK_MATCH] } } }),
    } as unknown as Response);

    const result = await checkVesselSanctions('Test Vessel');
    expect(result.sanctioned).toBe(true);
    expect(result.sources).toContain('us_ofac_sdn');
  });

  it('returns sanctioned=false when no match score >= 0.85', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ responses: { 'q-0': { results: [MOCK_LOW_SCORE_MATCH] } } }),
    } as unknown as Response);

    const result = await checkVesselSanctions('Similar Vessel');
    expect(result.sanctioned).toBe(false);
    expect(result.matches).toHaveLength(1);
  });

  it('returns sanctioned=false with empty matches on error', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('timeout'));

    const result = await checkVesselSanctions('Vessel Name');
    expect(result.sanctioned).toBe(false);
    expect(result.matches).toHaveLength(0);
    expect(result.sources).toHaveLength(0);
  });
});
