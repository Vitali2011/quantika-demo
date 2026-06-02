import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import {
  refreshOilMonster,
  parseOilMonsterHtml,
  OilMonsterParseError,
} from '@/lib/knowledge/bunker/oilmonster-adapter';
import { getLatestBunkerPrice, upsertBunkerPrice } from '@/lib/market/bunker-repository';
import { registerSource } from '@/lib/knowledge/governance';

const FIXTURES_DIR = join(__dirname, '../../../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration023.up(db);
  registerSource(db, {
    slug: 'bunker-oilmonster',
    name: 'OilMonster Bunker Prices',
    kind: 'structured_rows',
    category: 'market',
    refresh_mode: 'auto-daily',
    stale_threshold_days: 1,
  });
  return db;
}

// ---------------------------------------------------------------------------
// parseOilMonsterHtml
// ---------------------------------------------------------------------------

describe('parseOilMonsterHtml', () => {
  it('parses all 5 target ports from fixture', () => {
    const html = loadFixture('oilmonster-prices.html');
    const entries = parseOilMonsterHtml(html);
    const portNames = entries.map(e => e.portName);
    expect(portNames).toContain('Rotterdam');
    expect(portNames).toContain('Singapore');
    expect(portNames).toContain('Fujairah');
    expect(portNames).toContain('Houston');
    expect(portNames).toContain('Gibraltar');
    expect(entries).toHaveLength(5);
  });

  it('does NOT include non-target ports (Auckland, Genoa, Skagen, Jacksonville)', () => {
    const html = loadFixture('oilmonster-prices.html');
    const entries = parseOilMonsterHtml(html);
    const portNames = entries.map(e => e.portName);
    expect(portNames).not.toContain('Auckland');
    expect(portNames).not.toContain('Genoa');
    expect(portNames).not.toContain('Skagen');
    expect(portNames).not.toContain('Jacksonville');
  });

  it('"Duqm  Fujairah" does NOT match Fujairah (AEFJR)', () => {
    const html = loadFixture('oilmonster-prices.html');
    const entries = parseOilMonsterHtml(html);
    const portNames = entries.map(e => e.portName);
    expect(portNames).not.toContain('Duqm  Fujairah');
    // Fujairah itself IS present
    expect(portNames).toContain('Fujairah');
  });

  it('maps correct UNLOCODEs including GIGIB and USHOU', () => {
    const html = loadFixture('oilmonster-prices.html');
    const entries = parseOilMonsterHtml(html);
    const unlocodesMap = Object.fromEntries(entries.map(e => [e.portName, e.unlocode]));
    expect(unlocodesMap['Rotterdam']).toBe('NLRTM');
    expect(unlocodesMap['Singapore']).toBe('SGSIN');
    expect(unlocodesMap['Fujairah']).toBe('AEFJR');
    expect(unlocodesMap['Houston']).toBe('USHOU');
    expect(unlocodesMap['Gibraltar']).toBe('GIGIB');
  });

  it('parses VLSFO values for each target port', () => {
    const html = loadFixture('oilmonster-prices.html');
    const entries = parseOilMonsterHtml(html);
    const find = (name: string) => entries.find(e => e.portName === name);
    expect(find('Rotterdam')?.vlsfo).toBeCloseTo(541.0, 1);
    expect(find('Singapore')?.vlsfo).toBeCloseTo(571.0, 1);
    expect(find('Gibraltar')?.vlsfo).toBeCloseTo(581.0, 1);
    expect(find('Houston')?.vlsfo).toBeCloseTo(621.0, 1);
    expect(find('Fujairah')?.vlsfo).toBeCloseTo(556.0, 1);
  });

  it('parses MGO values for each target port', () => {
    const html = loadFixture('oilmonster-prices.html');
    const entries = parseOilMonsterHtml(html);
    const find = (name: string) => entries.find(e => e.portName === name);
    expect(find('Rotterdam')?.mgo).toBeCloseTo(721.0, 1);
    expect(find('Singapore')?.mgo).toBeCloseTo(751.0, 1);
    expect(find('Gibraltar')?.mgo).toBeCloseTo(761.0, 1);
    expect(find('Houston')?.mgo).toBeCloseTo(801.0, 1);
    expect(find('Fujairah')?.mgo).toBeCloseTo(736.0, 1);
  });

  it('handles "--" cells gracefully — reports undefined for that grade', () => {
    // Inject a port row where VLSFO cell is "--"
    const html = loadFixture('oilmonster-prices.html').replace(
      '<td>541.00</td><td>518.00</td><td>516.00</td></tr>',
      '<td>--</td><td>518.00</td><td>516.00</td></tr>',
    );
    const entries = parseOilMonsterHtml(html);
    const rtm = entries.find(e => e.portName === 'Rotterdam');
    expect(rtm).toBeDefined();
    expect(rtm?.vlsfo).toBeUndefined();
    expect(rtm?.mgo).toBeCloseTo(721.0, 1); // MGO still present
  });

  it('throws OilMonsterParseError on completely broken HTML', () => {
    expect(() => parseOilMonsterHtml('<html><body><p>maintenance</p></body></html>')).toThrow(
      OilMonsterParseError,
    );
  });

  it('returns empty array when no target ports are in an otherwise valid table', () => {
    const html = `
      <table class="restable gradelisttable">
        <thead><tr><th>Location</th><th>HSFO</th><th>IFO 180</th><th>IFO 380</th><th>LSMGO 0.1%</th><th>MGO</th><th>MGO 0.1%</th><th>ULSFO</th><th>ULSFO 0.1%</th><th>VLSFO</th><th>VLSFO 0.5%</th><th>VLSFO max 0.5%</th></tr></thead>
        <tbody>
          <tr><td><a href="/bunker-fuel-prices/x/auckland/1">Auckland</a></td><td>473.00</td><td>--</td><td>--</td><td>--</td><td>745.00</td><td>--</td><td>--</td><td>--</td><td>475.00</td><td>--</td><td>--</td></tr>
        </tbody>
      </table>`;
    const entries = parseOilMonsterHtml(html);
    expect(entries).toHaveLength(0);
  });

  it('handles non-numeric price cells without throwing', () => {
    // Replace Rotterdam VLSFO with "N/A" text
    const html = loadFixture('oilmonster-prices.html').replace(
      '<td>541.00</td><td>518.00</td>',
      '<td>N/A</td><td>518.00</td>',
    );
    const entries = parseOilMonsterHtml(html);
    const rtm = entries.find(e => e.portName === 'Rotterdam');
    // N/A → undefined VLSFO, but MGO still present
    expect(rtm?.vlsfo).toBeUndefined();
    expect(rtm?.mgo).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// refreshOilMonster
// ---------------------------------------------------------------------------

describe('refreshOilMonster', () => {
  let db: Database.Database;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    db = makeDb();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    db.close();
    warnSpy.mockRestore();
  });

  it('upserts VLSFO and MGO for 5 target ports (10 rows)', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('oilmonster-prices.html'));
    const result = await refreshOilMonster(db, fetcher);
    expect(result.rowsChanged).toBe(10); // 5 ports × 2 grades
  });

  it('writes GIGIB (Gibraltar) VLSFO and MGO', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('oilmonster-prices.html'));
    await refreshOilMonster(db, fetcher);
    const vlsfo = getLatestBunkerPrice(db, 'GIGIB', 'VLSFO');
    expect(vlsfo).not.toBeNull();
    expect(vlsfo!.price_usd_per_mt).toBeCloseTo(581.0, 1);
    expect(vlsfo!.source).toBe('oilmonster');
    const mgo = getLatestBunkerPrice(db, 'GIGIB', 'MGO');
    expect(mgo).not.toBeNull();
    expect(mgo!.price_usd_per_mt).toBeCloseTo(761.0, 1);
  });

  it('writes USHOU (Houston) VLSFO and MGO', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('oilmonster-prices.html'));
    await refreshOilMonster(db, fetcher);
    const vlsfo = getLatestBunkerPrice(db, 'USHOU', 'VLSFO');
    expect(vlsfo).not.toBeNull();
    expect(vlsfo!.price_usd_per_mt).toBeCloseTo(621.0, 1);
    const mgo = getLatestBunkerPrice(db, 'USHOU', 'MGO');
    expect(mgo).not.toBeNull();
    expect(mgo!.price_usd_per_mt).toBeCloseTo(801.0, 1);
  });

  it('writes correct source="oilmonster" for all rows', async () => {
    const fetcher = jest.fn().mockResolvedValue(loadFixture('oilmonster-prices.html'));
    await refreshOilMonster(db, fetcher);
    const rows = db.prepare(
      "SELECT * FROM bunker_prices WHERE source='oilmonster'"
    ).all() as any[];
    expect(rows).toHaveLength(10);
  });

  it('VLSFO out-of-range (< 200) → not written, last-good preserved, warn logged', async () => {
    // Seed a valid price first
    upsertBunkerPrice(db, {
      port_unlocode: 'NLRTM',
      fuel_grade: 'VLSFO',
      price_usd_per_mt: 530.0,
      price_date: '2026-05-30',
      source: 'bunkerindex',
      fetched_at: new Date().toISOString(),
    });

    const badHtml = loadFixture('oilmonster-prices.html').replace('541.00</td><td>518.00', '100.00</td><td>518.00');
    const fetcher = jest.fn().mockResolvedValue(badHtml);
    await refreshOilMonster(db, fetcher);

    const row = getLatestBunkerPrice(db, 'NLRTM', 'VLSFO');
    expect(row!.price_usd_per_mt).toBeCloseTo(530.0, 1); // last-good preserved
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
  });

  it('MGO out-of-range (> 2000) → not written, warn logged', async () => {
    const badHtml = loadFixture('oilmonster-prices.html').replace('721.00</td><td>1203.00', '9999.00</td><td>1203.00');
    const fetcher = jest.fn().mockResolvedValue(badHtml);
    const result = await refreshOilMonster(db, fetcher);

    const mgo = db.prepare(
      "SELECT * FROM bunker_prices WHERE port_unlocode='NLRTM' AND fuel_grade='MGO' AND source='oilmonster'"
    ).get();
    expect(mgo).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out of range'));
    // Other ports still processed
    expect(result.rowsChanged).toBeGreaterThan(0);
  });

  it('returns rowsChanged=0 on broken HTML (graceful, no throw)', async () => {
    const fetcher = jest.fn().mockResolvedValue('<html><body>maintenance</body></html>');
    const result = await refreshOilMonster(db, fetcher);
    expect(result.rowsChanged).toBe(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns rowsChanged=0 when no target ports found in valid HTML', async () => {
    const html = `
      <table class="restable gradelisttable">
        <thead><tr><th>Location</th><th>HSFO</th><th>IFO 180</th><th>IFO 380</th><th>LSMGO 0.1%</th><th>MGO</th><th>MGO 0.1%</th><th>ULSFO</th><th>ULSFO 0.1%</th><th>VLSFO</th><th>VLSFO 0.5%</th><th>VLSFO max 0.5%</th></tr></thead>
        <tbody>
          <tr><td><a href="/1">Auckland</a></td><td>473.00</td><td>--</td><td>--</td><td>--</td><td>745.00</td><td>--</td><td>--</td><td>--</td><td>475.00</td><td>--</td><td>--</td></tr>
        </tbody>
      </table>`;
    const fetcher = jest.fn().mockResolvedValue(html);
    const result = await refreshOilMonster(db, fetcher);
    expect(result.rowsChanged).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No target port rows'));
  });

  it('propagates network errors (fetch throws)', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(refreshOilMonster(db, fetcher)).rejects.toThrow('ECONNREFUSED');
  });
});
