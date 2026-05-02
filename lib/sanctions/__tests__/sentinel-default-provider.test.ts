/**
 * βf-08: default deals provider must load sample-data deals
 * (not the empty stub). Verifies corpus 01-03 generate alerts,
 * corpus 04 (same vessel name, different IMO) does NOT.
 */

import { runSentinelScan } from '@/scripts/sentinel-scan';

describe('βf-08 default deals provider', () => {
  it('processes deals from sample-data (count > 0)', async () => {
    const result = await runSentinelScan({ dispatch: false });
    expect(result.processedDealsCount).toBeGreaterThan(0);
  });

  it('Sanction-04 false positive (same name, different IMO) → no alert', async () => {
    const result = await runSentinelScan({ dispatch: false });
    const fpAlert = result.alerts.find((a) => a.dealId === 'sample-sanction-04-fp');
    expect(fpAlert).toBeUndefined();
  });

  it('Sanction-01..03 true positives → alerts ≥ 3', async () => {
    const result = await runSentinelScan({ dispatch: false });
    expect(result.alerts.length).toBeGreaterThanOrEqual(3);
    const ids = result.alerts.map((a) => a.dealId);
    expect(ids).toEqual(expect.arrayContaining([
      'sample-sanction-01-tp',
      'sample-sanction-02-tp',
      'sample-sanction-03-tp',
    ]));
  });
});
