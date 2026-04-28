import * as fs from 'fs';
import * as path from 'path';
import { parseBunkerHtml, fetchBunkerPrices } from '../bunker';

const FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'shipandbunker-sample.html'),
  'utf-8'
);

describe('parseBunkerHtml', () => {
  it('parses all 5 ports from fixture HTML', () => {
    const result = parseBunkerHtml(FIXTURE_HTML);
    expect(result.size).toBe(5);
  });

  it('correctly parses Rotterdam price', () => {
    const result = parseBunkerHtml(FIXTURE_HTML);
    const rotterdam = result.get('Rotterdam');
    expect(rotterdam).toBeDefined();
    expect(rotterdam!.vlsfo).toBe(512.0);
    expect(rotterdam!.mgo).toBe(748.0);
    expect(rotterdam!.port).toBe('Rotterdam');
  });

  it('correctly parses Singapore price', () => {
    const result = parseBunkerHtml(FIXTURE_HTML);
    const sg = result.get('Singapore');
    expect(sg!.vlsfo).toBe(498.5);
  });

  it('correctly parses all known ports', () => {
    const result = parseBunkerHtml(FIXTURE_HTML);
    expect(result.has('Houston')).toBe(true);
    expect(result.has('Fujairah')).toBe(true);
    expect(result.has('Algeciras')).toBe(true);
  });

  it('returns empty map for empty/invalid HTML', () => {
    const result = parseBunkerHtml('<html><body>no data</body></html>');
    expect(result.size).toBe(0);
  });

  it('each BunkerPrice has fetched_at string', () => {
    const result = parseBunkerHtml(FIXTURE_HTML);
    result.forEach(p => {
      expect(typeof p.fetched_at).toBe('string');
      expect(p.fetched_at).toBeTruthy();
    });
  });
});

describe('fetchBunkerPrices', () => {
  it('returns Map (possibly empty) without throwing', async () => {
    // Mock fetch to return fixture HTML
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => FIXTURE_HTML,
    } as unknown as Response);

    const result = await fetchBunkerPrices();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(5);
  });

  it('returns empty Map on network failure (graceful fallback)', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('network error'));
    const result = await fetchBunkerPrices();
    expect(result).toBeInstanceOf(Map);
  });

  it('filters by ports when provided', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => FIXTURE_HTML,
    } as unknown as Response);

    const result = await fetchBunkerPrices(['Rotterdam', 'Singapore']);
    expect(result.size).toBeLessThanOrEqual(2);
  });
});
