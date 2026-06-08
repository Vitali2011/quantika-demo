/**
 * PI2 behavioral test: buildEconomicsInsert reads tce_usd_per_day from a stored
 * match row, not from the non-existent /api/voyage/[id]/economics route.
 */
import { buildEconomicsInsert } from '../inserts/economics';

const fakeMatch = {
  tce_usd_per_day: 18_500,
  freight_rate_usd_per_mt: 32.5,
  load_port: 'Rotterdam',
  discharge_port: 'Lagos',
};

describe('buildEconomicsInsert', () => {
  it('returns tce_usd_per_day from stored match, not "not available"', async () => {
    const result = await buildEconomicsInsert('42', {
      fetcher: async () => fakeMatch,
    });
    expect(result.plain).toContain('18,500');
    expect(result.plain).not.toContain('not available');
    expect(result.html).toContain('18,500');
  });

  it('returns "not available" when fetcher returns null', async () => {
    const result = await buildEconomicsInsert('99', {
      fetcher: async () => null,
    });
    expect(result.plain).toContain('n/a');
  });

  it('renders freight rate and route when present', async () => {
    const result = await buildEconomicsInsert('42', {
      fetcher: async () => fakeMatch,
    });
    expect(result.plain).toContain('32');
    expect(result.plain).toContain('Rotterdam');
    expect(result.plain).toContain('Lagos');
  });

  it('handles null load_port and discharge_port gracefully', async () => {
    const result = await buildEconomicsInsert('5', {
      fetcher: async () => ({
        tce_usd_per_day: 12_000,
        freight_rate_usd_per_mt: null,
        load_port: null,
        discharge_port: null,
      }),
    });
    expect(result.plain).toContain('12,000');
    expect(result.plain).not.toContain('not available');
  });
});
