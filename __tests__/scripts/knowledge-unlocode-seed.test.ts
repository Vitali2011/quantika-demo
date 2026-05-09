/**
 * Tests for scripts/knowledge-unlocode-seed.ts
 * Covers: coordinate conversion, CSV parsing, DB upsert logic.
 */

jest.mock('@/lib/db', () => ({ getDb: jest.fn(() => ({})) }));
jest.mock('@/lib/migrations/runner', () => ({ runMigrations: jest.fn() }));
jest.mock('@/lib/migrations/index', () => ({ allMigrations: [] }));

import { parseUnlocodeCoords, parseCsv, upsertRows } from '../../scripts/knowledge-unlocode-seed';

describe('parseUnlocodeCoords', () => {
  it('parses northern/eastern coords', () => {
    const r = parseUnlocodeCoords('5155N 00421E');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(51 + 55 / 60, 3);
    expect(r!.lon).toBeCloseTo(4 + 21 / 60, 3);
  });

  it('parses southern/western coords (negates)', () => {
    const r = parseUnlocodeCoords('3352S 01832E');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(-(33 + 52 / 60), 3);
    expect(r!.lon).toBeCloseTo(18 + 32 / 60, 3);
  });

  it('returns null for empty string', () => {
    expect(parseUnlocodeCoords('')).toBeNull();
    expect(parseUnlocodeCoords(undefined)).toBeNull();
  });

  it('returns null for malformed coords', () => {
    expect(parseUnlocodeCoords('invalid')).toBeNull();
    expect(parseUnlocodeCoords('9999Z 00000X')).toBeNull();
  });

  it('parses western longitude', () => {
    const r = parseUnlocodeCoords('4042N 07400W'); // New York area
    expect(r).not.toBeNull();
    expect(r!.lat).toBeGreaterThan(0);
    expect(r!.lon).toBeLessThan(0);
  });
});

describe('parseCsv', () => {
  const CSV_HEADER = 'Change,Country,Location,Name,NameWoDiacritics,Subdivision,Status,Function,Date,IATA,Coordinates,Remarks\n';

  it('parses valid port row with coords and Function=1', () => {
    const csv =
      CSV_HEADER +
      'X,NL,RTM,Rotterdam,Rotterdam,ZH,AA,1234----,0401,,5155N 00421E,\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.unlocode).toBe('NLRTM');
    expect(rows[0]!.name).toBe('Rotterdam');
    expect(rows[0]!.country).toBe('NL');
    expect(rows[0]!.lat).toBeCloseTo(51 + 55 / 60, 2);
    expect(rows[0]!.subdivision).toBe('ZH');
  });

  it('skips rows where Function does not include 1', () => {
    const csv =
      CSV_HEADER +
      'X,DE,FRA,Frankfurt,Frankfurt,,AA,--3-----,0401,,5007N 00841E,\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it('skips rows with no coordinates', () => {
    const csv =
      CSV_HEADER +
      'X,GB,LON,London,London,,AA,1-------,0401,,,\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it('returns empty array for empty CSV (header only)', () => {
    expect(parseCsv(CSV_HEADER)).toHaveLength(0);
  });

  it('throws on missing expected columns', () => {
    expect(() => parseCsv('Col1,Col2\nval1,val2\n')).toThrow(/missing expected columns/i);
  });

  it('builds 5-char UNLOCODE from country + location', () => {
    const csv =
      CSV_HEADER +
      'X,AE,DXB,Dubai,Dubai,,AA,1-------,0401,,2508N 05514E,\n';
    const rows = parseCsv(csv);
    expect(rows[0]!.unlocode).toBe('AEDXB');
  });
});

describe('upsertRows', () => {
  it('calls stmt.run for each row inside a transaction', () => {
    const runMock = jest.fn();
    const transactionFn = jest.fn((fn: (rows: unknown[]) => void) => {
      return (rows: unknown[]) => fn(rows);
    });
    const dbMock = {
      prepare: jest.fn(() => ({ run: runMock })),
      transaction: transactionFn,
    } as unknown as import('better-sqlite3').Database;

    const rows = [
      { unlocode: 'NLRTM', name: 'Rotterdam', country: 'NL', lat: 51.92, lon: 4.48, subdivision: 'ZH' },
      { unlocode: 'AEDXB', name: 'Dubai', country: 'AE', lat: 25.27, lon: 55.30, subdivision: null },
    ];

    const count = upsertRows(dbMock, rows);
    expect(count).toBe(2);
    expect(runMock).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledWith('NLRTM', 'Rotterdam', 'NL', 51.92, 4.48, 'ZH');
  });
});
