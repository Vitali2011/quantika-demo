/**
 * Tests for Equasis IMO lookup — stub-backed for the MVP.
 *
 * The stub returns canned responses for a small set of real IMOs + one
 * deliberately unknown IMO. Cache is stored in an SQLite DB with TTL so
 * the real-HTTP client (phase 2) can replace the fetch layer without
 * changing consumers.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  lookupVesselByImo,
  compareVesselRecord,
  EquasisCache,
  __resetStubForTests,
} from '../equasis-client';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'equasis-cache-test-'));
  dbPath = path.join(tmpDir, 'equasis.db');
  __resetStubForTests();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('lookupVesselByImo (stub)', () => {
  it('returns canned record for Queen Mary 2 (IMO 9241061)', async () => {
    const rec = await lookupVesselByImo('9241061', { dbPath });
    expect(rec).not.toBeNull();
    expect(rec!.vesselName).toMatch(/queen mary/i);
    expect(rec!.flag).toBe('GB');
    expect(rec!.type).toMatch(/passenger/i);
  });

  it('returns canned record for Ever Given (IMO 9811000)', async () => {
    const rec = await lookupVesselByImo('9811000', { dbPath });
    expect(rec).not.toBeNull();
    expect(rec!.vesselName).toMatch(/ever given/i);
    expect(rec!.flag).toBe('PA');
  });

  it('returns canned record for sample-data vessel MV ALERIA-1', async () => {
    // Sample-10 vessel — IMO we assigned for the demo (valid checksum)
    const rec = await lookupVesselByImo('9540003', { dbPath });
    expect(rec).not.toBeNull();
    expect(rec!.vesselName).toMatch(/aleria/i);
    expect(rec!.flag).toBe('TR');
  });

  it('returns null for unknown IMO (not in stub)', async () => {
    // Valid checksum, but not a vessel the stub knows about
    const rec = await lookupVesselByImo('9990002', { dbPath });
    expect(rec).toBeNull();
  });

  it('returns null for invalid-format IMO (graceful degradation)', async () => {
    const rec = await lookupVesselByImo('abc', { dbPath });
    expect(rec).toBeNull();
  });

  it('caches result so second call does not hit stub again', async () => {
    const spy = jest.fn();
    const rec1 = await lookupVesselByImo('9241061', { dbPath, onStubCall: spy });
    const rec2 = await lookupVesselByImo('9241061', { dbPath, onStubCall: spy });
    expect(rec1).toEqual(rec2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches null results too (negative cache) so unknown IMOs do not retry', async () => {
    const spy = jest.fn();
    await lookupVesselByImo('9990002', { dbPath, onStubCall: spy });
    await lookupVesselByImo('9990002', { dbPath, onStubCall: spy });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('survives simulated rate-limit by returning null gracefully', async () => {
    const rec = await lookupVesselByImo('9241061', {
      dbPath,
      forceError: 'rate_limit',
    });
    expect(rec).toBeNull();
  });
});

describe('compareVesselRecord', () => {
  it('returns no warning when Equasis match is close', () => {
    const result = compareVesselRecord(
      { vesselName: 'Ever Given', flag: 'PA', type: 'Container', dwt: 199489, built: 2018 },
      { parsedName: 'MV EVER GIVEN', parsedDwt: 200000 },
    );
    expect(result).toBeNull();
  });

  it('flags strong name mismatch', () => {
    const result = compareVesselRecord(
      { vesselName: 'Queen Mary 2', flag: 'GB', type: 'Passenger', dwt: 76000, built: 2003 },
      { parsedName: 'MV ALERIA-1', parsedDwt: 5200 },
    );
    expect(result).toMatch(/name mismatch/i);
    expect(result).toMatch(/queen mary/i);
  });

  it('flags DWT mismatch > 10%', () => {
    const result = compareVesselRecord(
      { vesselName: 'MV Aleria-1', flag: 'TR', type: 'General Cargo', dwt: 5200, built: 2011 },
      { parsedName: 'MV ALERIA-1', parsedDwt: 10000 },
    );
    expect(result).toMatch(/dwt/i);
  });

  it('tolerates DWT within 10%', () => {
    const result = compareVesselRecord(
      { vesselName: 'MV Aleria-1', flag: 'TR', type: 'General Cargo', dwt: 5200, built: 2011 },
      { parsedName: 'MV ALERIA-1', parsedDwt: 5400 },
    );
    expect(result).toBeNull();
  });

  it('returns null when parsedName missing (nothing to compare)', () => {
    const result = compareVesselRecord(
      { vesselName: 'Queen Mary 2', flag: 'GB', type: 'Passenger', dwt: 76000, built: 2003 },
      { parsedName: null, parsedDwt: null },
    );
    expect(result).toBeNull();
  });
});

describe('EquasisCache (SQLite)', () => {
  it('stores and retrieves a record', () => {
    const cache = new EquasisCache(dbPath);
    cache.set('9241061', { vesselName: 'Queen Mary 2', flag: 'GB', type: 'Passenger', dwt: 76000, built: 2003 });
    const rec = cache.get('9241061');
    expect(rec).not.toBeNull();
    expect(rec!.value?.vesselName).toBe('Queen Mary 2');
  });

  it('stores null records (negative cache)', () => {
    const cache = new EquasisCache(dbPath);
    cache.set('9990002', null);
    const hit = cache.get('9990002');
    expect(hit).not.toBeNull();
    expect(hit!.value).toBeNull();
  });

  it('respects TTL', () => {
    const cache = new EquasisCache(dbPath, 10); // 10ms TTL
    cache.set('9241061', { vesselName: 'X', flag: 'XX', type: 'X', dwt: 0, built: 0 });
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const hit = cache.get('9241061');
        expect(hit).toBeNull();
        resolve();
      }, 25);
    });
  });

  it('returns null for missing key', () => {
    const cache = new EquasisCache(dbPath);
    expect(cache.get('9999999')).toBeNull();
  });
});
