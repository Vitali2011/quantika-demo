/**
 * Adversarial regression tests for OilMonster per-port adapter.
 * Focus: bugs and fragilities identified by cold-start QA review (2026-06-02).
 *
 * Test categories:
 *   B1 — Per-port prices bypass range validation
 *   B2 — ROCND proxy bypasses range validation
 *   B3 — Parser requires <i> arrow icon (fragile HTML dependency)
 *   B4 — Price decimal format exactly 2 digits required
 *   B5 — Staleness boundary arithmetic
 *   B6 — Comma-formatted prices in per-port pages
 *   B7 — Multiple scrapitemprice divs: first wins
 *   B8 — $US/MT appearing before scrapitemprice div
 */

import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import {
  parseOilMonsterPortHtml,
  refreshOilMonster,
  OilMonsterStructureChangedError,
  OilMonsterParseError,
} from '@/lib/knowledge/bunker/oilmonster-adapter';
import { getLatestBunkerPrice } from '@/lib/market/bunker-repository';
import { registerSource } from '@/lib/knowledge/governance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Builds a minimal per-port HTML fixture with configurable price and date. */
function makePortHtml(price: string, date: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Istanbul VLSFO Price</title></head>
<body>
<div class="contentbox">
<h1 class="scrapitemname">Istanbul VLSFO Price
<span>Price Date : <span class="cblue">${date}</span></span></h1>
<div class="scrapitemprice">
<i class="bi bi-arrow-down scraparrow scraparrowdown" aria-hidden="true"></i>${price}<span>$US/MT</span></div>
</div>
</body>
</html>`;
}

/** Per-port fetcher that returns Istanbul HTML and fails on Piraeus. */
function istanbulOnlyFetcher(html: string) {
  return jest.fn((url: string) => {
    if (url.includes('istanbul')) return Promise.resolve(html);
    if (url.includes('piraeus')) return Promise.reject(new Error('piraeus down'));
    // Main table: no price tables → OilMonsterParseError → entries = []
    return Promise.resolve('<html><body><p>no price tables here</p></body></html>');
  });
}

const NOW_DEMO = new Date('2026-06-02T00:00:00.000Z');

// ---------------------------------------------------------------------------
// B1: Per-port prices bypass range validation
// ---------------------------------------------------------------------------

describe('B1 — per-port prices bypass range validation [BUG]', () => {
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

  it('DEMONSTRATES BUG: per-port Istanbul price 99999.00 is inserted without range check', async () => {
    // The main table has RANGE_VLSFO = [200, 2000] and rejects prices outside this range.
    // Per-port upserts have NO range validation — a clearly wrong price is blindly inserted.
    const outrageousHtml = makePortHtml('99999.00', '2026-05-25');
    const fetcher = istanbulOnlyFetcher(outrageousHtml);

    // This should ideally reject the price (range check). Currently it inserts 99999.00.
    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const row = getLatestBunkerPrice(db, 'TRIST', 'VLSFO');
    // CURRENT BEHAVIOR (BUG): price is inserted without range validation
    // EXPECTED BEHAVIOR: should warn and skip (like main table does for out-of-range)
    expect(row).not.toBeNull();
    expect(row!.price_usd_per_mt).toBe(99999.00); // Bug: this extreme value is accepted
  });

  it('DEMONSTRATES BUG: per-port Istanbul price 1.00 (below 200 floor) is inserted', async () => {
    // Main table would reject 1.00 (< 200). Per-port does not.
    const lowPriceHtml = makePortHtml('1.00', '2026-05-25');
    const fetcher = istanbulOnlyFetcher(lowPriceHtml);

    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const row = getLatestBunkerPrice(db, 'TRIST', 'VLSFO');
    expect(row).not.toBeNull();
    expect(row!.price_usd_per_mt).toBe(1.00); // Bug: too-low price accepted
  });
});

// ---------------------------------------------------------------------------
// B2: ROCND proxy also bypasses range validation
// ---------------------------------------------------------------------------

describe('B2 — ROCND proxy bypasses range validation [BUG]', () => {
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

  it('DEMONSTRATES BUG: ROCND proxy = Istanbul(99999) + 40 is inserted without range check', async () => {
    const outrageousHtml = makePortHtml('99999.00', '2026-05-25');
    const fetcher = istanbulOnlyFetcher(outrageousHtml);

    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const rocndRow = getLatestBunkerPrice(db, 'ROCND', 'VLSFO');
    expect(rocndRow).not.toBeNull();
    // Bug: ROCND proxy = 99999 + 40 = 100039 — obviously wrong, no range check
    expect(rocndRow!.price_usd_per_mt).toBe(100039.00);
    expect(rocndRow!.source).toBe('oilmonster-proxy');
  });

  it('ROCND proxy arithmetic: Istanbul=947.00 → ROCND=987.00 (exact, no float drift)', async () => {
    // This is the happy-path arithmetic test — verifies the Math.round is correct
    const html = makePortHtml('947.00', '2026-05-25');
    const fetcher = istanbulOnlyFetcher(html);

    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const rocndRow = getLatestBunkerPrice(db, 'ROCND', 'VLSFO');
    expect(rocndRow).not.toBeNull();
    expect(rocndRow!.price_usd_per_mt).toBe(987.00); // Must be exactly 987.00, not 987.0000001
    expect(rocndRow!.source).toBe('oilmonster-proxy');
    expect(rocndRow!.price_date).toBe('2026-05-25');
  });
});

// ---------------------------------------------------------------------------
// B3: Parser requires <i> arrow icon (fragile HTML dependency)
// ---------------------------------------------------------------------------

describe('B3 — parser fragility: requires <i> arrow icon before price', () => {
  it('parses price when <i> arrow icon is present (current format)', () => {
    // The current format used by OilMonster — arrow icon before price number
    const html = `<div class="scrapitemprice">
<i class="bi bi-arrow-down scraparrow scraparrowdown" aria-hidden="true"></i>947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>`;
    const result = parseOilMonsterPortHtml(html);
    expect(result.vlsfo).toBe(947.00);
  });

  it('DEMONSTRATES FRAGILITY: throws StructureChangedError when arrow icon is absent', () => {
    // If OilMonster removes the <i> arrow icon, the price would be on a new line
    // after the div opening tag. The regex [\s\S]*?>(price)<span> requires a '>'
    // immediately before the price digits. Without <i></i>, there's a newline.
    const htmlWithoutArrow = `<div class="scrapitemprice">
947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>`;

    // This documents that removing the arrow icon BREAKS the parser silently
    expect(() => parseOilMonsterPortHtml(htmlWithoutArrow)).toThrow(OilMonsterStructureChangedError);
  });

  it('parses correctly when arrow icon on same line (no newline)', () => {
    // Arrow icon on same line as price - should work
    const html = `<div class="scrapitemprice"><i class="bi bi-arrow-down"></i>947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>`;
    const result = parseOilMonsterPortHtml(html);
    expect(result.vlsfo).toBe(947.00);
  });
});

// ---------------------------------------------------------------------------
// B4: Price must have EXACTLY 2 decimal places
// ---------------------------------------------------------------------------

describe('B4 — price decimal format: exactly 2 decimal places required', () => {
  it('parses price with 2 decimal places (947.00)', () => {
    const result = parseOilMonsterPortHtml(makePortHtml('947.00', '2026-05-25'));
    expect(result.vlsfo).toBe(947.00);
  });

  it('parses price with 2 decimal places and comma thousands (1,007.00)', () => {
    // Istanbul historical high was 1007.00 — comma separator for thousands
    const result = parseOilMonsterPortHtml(makePortHtml('1,007.00', '2026-05-25'));
    expect(result.vlsfo).toBe(1007.00);
  });

  it('throws StructureChangedError for price with 1 decimal (947.5)', () => {
    // The regex requires [\d,]+\.\d{2} — exactly 2 decimal digits
    // If OilMonster ever returns 1-decimal prices, the parser would fail
    expect(() => parseOilMonsterPortHtml(makePortHtml('947.5', '2026-05-25')))
      .toThrow(OilMonsterStructureChangedError);
  });

  it('throws StructureChangedError for price with no decimal (947)', () => {
    // Integer prices don't match [\d,]+\.\d{2}
    expect(() => parseOilMonsterPortHtml(makePortHtml('947', '2026-05-25')))
      .toThrow(OilMonsterStructureChangedError);
  });

  it('throws StructureChangedError for price with 3 decimal places (947.000)', () => {
    // 3 decimals don't match \.\d{2} (which requires exactly 2)
    expect(() => parseOilMonsterPortHtml(makePortHtml('947.000', '2026-05-25')))
      .toThrow(OilMonsterStructureChangedError);
  });
});

// ---------------------------------------------------------------------------
// B5: Staleness boundary arithmetic
// ---------------------------------------------------------------------------

describe('B5 — staleness boundary arithmetic', () => {
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

  it('price exactly 30 days old is NOT stale (ageDays = 30, 30 > 30 is false)', async () => {
    // 2026-06-02 minus 30 days = 2026-05-03
    const html = makePortHtml('947.00', '2026-05-03');
    const fetcher = istanbulOnlyFetcher(html);

    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const row = getLatestBunkerPrice(db, 'TRIST', 'VLSFO');
    expect(row).not.toBeNull(); // NOT stale, should be inserted
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('stale'));
  });

  it('price exactly 31 days old IS stale (ageDays = 31, 31 > 30 is true)', async () => {
    // 2026-06-02 minus 31 days = 2026-05-02
    const html = makePortHtml('947.00', '2026-05-02');
    const fetcher = istanbulOnlyFetcher(html);

    // Piraeus still succeeds to avoid zero-rows throw
    const fetcherWithPiraeus = jest.fn((url: string) => {
      if (url.includes('istanbul')) return Promise.resolve(html);
      if (url.includes('piraeus')) {
        return Promise.resolve(makePortHtml('889.25', '2026-05-26')
          .replace('Istanbul VLSFO Price', 'Piraeus VLSFO Price'));
      }
      return Promise.resolve('<html><body><p>no price tables</p></body></html>');
    });

    await refreshOilMonster(db, fetcherWithPiraeus, { now: NOW_DEMO });

    const row = getLatestBunkerPrice(db, 'TRIST', 'VLSFO');
    expect(row).toBeNull(); // stale, should NOT be inserted
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stale'));
  });

  it('price exactly 30 days old: ROCND proxy IS derived (Istanbul not stale)', async () => {
    const html = makePortHtml('947.00', '2026-05-03');
    const fetcher = istanbulOnlyFetcher(html);

    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const rocndRow = getLatestBunkerPrice(db, 'ROCND', 'VLSFO');
    expect(rocndRow).not.toBeNull(); // Istanbul not stale → ROCND proxy derived
    expect(rocndRow!.price_usd_per_mt).toBe(987.00);
  });

  it('price exactly 31 days old: ROCND proxy NOT derived (Istanbul stale)', async () => {
    const html = makePortHtml('947.00', '2026-05-02');
    // Istanbul stale, Piraeus succeeds (to prevent zero-rows throw)
    const piraeusHtml = makePortHtml('889.25', '2026-05-26');
    const fetcher = jest.fn((url: string) => {
      if (url.includes('istanbul')) return Promise.resolve(html);
      if (url.includes('piraeus')) return Promise.resolve(piraeusHtml);
      return Promise.resolve('<html><body><p>no price tables</p></body></html>');
    });

    await refreshOilMonster(db, fetcher, { now: NOW_DEMO });

    const rocndRow = getLatestBunkerPrice(db, 'ROCND', 'VLSFO');
    expect(rocndRow).toBeNull(); // Istanbul stale → ROCND proxy not derived
  });
});

// ---------------------------------------------------------------------------
// B6: Comma-formatted prices in per-port pages
// ---------------------------------------------------------------------------

describe('B6 — comma-formatted price in per-port pages', () => {
  it('parses 1,007.00 correctly (strips comma before parseFloat)', () => {
    const result = parseOilMonsterPortHtml(makePortHtml('1,007.00', '2026-05-25'));
    expect(result.vlsfo).toBe(1007.00); // Must strip comma: '1,007.00' → 1007.00
    expect(result.vlsfo).not.toBe(1); // Naive parseFloat('1,007.00') = 1 (BUG to guard against)
  });

  it('parses 2,345.50 correctly', () => {
    const result = parseOilMonsterPortHtml(makePortHtml('2,345.50', '2026-05-25'));
    expect(result.vlsfo).toBe(2345.50);
  });
});

// ---------------------------------------------------------------------------
// B7: Multiple scrapitemprice divs — first wins
// ---------------------------------------------------------------------------

describe('B7 — multiple scrapitemprice divs', () => {
  it('DOCUMENTS BEHAVIOR: when two scrapitemprice divs exist, the FIRST one wins', () => {
    // The regex /class="scrapitemprice"[\s\S]*?>.../ with exec() finds the FIRST match.
    // If a page has two scrapitemprice divs (e.g., mobile + desktop renders),
    // the first one's value is used regardless of which is "current".
    const html = `<div class="scrapitemprice">
<i class="bi bi-arrow-down"></i>1007.00<span>$US/MT</span></div>
<div class="scrapitemprice">
<i class="bi bi-arrow-down"></i>947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>`;

    // Documents current behavior: first div (1007.00) wins
    const result = parseOilMonsterPortHtml(html);
    expect(result.vlsfo).toBe(1007.00); // First div wins — this is CURRENT behavior
    // NOTE: If the first div is the OLDER price and second div is CURRENT price,
    // this would return the wrong value. Fixture verification shows real page has
    // only ONE scrapitemprice div, so this is currently safe.
  });
});

// ---------------------------------------------------------------------------
// B8: $US/MT appears before scrapitemprice div
// ---------------------------------------------------------------------------

describe('B8 — $US/MT before scrapitemprice', () => {
  it('still works when $US/MT label appears before scrapitemprice div (in page header)', () => {
    // The structure guard checks html.includes('$US/MT') but doesn't require ordering.
    // The price regex anchors on class="scrapitemprice" so order of $US/MT vs div doesn't matter
    // for structure guard, but DOES matter if the $US/MT occurs within the scrapitemprice context.
    const html = `<p>All prices quoted in <strong>$US/MT</strong></p>
<div class="scrapitemprice">
<i class="bi bi-arrow-down"></i>947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>`;

    const result = parseOilMonsterPortHtml(html);
    expect(result.vlsfo).toBe(947.00); // Should still parse correctly
  });

  it('throws StructureChangedError when scrapitemprice div lacks $US/MT span', () => {
    // Structure guard passes (html has $US/MT somewhere), but price regex fails.
    const html = `<div class="scrapitemprice">
<i class="bi bi-arrow-down"></i>947.00<span>EUR/MT</span></div>
<p>Note: $US/MT is the standard unit</p>
<span>Price Date : <span class="cblue">2026-05-25</span></span>`;

    // The $US/MT is present in the page but NOT as span after the price
    // The price regex requires: price<span>$US/MT — without it, no match → StructureChangedError
    expect(() => parseOilMonsterPortHtml(html)).toThrow(OilMonsterStructureChangedError);
  });
});

// ---------------------------------------------------------------------------
// B9: History table trap — parser must not pick up history spprice values
// ---------------------------------------------------------------------------

describe('B9 — history table trap: spprice values must NOT be parsed', () => {
  it('returns current 947.00 even when history table has higher 1007.00', () => {
    // The Istanbul fixture contains a history table with 1007.00 (month high).
    // The parser must anchor on scrapitemprice class and ignore spprice cells.
    const html = `<div class="scrapitemprice">
<i class="bi bi-arrow-down scraparrow scraparrowdown"></i>947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>
<table>
  <thead><tr><th>Week High</th><th>Month High</th></tr></thead>
  <tbody><tr>
    <td class="spprice scraparrowup">947.00</td>
    <td class="spprice scraparrowup">1007.00</td>
  </tr></tbody>
</table>`;

    const result = parseOilMonsterPortHtml(html);
    expect(result.vlsfo).toBe(947.00); // Current price, NOT history
    expect(result.vlsfo).not.toBe(1007.00);
  });

  it('returns correct price when history table has $US/MT column headers', () => {
    // The full Istanbul fixture has a history table with $US/MT in every row.
    // These must not interfere with the scrapitemprice regex.
    const html = `<div class="scrapitemprice">
<i class="bi bi-arrow-down scraparrow scraparrowdown"></i>947.00<span>$US/MT</span></div>
<span>Price Date : <span class="cblue">2026-05-25</span></span>
<table class="chartbox">
  <thead><tr><th>Price Date</th><th>Price</th><th>Unit</th></tr></thead>
  <tbody>
    <tr><td>25 May 2026</td><td>947.00</td><td>$US/MT</td></tr>
    <tr><td>05 May 2026</td><td>1007.00</td><td>$US/MT</td></tr>
  </tbody>
</table>`;

    const result = parseOilMonsterPortHtml(html);
    expect(result.vlsfo).toBe(947.00);
    expect(result.priceDate).toBe('2026-05-25');
  });
});
