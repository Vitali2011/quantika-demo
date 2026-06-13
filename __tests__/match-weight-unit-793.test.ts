/**
 * #793 — cargo weight SourceAttributionSection must show unit "mt".
 *
 * Runtime assertion: spreading cargo.weightMt with a formatted .value must
 * produce a ConfidenceField<string> with:
 *   - .value = "<number> mt"  (not "[object Object] mt")
 *   - .confidence preserved from the original field
 *   - .sourceText preserved from the original field
 */

import type { ConfidenceField } from '@/lib/types';

/** Mirrors the spread expression in app/match/[id]/page.tsx */
function buildWeightField(
  weightMt: ConfidenceField<number>,
): ConfidenceField<string> {
  return { ...weightMt, value: `${weightMt.value} mt` };
}

describe('#793 — weight unit in SourceAttributionSection', () => {
  const sample: ConfidenceField<number> = {
    value: 55000,
    confidence: 'interpreted',
    sourceText: '55,000 mt grain',
  };

  it('renders a real number + " mt", not "[object Object] mt"', () => {
    const field = buildWeightField(sample);
    expect(field.value).toBe('55000 mt');
    expect(field.value).not.toContain('[object Object]');
  });

  it('preserves original confidence (does not hardcode "confirmed")', () => {
    const field = buildWeightField(sample);
    expect(field.confidence).toBe('interpreted');
  });

  it('preserves sourceText so SourceAttributionSection shows the row', () => {
    const field = buildWeightField(sample);
    expect(field.sourceText).toBe('55,000 mt grain');
  });

  it('works when sourceText is absent', () => {
    const noSource: ConfidenceField<number> = { value: 12000, confidence: 'confirmed' };
    const field = buildWeightField(noSource);
    expect(field.value).toBe('12000 mt');
    expect(field.sourceText).toBeUndefined();
  });

  it('page.tsx uses the spread pattern (source guard)', () => {
    // Belt-and-suspenders: verify the page source uses the spread, not a bare template literal
     
    const fs = require('fs') as typeof import('fs');
     
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../app/match/[id]/page.tsx'),
      'utf-8',
    );
    // Must use spread: { ...cargo.weightMt, value: `${cargo.weightMt.value} mt` }
    expect(src).toMatch(/\.\.\.\s*cargo\.weightMt/);
    expect(src).toMatch(/cargo\.weightMt\.value.*mt/);
    // Must NOT interpolate the raw ConfidenceField object as a whole
    expect(src).not.toMatch(/`\$\{cargo\.weightMt\}\s*mt`/);
  });
});
