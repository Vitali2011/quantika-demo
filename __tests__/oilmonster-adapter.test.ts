import Database from 'better-sqlite3';
import migration013 from '@/lib/migrations/013-knowledge-sources';
import migration023 from '@/lib/migrations/023-bunker-prices-rewrite';
import {
  parseOilMonsterHtml,
  refreshOilMonster,
  OilMonsterParseError,
} from '@/lib/knowledge/bunker/oilmonster-adapter';

// ── helpers ─────────────────────────────────────────────────────────────────

function makeHtml(
  rows: string[],
  headers = '<th>Port</th><th>VLSFO</th><th>MGO</th>',
): string {
  return (
    `<table class="restable">` +
    `<thead><tr>${headers}</tr></thead>` +
    `<tbody>${rows.join('')}</tbody>` +
    `</table>`
  );
}

function makeRow(port: string, vlsfo: string, mgo: string): string {
  return `<tr><td><a href="/p">${port}</a></td><td>${vlsfo}</td><td>${mgo}</td></tr>`;
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migration013.up(db);
  migration023.up(db);
  return db;
}

// ── parseOilMonsterHtml — structure guards ───────────────────────────────────

describe('parseOilMonsterHtml — structure guards', () => {
  it('throws OilMonsterParseError when no price table markers', () => {
    expect(() => parseOilMonsterHtml('<html><body>no table here</body></html>')).toThrow(
      OilMonsterParseError,
    );
  });

  it('accepts HTML with gradelisttable marker (alternate structure)', () => {
    const html =
      `<table class="gradelisttable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody>${makeRow('Rotterdam', '600', '700')}</tbody>` +
      `</table>`;
    expect(() => parseOilMonsterHtml(html)).not.toThrow();
  });

  it('throws OilMonsterParseError when restable present but no thead', () => {
    expect(() =>
      parseOilMonsterHtml(
        '<table class="restable"><tbody><tr><td>x</td></tr></tbody></table>',
      ),
    ).toThrow(OilMonsterParseError);
  });

  it('throws OilMonsterParseError when neither VLSFO nor MGO column found', () => {
    const html = makeHtml(
      [makeRow('Rotterdam', '600', '700')],
      '<th>Port</th><th>FOO</th><th>BAR</th>',
    );
    expect(() => parseOilMonsterHtml(html)).toThrow(OilMonsterParseError);
  });
});

// ── parseOilMonsterHtml — numeric parsing ────────────────────────────────────

describe('parseOilMonsterHtml — numeric parsing', () => {
  it('parses integer prices', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '600', '700')]));
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBe(600);
    expect(result[0].mgo).toBe(700);
  });

  it('parses float prices', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Singapore', '642.50', '789.75')]));
    expect(result[0].vlsfo).toBeCloseTo(642.5);
    expect(result[0].mgo).toBeCloseTo(789.75);
  });

  it('parses comma-formatted thousands (1,234.50)', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '1,234.50', '1,456.00')]));
    expect(result[0].vlsfo).toBeCloseTo(1234.5);
    expect(result[0].mgo).toBeCloseTo(1456.0);
  });

  it('returns no entry when both cells are double-dash placeholder', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '--', '--')]));
    expect(result).toHaveLength(0);
  });

  it('returns no entry when both cells are empty', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '', '')]));
    expect(result).toHaveLength(0);
  });

  it('ignores zero (0 is not a valid bunker price)', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '0', '0')]));
    expect(result).toHaveLength(0);
  });

  it('ignores negative values', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '-600', '-700')]));
    expect(result).toHaveLength(0);
  });

  // BUG #1 — currency symbol prefix causes parseFloat to return NaN
  it('parses price with leading dollar sign ($600.50)', () => {
    const result = parseOilMonsterHtml(makeHtml([makeRow('Rotterdam', '$600.50', '$700.50')]));
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBeCloseTo(600.5);
    expect(result[0].mgo).toBeCloseTo(700.5);
  });

  // BUG #2 — &nbsp; entity not decoded; parseFloat("&nbsp;600") = NaN
  it('parses price prefixed with &nbsp; entity (&nbsp;600.50)', () => {
    const result = parseOilMonsterHtml(
      makeHtml([makeRow('Rotterdam', '&nbsp;600.50', '&nbsp;700.50')]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBeCloseTo(600.5);
    expect(result[0].mgo).toBeCloseTo(700.5);
  });

  it('parses price wrapped in <span> (strip HTML inside td)', () => {
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody><tr>` +
      `<td><a href="/p">Rotterdam</a></td>` +
      `<td><span class="price">600.50</span></td>` +
      `<td><span class="price">700.50</span></td>` +
      `</tr></tbody>` +
      `</table>`;
    const result = parseOilMonsterHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBeCloseTo(600.5);
  });
});

// ── parseOilMonsterHtml — column detection ───────────────────────────────────

describe('parseOilMonsterHtml — column detection', () => {
  it('resolves VLSFO/MGO column order correctly when swapped (MGO first)', () => {
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>MGO</th><th>VLSFO</th></tr></thead>` +
      `<tbody><tr>` +
      `<td><a href="/p">Rotterdam</a></td>` +
      `<td>700</td>` +
      `<td>600</td>` +
      `</tr></tbody>` +
      `</table>`;
    const result = parseOilMonsterHtml(html);
    expect(result[0].vlsfo).toBe(600);
    expect(result[0].mgo).toBe(700);
  });

  it('resolves columns when only VLSFO column present (no MGO)', () => {
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th></tr></thead>` +
      `<tbody><tr>` +
      `<td><a href="/p">Rotterdam</a></td>` +
      `<td>600</td>` +
      `</tr></tbody>` +
      `</table>`;
    const result = parseOilMonsterHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBe(600);
    expect(result[0].mgo).toBeUndefined();
  });

  // BUG #3 — HTML in <th> (footnote superscripts etc.) breaks exact-match column detection
  it('resolves columns when <th> contains nested HTML (VLSFO<sup>1</sup>)', () => {
    const headers =
      '<th>Port</th><th>VLSFO<sup>1</sup></th><th>MGO<sup>*</sup></th>';
    const result = parseOilMonsterHtml(
      makeHtml([makeRow('Rotterdam', '600', '700')], headers),
    );
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBe(600);
    expect(result[0].mgo).toBe(700);
  });

  it('header matching is case-insensitive (VLSFO vs vlsfo)', () => {
    const headers = '<th>Port</th><th>vlsfo</th><th>mgo</th>';
    const result = parseOilMonsterHtml(
      makeHtml([makeRow('Rotterdam', '600', '700')], headers),
    );
    expect(result[0].vlsfo).toBe(600);
  });
});

// ── parseOilMonsterHtml — port mapping ──────────────────────────────────────

describe('parseOilMonsterHtml — port mapping', () => {
  const MAPPED_PORTS: [string, string][] = [
    ['Rotterdam', 'NLRTM'],
    ['Singapore', 'SGSIN'],
    ['Fujairah', 'AEFJR'],
    ['Houston', 'USHOU'],
    ['Gibraltar', 'GIGIB'],
  ];

  it.each(MAPPED_PORTS)('maps %s → %s', (port, expectedCode) => {
    const result = parseOilMonsterHtml(makeHtml([makeRow(port, '600', '700')]));
    expect(result).toHaveLength(1);
    expect(result[0].portName).toBe(port);
    expect(result[0].unlocode).toBe(expectedCode);
  });

  it('ignores unknown ports silently', () => {
    expect(parseOilMonsterHtml(makeHtml([makeRow('Antwerp', '600', '700')]))).toHaveLength(0);
  });

  it('does NOT match case-insensitive port name (rotterdam → no match)', () => {
    expect(parseOilMonsterHtml(makeHtml([makeRow('rotterdam', '600', '700')]))).toHaveLength(0);
  });

  it('does NOT match "Port of Rotterdam" substring', () => {
    expect(
      parseOilMonsterHtml(makeHtml([makeRow('Port of Rotterdam', '600', '700')])),
    ).toHaveLength(0);
  });

  it('does NOT false-match "Duqm Fujairah" as Fujairah (substring guard)', () => {
    expect(
      parseOilMonsterHtml(makeHtml([makeRow('Duqm Fujairah', '600', '700')])),
    ).toHaveLength(0);
  });

  it('does NOT false-match "Houston TX" as Houston', () => {
    expect(
      parseOilMonsterHtml(makeHtml([makeRow('Houston TX', '600', '700')])),
    ).toHaveLength(0);
  });

  it('trims whitespace around port name before map lookup', () => {
    // "Rotterdam " with trailing space should still match
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody><tr>` +
      `<td><a href="/p"> Rotterdam </a></td>` +
      `<td>600</td>` +
      `<td>700</td>` +
      `</tr></tbody>` +
      `</table>`;
    const result = parseOilMonsterHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0].portName).toBe('Rotterdam');
  });
});

// ── parseOilMonsterHtml — malformed HTML ─────────────────────────────────────

describe('parseOilMonsterHtml — malformed HTML', () => {
  it('skips rows with no link in first cell (no > before port name → portNameMatch = null)', () => {
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody><tr><td>Rotterdam</td><td>600</td><td>700</td></tr></tbody>` +
      `</table>`;
    expect(parseOilMonsterHtml(html)).toHaveLength(0);
  });

  it('handles multiple regional tables sharing same column structure', () => {
    const region = (port: string, vlsfo: string, mgo: string) =>
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody>${makeRow(port, vlsfo, mgo)}</tbody>` +
      `</table>`;

    const html = region('Rotterdam', '600', '700') + region('Singapore', '650', '750');
    const result = parseOilMonsterHtml(html);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.portName)).toEqual(
      expect.arrayContaining(['Rotterdam', 'Singapore']),
    );
  });

  it('skips rows with fewer than 2 td cells', () => {
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody>` +
      `<tr><td><a href="/p">Rotterdam</a></td></tr>` +
      `<tr><td><a href="/p">Singapore</a></td><td>650</td><td>750</td></tr>` +
      `</tbody>` +
      `</table>`;
    const result = parseOilMonsterHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0].portName).toBe('Singapore');
  });

  // BUG #4 — nested <tr> inside <td> (nested table) causes lazy row regex to
  // terminate at inner </tr>, losing the outer row's price cells entirely.
  // This is a known regex limitation; real OilMonster pages don't exhibit this.
  it('correctly parses port row when first cell contains a nested table', () => {
    const html =
      `<table class="restable">` +
      `<thead><tr><th>Port</th><th>VLSFO</th><th>MGO</th></tr></thead>` +
      `<tbody>` +
      `<tr>` +
      `<td><a href="/p">Rotterdam</a><table><tr><td>irrelevant</td></tr></table></td>` +
      `<td>600</td>` +
      `<td>700</td>` +
      `</tr>` +
      `</tbody>` +
      `</table>`;
    const result = parseOilMonsterHtml(html);
    expect(result).toHaveLength(1);
    expect(result[0].vlsfo).toBe(600);
  });
});

// ── parseOilMonsterHtml — duplicate rows ─────────────────────────────────────

describe('parseOilMonsterHtml — duplicate port rows', () => {
  it('returns two entries when the same port appears twice (documents current no-dedup behaviour)', () => {
    const html = makeHtml([
      makeRow('Rotterdam', '600', '700'),
      makeRow('Rotterdam', '601', '701'),
    ]);
    const result = parseOilMonsterHtml(html);
    // Parser emits both; upsert in refreshOilMonster makes the second win
    expect(result).toHaveLength(2);
    expect(result.every(r => r.portName === 'Rotterdam')).toBe(true);
  });
});

// ── refreshOilMonster — range validation (needs DB) ──────────────────────────

describe('refreshOilMonster — range validation', () => {
  let db: Database.Database;

  beforeEach(() => { db = makeDb(); });
  afterEach(() => { db.close(); });

  async function runWith(html: string) {
    return refreshOilMonster(db, async () => html);
  }

  it('upserts price at exact lower boundary (200 inclusive)', async () => {
    const result = await runWith(makeHtml([makeRow('Rotterdam', '200', '200')]));
    expect(result.rowsChanged).toBe(2);
  });

  it('upserts price at exact upper boundary (2000 inclusive)', async () => {
    const result = await runWith(makeHtml([makeRow('Rotterdam', '2000', '2000')]));
    expect(result.rowsChanged).toBe(2);
  });

  it('skips VLSFO just below lower boundary (199)', async () => {
    const result = await runWith(makeHtml([makeRow('Rotterdam', '199', '500')]));
    // VLSFO skipped, MGO upserted
    expect(result.rowsChanged).toBe(1);
  });

  it('skips price just above upper boundary (2001)', async () => {
    const result = await runWith(makeHtml([makeRow('Rotterdam', '2001', '2001')]));
    expect(result.rowsChanged).toBe(0);
  });

  it('returns rowsChanged=0 on broken HTML (OilMonsterParseError caught)', async () => {
    const result = await runWith('<html>no table markers</html>');
    expect(result.rowsChanged).toBe(0);
  });

  it('returns rowsChanged=0 when no target port rows matched', async () => {
    const result = await runWith(makeHtml([makeRow('Antwerp', '600', '700')]));
    expect(result.rowsChanged).toBe(0);
  });

  it('propagates non-parse errors (network-style rejection)', async () => {
    const fetcher = async () => { throw new Error('network down'); };
    await expect(refreshOilMonster(db, fetcher)).rejects.toThrow('network down');
  });
});
