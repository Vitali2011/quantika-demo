/**
 * Tests — MatchWorksheet component + page.tsx integration
 * Strategy: static source analysis (testEnvironment: 'node')
 *
 * Covers:
 *   - Component file exists and is null-safe
 *   - 8 row labels present (timing, location, weight, volume, type, cranes, draft, quality)
 *   - Column headers: Vessel and Cargo/Port
 *   - Ballast transit chain rendered from distanceNm/sailingDays/arrivalDate
 *   - page.tsx: imports component, parses worksheet_json, renders before tabs
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const worksheetPath = path.join(ROOT, 'components/match/MatchWorksheet.tsx');
const pagePath = path.join(ROOT, 'app/match/[id]/page.tsx');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('components/match/MatchWorksheet.tsx — structure', () => {
  it('file exists', () => {
    expect(fs.existsSync(worksheetPath)).toBe(true);
  });

  it('accepts MatchWorksheet | null prop (null-safe)', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/MatchWorksheet.*null|null.*MatchWorksheet/);
  });

  it('returns null when worksheet is null', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/if.*!.*worksheet.*return null|worksheet\s*\).*return null/);
  });

  it('renders ⏱ Time row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Time|⏱/);
  });

  it('renders 📍 Where/Transit row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Where|Transit|📍/);
  });

  it('renders ⚖️ Weight row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Weight|⚖/);
  });

  it('renders 📦 Volume row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Volume|📦/);
  });

  it('renders 🚢 Type row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Type|🚢/);
  });

  it('renders 🏗 Cranes row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Crane|🏗/);
  });

  it('renders 🌊 Draft row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Draft|🌊/);
  });

  it('renders 🛡 Quality row', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/Quality|🛡/);
  });

  it('uses distanceNm, sailingDays, arrivalDate for transit chain', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/distanceNm/);
    expect(src).toMatch(/sailingDays/);
    expect(src).toMatch(/arrivalDate/);
  });

  it('renders 🚢 Vessel column header', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/🚢.*Vessel/);
  });

  it('renders 📦 Cargo / Port column header', () => {
    const src = read(worksheetPath);
    expect(src).toMatch(/📦.*Cargo/);
  });
});

describe('app/match/[id]/page.tsx — MatchWorksheet integration', () => {
  it('imports MatchWorksheet component', () => {
    const src = read(pagePath);
    expect(src).toMatch(/import.*MatchWorksheet.*from/);
  });

  it('parses worksheet_json from storedMatch with try/catch', () => {
    const src = read(pagePath);
    expect(src).toMatch(/worksheet_json/);
    expect(src).toMatch(/JSON\.parse/);
    expect(src).toMatch(/try\s*\{|try\{/);
  });

  it('renders <MatchWorksheet worksheet={worksheet} />', () => {
    const src = read(pagePath);
    expect(src).toMatch(/<MatchWorksheet\s+worksheet=\{worksheet\}/);
  });

  it('MatchWorksheet appears before MatchTabs in source', () => {
    const src = read(pagePath);
    const wsIdx = src.indexOf('<MatchWorksheet');
    const tabsIdx = src.indexOf('<MatchTabs');
    expect(wsIdx).toBeGreaterThan(-1);
    expect(tabsIdx).toBeGreaterThan(-1);
    expect(wsIdx).toBeLessThan(tabsIdx);
  });
});
