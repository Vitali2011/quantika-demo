import { getCurrentBenchmark, formatBenchmarkReference, _clearCacheForTesting } from '../benchmark';
import type { MarketBenchmark } from '@/lib/types';

const MOCK_BENCHMARK: MarketBenchmark = {
  indicator: 'TOEPFER_TMI',
  value: 12683,
  unit: 'USD/day',
  period: 'Apr 2026',
  sourceUrl: 'https://heavyliftpfi.com/market-data/',
  fetchedAt: new Date().toISOString(),
};

jest.mock('../toepfer-scraper', () => ({
  fetchToepferTmi: jest.fn(),
}));

import { fetchToepferTmi } from '../toepfer-scraper';
const mockedFetch = fetchToepferTmi as jest.MockedFunction<typeof fetchToepferTmi>;

describe('getCurrentBenchmark', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    _clearCacheForTesting();
  });

  it('fetches and returns benchmark on cache miss', async () => {
    mockedFetch.mockResolvedValue(MOCK_BENCHMARK);

    const result = await getCurrentBenchmark('TOEPFER_TMI');

    expect(result).not.toBeNull();
    expect(result!.indicator).toBe('TOEPFER_TMI');
    expect(result!.value).toBe(12683);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when fetch returns null and no cache', async () => {
    mockedFetch.mockResolvedValue(null);

    const result = await getCurrentBenchmark('TOEPFER_TMI');

    expect(result).toBeNull();
  });
});

describe('formatBenchmarkReference', () => {
  it('formats benchmark as expected string', () => {
    const formatted = formatBenchmarkReference(MOCK_BENCHMARK);
    expect(formatted).toBe('Toepfer TMI Apr 2026 — $12,683/day TCE');
  });

  it('formats different values correctly', () => {
    const bench: MarketBenchmark = { ...MOCK_BENCHMARK, value: 9500, period: 'Mar 2026' };
    const formatted = formatBenchmarkReference(bench);
    expect(formatted).toBe('Toepfer TMI Mar 2026 — $9,500/day TCE');
  });
});
