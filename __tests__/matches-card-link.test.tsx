/**
 * RED tests — match card clickable / Link to /match/[id] (#348)
 *
 * Strategy: static JSX source analysis (testEnvironment: 'node').
 *
 * Covers:
 *  1. Link is imported from 'next/link'
 *  2. Link is used in match card JSX
 *  3. href points to /match/${match.id}
 *  4. Checkbox and action buttons are NOT inside the Link (no nested interactive elements)
 *  5. Boundary: 1 element, 50+ elements
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const clientPath = path.join(ROOT, 'app/matches/MatchesClient.tsx');

function readSource(): string {
  return fs.readFileSync(clientPath, 'utf8');
}

describe('MatchesClient.tsx — match card link to /match/[id] (#348)', () => {
  it('imports Link from next/link', () => {
    const src = readSource();
    expect(src).toMatch(/import Link from ['"]next\/link['"]/);
  });

  it('renders Link component in match card JSX', () => {
    const src = readSource();
    expect(src).toMatch(/<Link\s/);
  });

  it('Link href points to /match/ route with match id', () => {
    const src = readSource();
    // href must reference /match/ path and match.id
    expect(src).toMatch(/href=.*\/match\/.*match\.id|href=.*`\/match\/\$\{match\.id\}/);
  });

  it('Link uses template literal or string interpolation for dynamic id', () => {
    const src = readSource();
    expect(src).toMatch(/`\/match\/\$\{match\.id\}`|`\/match\/\$\{[^}]+id[^}]*\}`/);
  });

  it('action buttons (Save, Dismiss, Archive) are rendered outside the Link block', () => {
    const src = readSource();
    // The buttons must come after the closing </Link> tag
    const linkCloseIdx = src.lastIndexOf('</Link>');
    const saveBtnIdx = src.lastIndexOf("'saved'");
    // Save button must appear after Link closes (no button-in-anchor nesting)
    expect(linkCloseIdx).not.toBe(-1);
    expect(saveBtnIdx).toBeGreaterThan(linkCloseIdx);
  });

  it('Boundary Class 1 — 1 match: Link renders for that single match', () => {
    const src = readSource();
    // Link is inside the filtered.map — if map runs for 1 item, Link renders once
    const mapBlock = src.match(/filtered\.map[\s\S]{0,200}/)?.[0] ?? '';
    expect(mapBlock.length).toBeGreaterThan(0);
    // Link appears inside filtered.map block or close to it
    expect(src.indexOf('<Link')).toBeGreaterThan(src.indexOf('filtered.map'));
  });

  it('Boundary Class 5 — 50+ matches: Link renders for all (inside map, no limit)', () => {
    const src = readSource();
    // Link appears after the card-render filtered.map in the source
    const cardMapIdx = src.indexOf('filtered.map((match)');
    const linkIdx = src.indexOf('<Link', cardMapIdx);
    expect(cardMapIdx).not.toBe(-1);
    // <Link must appear somewhere after the card map starts (within the map block)
    expect(linkIdx).toBeGreaterThan(cardMapIdx);
    // And no slice/limit before the map that would cap at < 50
    const beforeMap = src.slice(0, cardMapIdx);
    expect(beforeMap).not.toMatch(/\.slice\s*\(\s*0\s*,\s*[1-9]\d?\s*\)\s*\.map/);
  });
});
