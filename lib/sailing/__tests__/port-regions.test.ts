import { getPortRegion, PortRegion } from '../port-regions';
import { KNOWN_PORTS, KnownPort } from '../port-distances';

describe('getPortRegion', () => {
  // ── Exhaustive KnownPort coverage ────────────────────────────────────────

  describe('all KnownPort entries have a region (contract check)', () => {
    it.each(KNOWN_PORTS as unknown as KnownPort[])(
      '%s → non-null region',
      (port) => {
        const region = getPortRegion(port);
        expect(region).not.toBeNull();
      },
    );
  });

  // ── Black Sea ─────────────────────────────────────────────────────────────

  describe('Black Sea ports', () => {
    const BLACK_SEA_PORTS = [
      'Karasu', 'Istanbul', 'Mykolaiv', 'Odesa', 'Chornomorsk',
      'Constanta', 'Varna', 'Burgas', 'Novorossiysk',
      'Taman', 'Tuapse', 'Izmail',
    ];

    it.each(BLACK_SEA_PORTS)('%s → BlackSea', (port) => {
      expect(getPortRegion(port)).toBe('BlackSea');
    });
  });

  // ── Northern Europe ───────────────────────────────────────────────────────

  describe('Northern Europe ports', () => {
    const NORTHERN_EUROPE_PORTS = [
      'Antwerp', 'Hamburg', 'Rotterdam', 'Bremen', 'Halsvik', 'Gdansk', 'Bayonne',
    ];

    it.each(NORTHERN_EUROPE_PORTS)('%s → NorthernEurope', (port) => {
      expect(getPortRegion(port)).toBe('NorthernEurope');
    });
  });

  // ── Mediterranean ─────────────────────────────────────────────────────────

  describe('Mediterranean ports', () => {
    const MED_PORTS = [
      'Piraeus', 'Aliaga', 'Marmara', 'Alexandria', 'Suez',
      'Ravenna', 'Marghera', 'Skikda',
    ];

    it.each(MED_PORTS)('%s → Mediterranean', (port) => {
      expect(getPortRegion(port)).toBe('Mediterranean');
    });
  });

  // ── Atlantic ──────────────────────────────────────────────────────────────

  it('Casablanca → Atlantic', () => {
    expect(getPortRegion('Casablanca')).toBe('Atlantic');
  });

  // ── West Africa ───────────────────────────────────────────────────────────

  describe('West Africa ports', () => {
    it('Dakar → WestAfrica', () => expect(getPortRegion('Dakar')).toBe('WestAfrica'));
    it('Lagos → WestAfrica', () => expect(getPortRegion('Lagos')).toBe('WestAfrica'));
    it('Nacala → WestAfrica', () => expect(getPortRegion('Nacala')).toBe('WestAfrica'));
  });

  // ── Americas ──────────────────────────────────────────────────────────────

  describe('Americas ports', () => {
    const AMERICAS_PORTS = ['Veracruz', 'NewOrleans', 'Houston', 'Santos'];
    it.each(AMERICAS_PORTS)('%s → Americas', (port) => {
      expect(getPortRegion(port)).toBe('Americas');
    });
  });

  // ── Asia ──────────────────────────────────────────────────────────────────

  describe('Asia ports', () => {
    const ASIA_PORTS = ['Singapore', 'Tokyo', 'Shanghai'];
    it.each(ASIA_PORTS)('%s → Asia', (port) => {
      expect(getPortRegion(port)).toBe('Asia');
    });
  });

  // ── Unknown / null / undefined / empty ───────────────────────────────────

  describe('unknown / empty inputs → null', () => {
    it('unknown port name → null', () => {
      expect(getPortRegion('Nonexistent')).toBeNull();
    });

    it('null → null', () => {
      expect(getPortRegion(null)).toBeNull();
    });

    it('undefined → null', () => {
      expect(getPortRegion(undefined)).toBeNull();
    });

    it('empty string → null', () => {
      expect(getPortRegion('')).toBeNull();
    });

    it('whitespace string → null', () => {
      expect(getPortRegion('   ')).toBeNull();
    });
  });

  // ── Case-insensitive lookup ───────────────────────────────────────────────

  describe('case-insensitive lookup', () => {
    it('lowercase karasu → BlackSea', () => {
      expect(getPortRegion('karasu')).toBe('BlackSea');
    });

    it('UPPERCASE KARASU → BlackSea', () => {
      expect(getPortRegion('KARASU')).toBe('BlackSea');
    });

    it('mixed case Rotterdam → NorthernEurope', () => {
      expect(getPortRegion('rotterdam')).toBe('NorthernEurope');
    });

    it('alias odessa → BlackSea (via normalizePortName)', () => {
      expect(getPortRegion('odessa')).toBe('BlackSea');
    });

    it('alias bremerhaven → NorthernEurope (via normalizePortName)', () => {
      expect(getPortRegion('bremerhaven')).toBe('NorthernEurope');
    });
  });

  // ── Return type completeness ──────────────────────────────────────────────

  it('returns a valid PortRegion type for every known port', () => {
    const validRegions: PortRegion[] = [
      'BlackSea', 'Mediterranean', 'NorthernEurope', 'Atlantic',
      'Asia', 'Americas', 'WestAfrica', 'MiddleEast', 'Africa',
    ];
    for (const port of KNOWN_PORTS) {
      const region = getPortRegion(port);
      expect(region).not.toBeNull();
      expect(validRegions).toContain(region);
    }
  });
});
