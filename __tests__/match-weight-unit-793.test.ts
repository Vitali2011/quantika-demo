/**
 * #793 — cargo weight SourceAttributionSection must show unit "mt".
 *
 * Static source analysis: the Weight field passed to SourceAttributionSection
 * must include the unit (e.g. `${cargo.weightMt} mt`) instead of a bare number.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const pagePath = path.join(ROOT, 'app/match/[id]/page.tsx');

describe('#793 — weight unit in SourceAttributionSection', () => {
  it('Weight field includes "mt" unit in the displayed value', () => {
    const src = fs.readFileSync(pagePath, 'utf-8');
    // The template literal must include " mt" unit suffix
    expect(src).toMatch(/weightMt.*mt|`\$\{.*weightMt.*\}\s*mt/);
  });

  it('Weight label exists with mt unit string in SourceAttributionSection fields', () => {
    const src = fs.readFileSync(pagePath, 'utf-8');
    // Must have the string "mt" near the Weight label
    const weightIdx = src.indexOf("'Weight'");
    expect(weightIdx).toBeGreaterThan(-1);
    // Look at the surrounding 200 chars for "mt"
    const surrounding = src.substring(weightIdx, weightIdx + 200);
    expect(surrounding).toMatch(/mt/);
  });

  it('Weight value is wrapped in a ConfidenceField-compatible object (not a bare number)', () => {
    const src = fs.readFileSync(pagePath, 'utf-8');
    // The value must use a ConfidenceField shape { value: ..., confidence: ... }
    // to satisfy SourceAttributionSection type requirements
    expect(src).toMatch(/Weight.*confidence|confidence.*Weight/);
  });
});
