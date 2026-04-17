import { matchTargetsToUnlocodes, normalizeForMatch } from '../match-targets';
import type { ParsedUnlocodeRow } from '../unlocode-parse';
import type { PortTarget } from '../../port-targets';

const ROW = (
  unlocode: string, country: string, name: string, lat: number, lon: number,
): ParsedUnlocodeRow => ({
  unlocode, country, name, lat, lon, function: '1-------',
});

describe('normalizeForMatch', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeForMatch('Gdańsk')).toBe('gdansk');
    expect(normalizeForMatch('Tubarão')).toBe('tubarao');
    expect(normalizeForMatch('Réunion')).toBe('reunion');
  });

  it('strips common port-prefix words (Port, Pt., Saint)', () => {
    expect(normalizeForMatch('Port of Rotterdam')).toBe('rotterdam');
    expect(normalizeForMatch('Pt. Klang')).toBe('klang');
  });

  it('collapses whitespace', () => {
    expect(normalizeForMatch('  Port   Klang  ')).toBe('klang');
  });

  it('strips trailing parenthetical/qualifier', () => {
    expect(normalizeForMatch('Shanghai Pt')).toBe('shanghai');
    expect(normalizeForMatch('Cartagena (CO)')).toBe('cartagena');
  });
});

describe('matchTargetsToUnlocodes', () => {
  const ROWS: ParsedUnlocodeRow[] = [
    ROW('NLRTM', 'NL', 'Rotterdam', 51.917, 4.483),
    ROW('CNSHA', 'CN', 'Shanghai Pt', 30.633, 122.067),
    ROW('CNSHG', 'CN', 'Shanghai',    31.233, 121.467),  // ambiguous duplicate
    ROW('ESCAR', 'ES', 'Cartagena',   37.6,   -0.983),
    ROW('COCTG', 'CO', 'Cartagena',   10.4,   -75.5),
    ROW('AUNTL', 'AU', 'Newcastle',   -32.93, 151.78),
    ROW('GBNCL', 'GB', 'Newcastle upon Tyne', 54.97, -1.6),
  ];

  it('matches by exact UNLOCODE override when given', () => {
    const targets: PortTarget[] = [{ name: 'Shanghai', country: 'CN', unlocode: 'CNSHA' }];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].unlocode).toBe('CNSHA');
    expect(r.matched[0].name).toBe('Shanghai');  // canonical from target, not "Shanghai Pt"
  });

  it('matches by name+country when no override', () => {
    const targets: PortTarget[] = [{ name: 'Rotterdam', country: 'NL' }];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].unlocode).toBe('NLRTM');
  });

  it('disambiguates same-name ports by country', () => {
    const targets: PortTarget[] = [
      { name: 'Cartagena', country: 'ES', unlocode: 'ESCAR' },
      { name: 'Cartagena', country: 'CO', unlocode: 'COCTG' },
      { name: 'Newcastle', country: 'AU', unlocode: 'AUNTL' },
    ];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    expect(r.matched).toHaveLength(3);
    const codes = r.matched.map(m => m.unlocode).sort();
    expect(codes).toEqual(['AUNTL', 'COCTG', 'ESCAR']);
  });

  it('reports unmatched targets', () => {
    const targets: PortTarget[] = [
      { name: 'Rotterdam', country: 'NL' },
      { name: 'Atlantis', country: 'XX' },
    ];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    expect(r.matched).toHaveLength(1);
    expect(r.unmatched).toHaveLength(1);
    expect(r.unmatched[0].name).toBe('Atlantis');
  });

  it('preserves canonical name from target (not raw UN/LOCODE name)', () => {
    const targets: PortTarget[] = [{ name: 'Shanghai', country: 'CN', unlocode: 'CNSHA' }];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    // UN/LOCODE has "Shanghai Pt" — we want broker-facing "Shanghai"
    expect(r.matched[0].name).toBe('Shanghai');
  });

  it('emits PortMaster-shape skeletons (no draft/crane fields yet)', () => {
    const targets: PortTarget[] = [{ name: 'Rotterdam', country: 'NL' }];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    const m = r.matched[0];
    expect(m.unlocode).toBe('NLRTM');
    expect(m.country).toBe('NL');
    expect(m.lat).toBeCloseTo(51.917, 2);
    expect(m.lon).toBeCloseTo(4.483, 2);
    // Enrichment fields are absent in skeleton (added in Phase 4)
    expect((m as unknown as Record<string, unknown>).maxDraftM).toBeUndefined();
    expect((m as unknown as Record<string, unknown>).hasShoreCranes).toBeUndefined();
  });

  it('warns on duplicate UNLOCODE in target list', () => {
    const targets: PortTarget[] = [
      { name: 'Rotterdam', country: 'NL', unlocode: 'NLRTM' },
      { name: 'Rotterdam-Dup', country: 'NL', unlocode: 'NLRTM' },
    ];
    const r = matchTargetsToUnlocodes(targets, ROWS);
    expect(r.warnings.some(w => /duplicate.+NLRTM/i.test(w))).toBe(true);
  });
});
