/**
 * Tests for equasis-fetch.ts pure helpers.
 *
 * Pure functions only — no Playwright, no network, no DB. The Playwright
 * runner (`main`) lazy-imports the browser and is NOT exercised here.
 *
 * NOTE: `detectAuthFailure` is verified against the REAL bad-credentials modal
 * text captured from a live headless login attempt on 2026-06-17
 * ("Your login (e-mail) or/and password are unknown in Equasis").
 * The `parseShipInfo` selectors model the documented Equasis ShipInfo table
 * layout but are UNVERIFIED against an authenticated live page (auth blocked) —
 * these tests pin the extraction LOGIC (missing → null, entity decode, year
 * coercion, label disambiguation), not real-page fidelity.
 */
import { parseShipInfo, detectAuthFailure } from '../equasis-fetch';

describe('detectAuthFailure', () => {
  it('detects the real Equasis bad-credentials modal text', () => {
    // verbatim slice from a live 2026-06-17 headless attempt
    const html =
      '<div>Your login (e-mail) or/and password are unknown in Equasis. Please, try again</div>';
    expect(detectAuthFailure(html)).toBe(true);
  });

  it('detects an expired session', () => {
    expect(detectAuthFailure('<p>Your session has expired, please login again</p>')).toBe(true);
    expect(detectAuthFailure('<p>Please Login to continue</p>')).toBe(true);
  });

  it('returns false for an authenticated ShipInfo page', () => {
    const html = '<table><tr><td>Flag</td><td>Panama</td></tr></table><a>Logout</a>';
    expect(detectAuthFailure(html)).toBe(false);
  });
});

describe('parseShipInfo', () => {
  // Synthetic HTML modelled on the documented Equasis ShipInfo <td>label</td><td>value</td> layout.
  const shipHtml = `
    <table class="tab-detail">
      <tr><td class="tdlabel">Flag</td><td class="tdvalue">Panama</td></tr>
      <tr><td>Call sign</td><td>3FAB7</td></tr>
      <tr><td>Year of build</td><td>2015</td></tr>
      <tr><td>Gross tonnage</td><td>23,500</td></tr>
      <tr><td>Classification society</td><td>Nippon Kaiji Kyokai</td></tr>
      <tr><td>P&amp;I Club</td><td>The Standard Club Ltd</td></tr>
    </table>`;

  it('extracts flag, year, class society and P&I', () => {
    const r = parseShipInfo(shipHtml, '9701360');
    expect(r.imo).toBe('9701360');
    expect(r.flag).toBe('Panama');
    expect(r.yearBuilt).toBe(2015);
    expect(r.classSociety).toBe('Nippon Kaiji Kyokai');
    expect(r.pandi).toBe('The Standard Club Ltd');
    expect(r.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null for every missing field (robust to sparse pages)', () => {
    const r = parseShipInfo('<table><tr><td>Flag</td><td>Liberia</td></tr></table>', '1234567');
    expect(r.flag).toBe('Liberia');
    expect(r.yearBuilt).toBeNull();
    expect(r.classSociety).toBeNull();
    expect(r.pandi).toBeNull();
  });

  it('coerces a non-numeric year to null rather than NaN', () => {
    const html = '<tr><td>Year of build</td><td>n/a</td></tr>';
    expect(parseShipInfo(html, '1').yearBuilt).toBeNull();
  });

  it('decodes &amp; entities in values', () => {
    const html = '<tr><td>P&amp;I Club</td><td>Britannia Steam Ship Insurance &amp; Co</td></tr>';
    expect(parseShipInfo(html, '1').pandi).toBe('Britannia Steam Ship Insurance & Co');
  });

  it('does not crash and returns all-null on empty html', () => {
    const r = parseShipInfo('', '9999999');
    expect(r).toEqual(
      expect.objectContaining({ imo: '9999999', flag: null, yearBuilt: null, classSociety: null, pandi: null }),
    );
  });
});
