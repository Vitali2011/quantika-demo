import * as fs from 'fs';
import * as path from 'path';
import { fetchToepferTmi } from '../toepfer-scraper';

const FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'heavyliftpfi-tmi.html'),
  'utf-8',
);

describe('fetchToepferTmi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('parses value and period from fixture HTML', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => FIXTURE_HTML,
    } as unknown as Response);

    const result = await fetchToepferTmi();

    expect(result).not.toBeNull();
    expect(result!.indicator).toBe('TOEPFER_TMI');
    expect(result!.value).toBe(12683);
    expect(result!.unit).toBe('USD/day');
    expect(result!.period).toMatch(/april 2026/i);
    expect(result!.sourceUrl).toContain('heavyliftpfi.com');
    expect(result!.fetchedAt).toBeTruthy();
  });

  it('returns null when fetch fails (network error)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchToepferTmi();

    expect(result).toBeNull();
  });

  it('returns null when response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as unknown as Response);

    const result = await fetchToepferTmi();

    expect(result).toBeNull();
  });

  it('returns null when HTML contains no TMI value', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body><p>No data available</p></body></html>',
    } as unknown as Response);

    const result = await fetchToepferTmi();

    expect(result).toBeNull();
  });
});
