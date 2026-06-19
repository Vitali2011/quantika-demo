import { KNOWN_PORTS, getPortDistance } from '../port-distances';
import { getPortMaster } from '../port-master';

/**
 * Reconciliation guard (audit finding #1-3): canonical port names emitted by
 * normalizePortName (concatenated, e.g. "BandarAbbas") must resolve in BOTH
 * port-master (keyed on spaced/accented names) AND searoute. Before the fix,
 * ~23 of 123 KNOWN_PORTS silently returned null coords → TCE/ballast blanked.
 */
describe('port-name reconciliation — every KNOWN_PORTS resolves', () => {
  it.each(KNOWN_PORTS.map((p) => [p]))('getPortMaster(%s) → finite coords', (port) => {
    const m = getPortMaster(port);
    expect(m).not.toBeNull();
    expect(Number.isFinite(m!.lat as number)).toBe(true);
    expect(Number.isFinite(m!.lon as number)).toBe(true);
  });
});

describe('port-name reconciliation — representative multi-word distances', () => {
  const PAIRS: Array<[string, string]> = [
    ['Bandar Abbas', 'Singapore'],
    ['Cape Town', 'Rotterdam'],
    ['Hong Kong', 'Rotterdam'],
    ['Le Havre', 'New York'],
  ];
  it.each(PAIRS)('getPortDistance(%s, %s) → non-null exact distance', (from, to) => {
    const d = getPortDistance(from, to);
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(0);
  });

  it('resolves canonical concatenated forms too (BandarAbbas → Singapore)', () => {
    const d = getPortDistance('BandarAbbas', 'Singapore');
    expect(d).not.toBeNull();
    expect(d!.nm).toBeGreaterThan(0);
  });
});

describe('port-name reconciliation — no regression on working ports', () => {
  it.each([['Rotterdam'], ['Singapore'], ['Istanbul'], ['Karasu'], ['Odesa']])(
    '%s still resolves',
    (port) => {
      expect(getPortMaster(port)).not.toBeNull();
    },
  );

  it('alias-only ports resolve via indexed aliases (Marghera, Dubai)', () => {
    expect(getPortMaster('Marghera')).not.toBeNull();
    expect(getPortMaster('Dubai')).not.toBeNull();
  });
});
