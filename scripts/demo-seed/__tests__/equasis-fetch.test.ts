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
import {
  parseShipInfo,
  detectAuthFailure,
  extractGridField,
  extractAnchoredEntity,
} from '../equasis-fetch';

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

describe('parseShipInfo — REAL Equasis div-grid markup (live-verified 2026-06-17)', () => {
  // Faithful slice of the live authenticated ShipInfo page (Bootstrap div-grid,
  // NOT <td> tables). Structure copied verbatim from /tmp/equasis-raw/9701360.html
  // (MV GLORY TOM) — flag image + parenthesised country text, year grid row,
  // Classification collapse block, P&I Information collapse block.
  const realHtml = `
    <div class="row">
      <div class="col-lg-4 col-md-4 col-sm-6 col-xs-6"> <b>Flag </b> </div>
      <div class="col-lg-4 col-md-4 col-sm-6 col-xs-6"> &nbsp;<img class="img-responsive pull-left" src="../Static/img/flags/PAN.png" style="height: 25px;" data-toggle="tooltip" data-placement="top"> </div>
      <div class="col-sm-6 col-xs-6 hidden-lg hidden-md"></div>
      <div class="col-lg-4 col-md-4 col-sm-6 col-xs-6"> (Panama) </div>
    </div>
    <div class="row">
      <div class="col-lg-4 col-md-4 col-sm-6 col-xs-6"> <b>Year of build </b> </div>
      <div class="col-lg-4 col-md-4 col-sm-6 col-xs-6"> 2015 </div>
    </div>
    <!-- Classification -->
    <div class="collapse" id="collapse4">
      <div class="access-body"> <h5>Status </h5> </div>
      <div class="col-lg-3"> <div class="pull-left"> <div class="round-list orange-equasis"></div> </div> <p>Nippon Kaiji Kyokai (IACS)</p> </div>
      <div class="col-lg-3"> <div class="pull-left"> <div class="round-list orange-equasis"></div> </div> <p>Lloyd's Register (IACS)</p> </div>
    </div>
    <h3>P&I Information</h3>
    <div class="collapse" id="collapse6">
      <div class="access-body"> <div class="pull-left"> <div class="round-list orange-equasis"></div> </div> <p>UK P&I Club</p> </div>
    </div>`;

  it('extracts flag/year/class/P&I from the real div-grid layout', () => {
    const r = parseShipInfo(realHtml, '9701360');
    expect(r.flag).toBe('Panama');
    expect(r.yearBuilt).toBe(2015);
    expect(r.classSociety).toBe('Nippon Kaiji Kyokai (IACS)'); // first listed = current
    expect(r.pandi).toBe('UK P&I Club');
    expect(r.source).toBe('equasis');
  });

  it('preserves a register suffix in the flag (Portugal (MAR))', () => {
    const html = `<b>Flag </b> </div>
      <div class="col"> <img src="../Static/img/flags/PMD.png"> </div>
      <div class="col hidden-lg hidden-md"></div>
      <div class="col"> (Portugal (MAR)) </div>`;
    expect(parseShipInfo(html, '9238351').flag).toBe('Portugal (MAR)');
  });

  it('maps "(Not Known)" flag to null (real IMO 8605480 case)', () => {
    const html = `<b>Flag </b> </div>
      <div class="col"> </div>
      <div class="col hidden-lg hidden-md"></div>
      <div class="col"> (Not Known) </div>`;
    expect(parseShipInfo(html, '8605480').flag).toBeNull();
  });

  it('returns null P&I when the section is absent (real IMO 8216100 case)', () => {
    const html = `<b>Flag </b> </div> <div class="col"> <img src="../Static/img/flags/COM.png"> </div>
      <div class="col hidden-lg hidden-md"></div> <div class="col"> (Comoros) </div>
      <!-- Classification -->
      <div id="collapse4"> <div class="round-list orange-equasis"></div> </div> <p>Hellas Naval Bureau</p> </div>`;
    const r = parseShipInfo(html, '8216100');
    expect(r.flag).toBe('Comoros');
    expect(r.classSociety).toBe('Hellas Naval Bureau');
    expect(r.pandi).toBeNull();
  });

  it('extractGridField returns null for a missing label', () => {
    expect(extractGridField('<b>Flag </b></div><div>x</div>', 'Gross\\s+tonnage')).toBeNull();
  });

  it('extractAnchoredEntity returns null when the anchor is absent', () => {
    expect(extractAnchoredEntity('<div>no class block here</div>', '<!-- Classification -->')).toBeNull();
  });
});

describe('extractAnchoredEntity — withdrawn-vs-active classification society', () => {
  // Faithful slice of the real Equasis Classification collapse block: each entry
  // is `round-list…<p>NAME</p>` followed by a status badge
  // `<span class="badge STATUS …">STATUS</span>`. A formerly-assigned society is
  // listed FIRST but carries a `Withdrawn` badge; the active society carries
  // `Delivered`. Structure copied verbatim from /tmp/equasis-raw/9145786.html
  // (MV ALTO) — IMB Withdrawn, Turk Loydu active.
  const classBlock = (entries: Array<{ name: string; status: string }>): string => {
    const rows = entries
      .map(
        (e) => `
          <div class="row"><div class="access-body">
            <div class="col-lg-3"> <div class="pull-left"> <div class="round-list orange-equasis"></div> </div> <p>${e.name}</p> </div>
            <div class="col-lg-2"> <p> <span class="badge ${e.status} font-size-md">${e.status}</span> </p> </div>
            <div class="col-lg-3"> <p>during 05/2024</p> </div>
          </div></div>`,
      )
      .join('');
    return `<!-- Classification --> <div id="collapse4"> <h5>Status </h5> ${rows} </div>`;
  };

  it('skips a Withdrawn society and returns the first active one (real 9145786 case)', () => {
    const html = classBlock([
      { name: 'International Maritime Bureau', status: 'Withdrawn' },
      { name: 'Turk Loydu (IACS)', status: 'Delivered' },
      { name: 'International Register of Shipping (IS)', status: 'Withdrawn' },
      { name: 'Nippon Kaiji Kyokai (IACS)', status: 'Withdrawn' },
    ]);
    expect(extractAnchoredEntity(html, '<!-- Classification -->')).toBe('Turk Loydu (IACS)');
  });

  it('returns the first Delivered when an earlier entry is Withdrawn (real 9381407 case)', () => {
    const html = classBlock([
      { name: 'International Register of Shipping (IS)', status: 'Withdrawn' },
      { name: 'Capital Register of Shipping', status: 'Delivered' },
      { name: 'DNV-GL (ex GL) (IACS)', status: 'Delivered' },
    ]);
    expect(extractAnchoredEntity(html, '<!-- Classification -->')).toBe('Capital Register of Shipping');
  });

  it('falls back to the first entry when every society is Withdrawn', () => {
    const html = classBlock([
      { name: 'Old Society A', status: 'Withdrawn' },
      { name: 'Old Society B', status: 'Withdrawn' },
    ]);
    expect(extractAnchoredEntity(html, '<!-- Classification -->')).toBe('Old Society A');
  });

  it('returns the sole society when there is exactly one Delivered entry', () => {
    const html = classBlock([{ name: 'Turk Loydu (IACS)', status: 'Delivered' }]);
    expect(extractAnchoredEntity(html, '<!-- Classification -->')).toBe('Turk Loydu (IACS)');
  });

  it('still returns the first entry for badge-less sections (P&I has no status badge)', () => {
    // P&I Information entries have no status badge — must keep returning the first.
    const html =
      'P&I Information <div id="collapse6"> <div class="pull-left"> <div class="round-list orange-equasis"></div> </div> <p>American Steamship Owner P&I association</p> </div>';
    expect(extractAnchoredEntity(html, 'P&I Information')).toBe('American Steamship Owner P&I association');
  });
});
