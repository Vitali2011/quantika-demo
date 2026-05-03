/**
 * Tests for lib/economics/war-risk.ts — βf3-02b additions:
 * alias-based matching and ResolvedPort input support.
 */

import { calculateWarRiskPremium } from '@/lib/economics/war-risk';
import { resolvePort } from '@/lib/ports/resolve';

const BASE_VALUE = 12_000_000;

describe('calculateWarRiskPremium — string input (BC)', () => {
  it('matches Lagos by name string', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Lagos', toPort: 'Antwerp' },
      vesselValueUsd: BASE_VALUE,
    });
    expect(result.applicable).toBe(true);
    expect(result.zoneIds).toContain('gulf-of-guinea');
  });

  it('matches Apapa by name string', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Apapa', toPort: 'Rotterdam' },
      vesselValueUsd: BASE_VALUE,
    });
    expect(result.applicable).toBe(true);
    expect(result.zoneIds).toContain('gulf-of-guinea');
  });

  it('non-HRA port → not applicable', () => {
    const result = calculateWarRiskPremium({
      route: { fromPort: 'Antwerp', toPort: 'Rotterdam' },
      vesselValueUsd: BASE_VALUE,
    });
    expect(result.applicable).toBe(false);
    expect(result.premiumUsd).toBe(0);
  });
});

describe('calculateWarRiskPremium — ResolvedPort input', () => {
  it('NGAPP resolved port → GoG applicable', () => {
    const port = resolvePort('NGAPP');
    expect(port).not.toBeNull();
    const result = calculateWarRiskPremium({
      route: { fromPort: port!, toPort: 'Antwerp' },
      vesselValueUsd: BASE_VALUE,
    });
    expect(result.applicable).toBe(true);
    expect(result.zoneIds).toContain('gulf-of-guinea');
  });

  it('"Lagos" resolved port → same premium as NGAPP resolved port', () => {
    const portByName = resolvePort('Lagos');
    const portByLocode = resolvePort('NGAPP');
    expect(portByName).not.toBeNull();
    expect(portByLocode).not.toBeNull();

    const resultByName = calculateWarRiskPremium({
      route: { fromPort: portByName!, toPort: 'Rotterdam' },
      vesselValueUsd: BASE_VALUE,
    });
    const resultByLocode = calculateWarRiskPremium({
      route: { fromPort: portByLocode!, toPort: 'Rotterdam' },
      vesselValueUsd: BASE_VALUE,
    });

    expect(resultByName.premiumUsd).toBe(resultByLocode.premiumUsd);
    expect(resultByName.applicable).toBe(resultByLocode.applicable);
  });

  it('aliases matching — "Lagos Port" alias on NGAPP → GoG detected', () => {
    const port = resolvePort('Lagos Port');
    expect(port).not.toBeNull();
    // Even if portName is "Apapa", aliases contain "Lagos Port"
    const result = calculateWarRiskPremium({
      route: { fromPort: port!, toPort: 'Antwerp' },
      vesselValueUsd: BASE_VALUE,
    });
    expect(result.applicable).toBe(true);
    expect(result.zoneIds).toContain('gulf-of-guinea');
  });
});
