import { extractLastCargoesFromBody } from '../lastcargoes-fallback';

describe('extractLastCargoesFromBody', () => {
  it('extracts from L/C: marker', () => {
    expect(extractLastCargoesFromBody('L/C: steel bars, coal, scrap\nOpen: Karasu'))
      .toBe('steel bars, coal, scrap');
  });

  it('extracts from Last cargoes: marker', () => {
    expect(extractLastCargoesFromBody('Last cargoes: fertilizer, grain, bagged cement'))
      .toBe('fertilizer, grain, bagged cement');
  });

  it('extracts from "previously carried" prose', () => {
    expect(extractLastCargoesFromBody('Previously carried: iron ore, bauxite, coal'))
      .toBe('iron ore, bauxite, coal');
  });

  it('extracts from "last loads:" marker', () => {
    expect(extractLastCargoesFromBody('last loads: grain, soybeans, corn'))
      .toBe('grain, soybeans, corn');
  });

  it('returns null for body without L/C patterns', () => {
    expect(extractLastCargoesFromBody('MV GANDOLF 3850 DWT gearless open Skikda'))
      .toBeNull();
  });

  it('returns null for empty body', () => {
    expect(extractLastCargoesFromBody('')).toBeNull();
  });

  it('handles "recent employment:" pattern', () => {
    expect(extractLastCargoesFromBody('Recent employment: fertilizer, grain'))
      .toBe('fertilizer, grain');
  });

  it('stops at field header on next line (DWT:)', () => {
    expect(extractLastCargoesFromBody('L/C: steel, coal\nDWT: 5000'))
      .toBe('steel, coal');
  });

  it('captures multi-line cargo list (stop at blank line)', () => {
    const body = 'L/C: Coal\nGrain\nSteel\n\nOpen: Karasu';
    const raw = extractLastCargoesFromBody(body);
    expect(raw).toContain('Coal');
    expect(raw).toContain('Grain');
    expect(raw).toContain('Steel');
  });

  it('multi-line list with no blank line terminator captured to end-of-string', () => {
    const body = 'Last cargoes: Wheat\nFertilizer\nPetcoke';
    const raw = extractLastCargoesFromBody(body);
    expect(raw).toContain('Wheat');
    expect(raw).toContain('Fertilizer');
    expect(raw).toContain('Petcoke');
  });
});
