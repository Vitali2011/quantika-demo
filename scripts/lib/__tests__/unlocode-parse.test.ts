import { parseUnlocodeCoords, parseUnlocodeRow, parseCsvLine } from '../unlocode-parse';

describe('parseUnlocodeCoords', () => {
  it('parses N/E (Rotterdam ~51.55°N 4.48°E)', () => {
    const r = parseUnlocodeCoords('5155N 00429E');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(51.917, 2);
    expect(r!.lon).toBeCloseTo(4.483, 2);
  });

  it('parses S/W (Buenos Aires ~34.5°S 58.4°W)', () => {
    const r = parseUnlocodeCoords('3430S 05827W');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(-34.5, 1);
    expect(r!.lon).toBeCloseTo(-58.45, 1);
  });

  it('handles zero minutes (equator)', () => {
    const r = parseUnlocodeCoords('0000N 00000E');
    expect(r).toEqual({ lat: 0, lon: 0 });
  });

  it('returns null on empty / whitespace', () => {
    expect(parseUnlocodeCoords('')).toBeNull();
    expect(parseUnlocodeCoords('   ')).toBeNull();
    expect(parseUnlocodeCoords(null as unknown as string)).toBeNull();
  });

  it('returns null on malformed input', () => {
    expect(parseUnlocodeCoords('abc')).toBeNull();
    expect(parseUnlocodeCoords('9999X 99999Y')).toBeNull();
    expect(parseUnlocodeCoords('5155N')).toBeNull();  // missing longitude
  });

  it('rounds to 3 decimals', () => {
    const r = parseUnlocodeCoords('5130N 00445E')!;
    // 30' = 0.500, 45' = 0.750 — exact, no rounding artefact
    expect(r.lat).toBe(51.5);
    expect(r.lon).toBe(4.75);
  });
});

describe('parseCsvLine', () => {
  it('splits on commas outside quotes', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('preserves commas inside quoted fields', () => {
    expect(parseCsvLine('"Hello, world",b,c')).toEqual(['Hello, world', 'b', 'c']);
  });

  it('strips surrounding quotes but keeps inner content', () => {
    expect(parseCsvLine('"a","b b","c"')).toEqual(['a', 'b b', 'c']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parseUnlocodeRow', () => {
  // UN/LOCODE CSV format (12 fields):
  // Change, Country, Location, Name, NameWoDiacritics, Subdivision, Status,
  // Function, Date, IATA, Coordinates, Remarks
  const FIXTURE_ROTTERDAM = '"","NL","RTM","Rotterdam","Rotterdam","","AI","1-------","1601","RTM","5155N 00429E",""';

  it('extracts unlocode, name, country, coords for a valid port row', () => {
    const r = parseUnlocodeRow(FIXTURE_ROTTERDAM);
    expect(r).not.toBeNull();
    expect(r).toMatchObject({
      unlocode: 'NLRTM',
      country: 'NL',
      name: 'Rotterdam',
    });
    expect(r!.lat).toBeCloseTo(51.917, 2);
    expect(r!.lon).toBeCloseTo(4.483, 2);
  });

  it('returns null when Function byte 1 is "0" (not a seaport)', () => {
    // Function "0-------" = unspecified/not port. Position 1 is the seaport flag.
    const row = FIXTURE_ROTTERDAM.replace('"1-------"', '"0-------"');
    expect(parseUnlocodeRow(row)).toBeNull();
  });

  it('returns null when status is QQ/XX/RR/RL (unapproved)', () => {
    for (const badStatus of ['QQ', 'XX', 'RR', 'RL']) {
      const row = FIXTURE_ROTTERDAM.replace('"AI"', `"${badStatus}"`);
      expect(parseUnlocodeRow(row)).toBeNull();
    }
  });

  it('accepts AA (Approved) as well as AI (Approved, Information)', () => {
    const row = FIXTURE_ROTTERDAM.replace('"AI"', '"AA"');
    expect(parseUnlocodeRow(row)).not.toBeNull();
  });

  it('returns null when coordinates are missing (skip unmappable ports)', () => {
    const row = FIXTURE_ROTTERDAM.replace('"5155N 00429E"', '""');
    expect(parseUnlocodeRow(row)).toBeNull();
  });

  it('returns null for country-header rows (no Location code)', () => {
    const header = '"","NL","","Netherlands","Netherlands","","AA","------89","","","",""';
    expect(parseUnlocodeRow(header)).toBeNull();
  });

  it('accepts function with seaport flag anywhere in the string (e.g. "12345---")', () => {
    const row = FIXTURE_ROTTERDAM.replace('"1-------"', '"12345---"');
    expect(parseUnlocodeRow(row)).not.toBeNull();
  });
});
