/**
 * wave-γ-4 Task 3 (BUG-05): compareRoutes hardcoded daUsd:0 in buildLeg,
 * so the breakdown always reported da_usd:0 even when port DAs were known.
 * Fix threads an optional DaResolver through compareRoutes → buildLeg, and
 * the HTTP caller wires it from the existing port-da repository.
 */
import { compareRoutes, type DaResolver } from '@/lib/economics/route-decision';

const vessel = {
  dwt: 80_000,
  valueUsd: 35_000_000,
  speedKts: 14,
  consumptionMtPerDay: 28,
};
const cargo = { quantityMt: 70_000, freightRateUsdPerMt: 22 };
const marketRates = { bunkerPriceUsdPerMt: 600, euaPriceEur: 70 };

describe('wave-γ-4: compareRoutes daResolver wiring (BUG-05 fix)', () => {
  it('without resolver: daUsd defaults to 0 (back-compat)', async () => {
    const r = await compareRoutes('singapore', 'rotterdam', vessel, cargo, marketRates);
    expect(r.suez.breakdown.da_usd).toBe(0);
    expect(r.cape.breakdown.da_usd).toBe(0);
    expect(r.suez.breakdown.applicable.da).toBe(false);
    expect(r.cape.breakdown.applicable.da).toBe(false);
  });

  it('with resolver: positive daUsd flows into BOTH suez and cape breakdowns (origin + destination)', async () => {
    const daByPort: Record<string, number> = {
      singapore: 35_000,
      rotterdam: 42_000,
    };
    const resolver: DaResolver = (port) => daByPort[port.toLowerCase()] ?? 0;

    const r = await compareRoutes('singapore', 'rotterdam', vessel, cargo, marketRates, resolver);

    // Positive contract: DA is non-zero AND equals origin+destination sum
    const expected = daByPort.singapore + daByPort.rotterdam;
    expect(r.suez.breakdown.da_usd).toBe(expected);
    expect(r.cape.breakdown.da_usd).toBe(expected);
    expect(r.suez.breakdown.applicable.da).toBe(true);
    expect(r.cape.breakdown.applicable.da).toBe(true);
  });

  it('resolver is passed BOTH origin and destination port codes with the vessel dwt', async () => {
    const seen: Array<{ port: string; dwt: number }> = [];
    const resolver: DaResolver = (port, dwt) => {
      seen.push({ port, dwt });
      return 10_000;
    };

    await compareRoutes('singapore', 'rotterdam', vessel, cargo, marketRates, resolver);

    // Both legs share the same origin/destination, so resolver invoked once per
    // unique (port, leg) — at least both ports must appear with the vessel's dwt.
    const ports = seen.map((s) => s.port.toLowerCase());
    expect(ports).toContain('singapore');
    expect(ports).toContain('rotterdam');
    for (const s of seen) {
      expect(s.dwt).toBe(vessel.dwt);
    }
  });

  it('resolver returning 0 for one port still sums correctly (only the known port contributes)', async () => {
    const resolver: DaResolver = (port) => (port.toLowerCase() === 'singapore' ? 25_000 : 0);

    const r = await compareRoutes('singapore', 'rotterdam', vessel, cargo, marketRates, resolver);
    expect(r.suez.breakdown.da_usd).toBe(25_000);
    expect(r.cape.breakdown.da_usd).toBe(25_000);
  });
});
