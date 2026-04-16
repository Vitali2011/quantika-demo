import { toConfidence } from '../parsing-utils';
import { calibrateConfidence } from '../validation/confidence-calibration';
import type { ConfidenceField } from '../types';
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '../sample-data/adversarial');

function fixture(name: string): string {
  return fs.readFileSync(path.join(DIR, name), 'utf-8');
}

// Simulate what the LLM returns + run through parsing + calibration pipeline
function sim<T>(
  value: T,
  confidence: 'confirmed' | 'interpreted' | 'uncertain',
  source_text: string
): ConfidenceField<T> | null {
  return calibrateConfidence(toConfidence<T>({ value, confidence, source_text }));
}

// ── Fixture file existence ────────────────────────────────────────────────────

describe('adversarial: fixture files exist', () => {
  it('all 20 adversarial fixture files are present', () => {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.txt'));
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it.each([
    '10-abt-weight.txt',
    '11-circa-dwt.txt',
    '12-approx-laycan.txt',
    '13-tilde-freight.txt',
    '17-all-caps-abt.txt',
    '20-multi-hedge-chain.txt',
  ])('fixture %s is non-empty', (file) => {
    expect(fixture(file).length).toBeGreaterThan(0);
  });
});

// ── Hedge word auto-downgrade ─────────────────────────────────────────────────

describe('adversarial: hedge words auto-downgrade confirmed → interpreted', () => {
  it('10-abt-weight.txt: "abt 5000 mts" → interpreted', () => {
    const srcMatch = fixture('10-abt-weight.txt').match(/abt \d+ mts/i);
    const src = srcMatch?.[0] ?? 'abt 5000 mts';
    expect(sim(5000, 'confirmed', src)?.confidence).toBe('interpreted');
  });

  it('11-circa-dwt.txt: "circa 8500 DWT" → interpreted', () => {
    expect(sim(8500, 'confirmed', 'circa 8500 DWT')?.confidence).toBe('interpreted');
  });

  it('12-approx-laycan.txt: "approx 15-20 Aug" → interpreted', () => {
    expect(sim('15-20 Aug', 'confirmed', 'approx 15-20 Aug 2026')?.confidence).toBe('interpreted');
  });

  it('13-tilde-freight.txt: "~USD 28 PMT" → interpreted', () => {
    expect(sim('USD 28 PMT', 'confirmed', '~USD 28 PMT')?.confidence).toBe('interpreted');
  });

  it('15-forwarded-messy.txt: "Constanta abt 20 Apr" → interpreted', () => {
    const src = 'Constanta abt 20 Apr 2026';
    expect(sim('Constanta', 'confirmed', src)?.confidence).toBe('interpreted');
  });

  it('17-all-caps-abt.txt: "ABT 3500 MTS" → interpreted (case-insensitive)', () => {
    expect(sim(3500, 'confirmed', 'ABT 3500 MTS WHEAT')?.confidence).toBe('interpreted');
  });

  it('20-multi-hedge-chain.txt: multiple hedges → interpreted (not further downgraded)', () => {
    expect(sim(5000, 'confirmed', 'about approximately abt 5000 mts soya')?.confidence).toBe('interpreted');
  });

  it('03-abt-ambiguous-port.txt: "SPORE abt" context → interpreted', () => {
    expect(sim(5000, 'confirmed', 'SPORE abt 5000 mts')?.confidence).toBe('interpreted');
  });
});

// ── Null / missing source_text passthrough ────────────────────────────────────

describe('adversarial: null/missing source_text passthrough', () => {
  it('calibrateConfidence(null) returns null', () => {
    expect(calibrateConfidence(null)).toBeNull();
  });

  it('calibrateConfidence(undefined) returns null', () => {
    expect(calibrateConfidence(undefined)).toBeNull();
  });

  it('19-empty-source-text.txt: empty string source_text → stays confirmed', () => {
    // Empty string won't match hedge regex
    const result = sim('Rotterdam', 'confirmed', '');
    expect(result?.confidence).toBe('confirmed');
  });

  it('null source_text (LLM omits it) → stays confirmed', () => {
    const f = toConfidence<string>({ value: 'Rotterdam', confidence: 'confirmed', source_text: null });
    expect(calibrateConfidence(f)?.confidence).toBe('confirmed');
    expect(calibrateConfidence(f)?.sourceText).toBeUndefined();
  });

  it('missing source_text entirely → stays confirmed', () => {
    const f: ConfidenceField<string> = { value: 'Rotterdam', confidence: 'confirmed' };
    expect(calibrateConfidence(f)?.confidence).toBe('confirmed');
  });
});

// ── Already-downgraded passthrough ───────────────────────────────────────────

describe('adversarial: already-downgraded confidence is not double-downgraded', () => {
  it('interpreted + hedge word → stays interpreted', () => {
    expect(sim(5000, 'interpreted', 'abt 5000 mts')?.confidence).toBe('interpreted');
  });

  it('uncertain + hedge word → stays uncertain', () => {
    expect(sim('Rotterdam?', 'uncertain', 'abt Rotterdam')?.confidence).toBe('uncertain');
  });

  it('16-multi-cargo-hedge.txt: second cargo is interpreted, not uncertain', () => {
    // Item 2 is already "interpreted" by LLM — calibration should not further downgrade
    const result = sim(3000, 'interpreted', 'abt 3000 mts grain');
    expect(result?.confidence).toBe('interpreted');
  });
});

// ── Clean emails stay confirmed ───────────────────────────────────────────────

describe('adversarial: clean source texts stay confirmed', () => {
  it('01-typo-port.txt: explicit weight without hedge → confirmed', () => {
    expect(sim(5000, 'confirmed', 'Weight: 5000 mts barite')?.confidence).toBe('confirmed');
  });

  it('07-no-imo.txt: vessel name explicitly stated → confirmed', () => {
    expect(sim('MV FORTUNE STAR', 'confirmed', 'MV FORTUNE STAR open Antwerp 20 Apr 2026')?.confidence).toBe('confirmed');
  });

  it('18-unicode-port.txt: unicode port name → confirmed', () => {
    expect(sim('Açu', 'confirmed', 'Loading: Açu, Brazil')?.confidence).toBe('confirmed');
  });

  it('clean DWT without hedge stays confirmed', () => {
    expect(sim(50000, 'confirmed', 'DWT 50,000 summer')?.confidence).toBe('confirmed');
  });

  it('clean laycan without hedge stays confirmed', () => {
    expect(sim('01/10 Jun 2026', 'confirmed', 'Laycan 01/10 Jun 2026')?.confidence).toBe('confirmed');
  });
});

// ── Field integrity through the pipeline ─────────────────────────────────────

describe('adversarial: field data integrity through toConfidence + calibrateConfidence', () => {
  it('sourceText is preserved after calibration downgrade', () => {
    const src = 'abt 5000 mts wheat';
    const result = sim(5000, 'confirmed', src);
    expect(result?.sourceText).toBe(src);
    expect(result?.value).toBe(5000);
  });

  it('value is unchanged after calibration', () => {
    const result = sim('Rotterdam', 'confirmed', 'abt Rotterdam area');
    expect(result?.value).toBe('Rotterdam');
  });

  it('toConfidence on plain string returns confirmed with no sourceText', () => {
    const f = toConfidence<string>('Rotterdam');
    expect(f?.confidence).toBe('confirmed');
    expect(f?.sourceText).toBeUndefined();
  });

  it('toConfidence maps source_text (snake_case) → sourceText (camelCase)', () => {
    const f = toConfidence<string>({ value: 'Hamburg', confidence: 'confirmed', source_text: 'Open: Hamburg' });
    expect(f?.sourceText).toBe('Open: Hamburg');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('adversarial: edge cases', () => {
  it('04-dwt-dwcc-impossible.txt: physically impossible DWT/DWCC — confidence stays as-is (no domain check in calibration)', () => {
    // calibration only checks for hedge words, not domain invariants
    const dwt = sim(3000, 'confirmed', 'DWT 3000 mts');
    const dwcc = sim(5000, 'confirmed', 'DWCC 5000 mts');
    expect(dwt?.confidence).toBe('confirmed');
    expect(dwcc?.confidence).toBe('confirmed');
  });

  it('05-laycan-inverted.txt: inverted laycan string passes through without confidence change', () => {
    const result = sim('30/1 May 2026', 'confirmed', 'Laycan 30/1 May 2026');
    expect(result?.confidence).toBe('confirmed');
  });

  it('number value 0 — toConfidence returns null (falsy check)', () => {
    expect(toConfidence<number>(0)).toBeNull();
  });

  it('boolean false — toConfidence returns null (falsy check)', () => {
    expect(toConfidence<boolean>(false)).toBeNull();
  });
});
