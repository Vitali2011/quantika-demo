/**
 * test-skill adversarial regression — wave D (feat/wave-d-revive-cleanup @ 7bb062ec)
 * Class: parser (lastCargoes regex fallback wired into parseVesselAIResponse).
 * Invariants under attack (plan T4 Step 2):
 *  - LLM-provided last_cargoes ALWAYS wins (fallback never overwrites);
 *  - fallback fires only when the field is empty;
 *  - no crash on garbage bodies;
 *  - existing expectations for calls WITHOUT body unchanged.
 */
import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';
import { extractLastCargoesFromBody } from '@/lib/parsing/lastcargoes-fallback';

const BODY = 'M/V X open Aliaga 15-20 Jun\nL/C: coal, grain, urea\ndwt: 12000';

const parse = (item: Record<string, unknown>, body?: string | null) =>
  parseVesselAIResponse(JSON.stringify(item), 'e-1', null, body)[0];

describe('lastCargoes fallback — LLM-wins ordering', () => {
  it('string value wins over body', () => {
    expect(parse({ vessel_name: 'X', last_cargoes: 'steel' }, BODY).lastCargoes).toBe('steel');
  });

  it('confidence-wrapped value wins over body', () => {
    expect(
      parse({ vessel_name: 'X', last_cargoes: { value: 'steel', confidence: 'stated' } }, BODY)
        .lastCargoes,
    ).toBe('steel');
  });

  it('array value wins over body', () => {
    expect(parse({ vessel_name: 'X', last_cargoes: ['steel', 'coal'] }, BODY).lastCargoes).toBe(
      'steel, coal',
    );
  });

  it('missing field + body → fallback applies', () => {
    expect(parse({ vessel_name: 'X' }, BODY).lastCargoes).toBe('coal, grain, urea');
  });

  it('explicit null field + body → fallback applies', () => {
    expect(parse({ vessel_name: 'X', last_cargoes: null }, BODY).lastCargoes).toBe(
      'coal, grain, urea',
    );
  });

  it('empty-string field + body → fallback applies (empty is "no data")', () => {
    expect(parse({ vessel_name: 'X', last_cargoes: '' }, BODY).lastCargoes).toBe(
      'coal, grain, urea',
    );
  });
});

describe('lastCargoes fallback — truthy-but-empty wrappers (documented edge)', () => {
  // Pin the CURRENT behavior so any future change is visible.
  it('{value: null} wrapper IS routed to the fallback (upstream normalization empties it)', () => {
    const r = parse({ vessel_name: 'X', last_cargoes: { value: null } }, BODY);
    expect(r.lastCargoes).toBe('coal, grain, urea'); // observed on HEAD — good behavior, pinned
  });

  it('empty array [] skips fallback and yields empty string', () => {
    const r = parse({ vessel_name: 'X', last_cargoes: [] }, BODY);
    expect(r.lastCargoes).toBe(''); // falsy downstream → hold-cleanliness still no-op
  });
});

describe('lastCargoes fallback — no-body and garbage tolerance', () => {
  it('no body → null (unchanged legacy behavior)', () => {
    expect(parse({ vessel_name: 'X' }).lastCargoes).toBeNull();
  });

  it('never throws on hostile bodies', () => {
    const hostile = [
      '',
      'L/C:',
      'L/C: ' + 'a'.repeat(5000),
      'L/C: 12345',
      'L/C: ‮�coal\0',
      'last cargoes - coal; \n L/C: grain',
      'L/C: x'.repeat(200),
      '\n\r\n L5C: ok-cargo-name',
      'previously carried: ' + '🛳'.repeat(50),
    ];
    for (const body of hostile) {
      expect(() => parse({ vessel_name: 'X' }, body)).not.toThrow();
    }
  });

  it('extractor invariants: trimmed, bounded 3..200 chars, never numeric-only', () => {
    const bodies = [
      'L/C: 12',
      'L/C: 1234567',
      'L/C: ok',
      `L/C: ${'a'.repeat(300)}`,
      'L/C:    spaced   out   cargo   ',
      'L/C: coal.;',
    ];
    for (const b of bodies) {
      const out = extractLastCargoesFromBody(b);
      if (out !== null) {
        expect(out.length).toBeGreaterThanOrEqual(3);
        expect(out.length).toBeLessThanOrEqual(200);
        expect(/^\d+[\d,.\s]*$/.test(out)).toBe(false);
        expect(out).toBe(out.trim());
      }
    }
  });
});
