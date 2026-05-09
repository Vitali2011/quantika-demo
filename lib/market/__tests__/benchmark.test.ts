import { formatBenchmarkReference } from '../benchmark';
import type { MarketBenchmark } from '@/lib/types';

const MOCK_BENCHMARK: MarketBenchmark = {
  indicator: 'TOEPFER_TMI',
  value: 12683,
  unit: 'USD/day',
  period: 'Apr 2026',
  sourceUrl: 'https://heavyliftpfi.com/market-data/',
  fetchedAt: new Date().toISOString(),
};

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
