/**
 * Regression test for F8: MENA seed produces 0 matches.
 *
 * Root cause: filterByRegion used the same port-name pattern for both cargo inquiries
 * and vessel positions. MENA cargo loads in Turkey/Egypt, but vessels are open in
 * Med/Black Sea ports — those port names don't appear in the MENA pattern.
 * Result: MENA demo seeded 13 cargoes but only 1 vessel, producing zero matches.
 *
 * Fix: separate CARGO_REGION_PORTS and VESSEL_REGION_PORTS patterns so vessels
 * with Med/Black Sea open positions are included for the MENA region demo.
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Path helpers ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SAMPLE_DIR = path.join(REPO_ROOT, 'lib/sample-data');

interface SampleEmail {
  id: string;
  body: string;
  subject: string;
}

function loadSample(filename: string): SampleEmail[] {
  const p = path.join(SAMPLE_DIR, filename);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as SampleEmail[];
}

// ── Replicate seed filter logic (mirrors demo-seed.ts after fix) ──────────────

const CARGO_REGION_PORTS: Record<string, RegExp> = {
  MENA: /Derince|Iskenderun|Mersin|Kastanpole|Alexandria|Port Said|Turkey|Egypt/i,
  Med: /Castellon|Tarragona|Barcelona|Genoa|Ravenna|Piraeus|Constanta|Tunis|Beirut|Casablanca|Greece|Spain|Italy|Romania/i,
  WAFR: /Lagos|Tema|Abidjan|Dakar|Nigeria|Ghana|Senegal|C.te d.Ivoire|WAfrica/i,
};

const VESSEL_REGION_PORTS: Record<string, RegExp> = {
  MENA: /Piraeus|Constanta|Casablanca|Ravenna|Genoa|Algeciras|Hamburg|Rotterdam|Antwerp|Dakar|Odesa|Alexandria|Turkey|Egypt|Med|Black Sea|East Med|MENA|Red Sea/i,
  Med: /Castellon|Tarragona|Barcelona|Genoa|Ravenna|Piraeus|Constanta|Tunis|Beirut|Casablanca|Greece|Spain|Italy|Romania|Med|Black Sea/i,
  WAFR: /Lagos|Tema|Abidjan|Dakar|Nigeria|Ghana|Senegal|C.te d.Ivoire|WAfrica|Abidjan|Ivory Coast/i,
};

function filterCargo(emails: SampleEmail[], region: string): SampleEmail[] {
  const pat = CARGO_REGION_PORTS[region];
  return emails.filter((e) => pat.test(e.body) || pat.test(e.subject));
}

function filterVessels(emails: SampleEmail[], region: string): SampleEmail[] {
  const pat = VESSEL_REGION_PORTS[region];
  return emails.filter((e) => pat.test(e.body) || pat.test(e.subject));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F8 regression: MENA demo seed vessel filter', () => {
  const cargoes = loadSample('cargo-inquiries.json');
  const vessels = loadSample('vessel-positions.json');

  it('sample data files exist and are non-empty', () => {
    expect(cargoes.length).toBeGreaterThan(0);
    expect(vessels.length).toBeGreaterThan(0);
  });

  it('MENA cargo filter returns ≥10 cargo inquiries', () => {
    const filtered = filterCargo(cargoes, 'MENA');
    expect(filtered.length).toBeGreaterThanOrEqual(10);
  });

  it('MENA vessel filter (fixed) returns ≥5 vessels — not just 1', () => {
    const filtered = filterVessels(vessels, 'MENA');
    // Before fix: 1 vessel (only MV NILE CARRIER which mentions Alexandria).
    // After fix: Med/Black Sea vessels are included because they can ballast to Turkey/Egypt.
    expect(filtered.length).toBeGreaterThanOrEqual(5);
  });

  it('MENA vessel filter includes Med-based vessels that can serve Turkey/Egypt routes', () => {
    const filtered = filterVessels(vessels, 'MENA');
    const ids = filtered.map((v) => v.id);
    // MV SESTRI MARIS is open Piraeus — should be included for MENA (can ballast to Derince)
    expect(ids).toContain('sample-26');
    // MV BLACK SEA TRADER is open Constanta — should be included (Black Sea → Turkey is nearby)
    expect(ids).toContain('sample-27');
  });

  it('MENA vessel filter excludes West Africa-only vessels', () => {
    const filtered = filterVessels(vessels, 'MENA');
    const ids = filtered.map((v) => v.id);
    // MV MERIDIAN BULK open Takoradi (Ghana) with no Med preference — should NOT be included
    expect(ids).not.toContain('sample-37');
  });

  it('MENA produces enough cargo×vessel pairs to enable matching (≥50 pairs)', () => {
    const filteredCargo = filterCargo(cargoes, 'MENA');
    const filteredVessels = filterVessels(vessels, 'MENA');
    const pairCount = filteredCargo.length * filteredVessels.length;
    // Before fix: 13×1=13 pairs with only 1 vessel having cargo restrictions
    // After fix: at least 13×5=65 pairs from Med-compatible vessels
    expect(pairCount).toBeGreaterThanOrEqual(50);
  });

  describe('old (broken) filter would have produced insufficient pairs', () => {
    // Confirm the OLD filter (using cargo pattern for vessels) gives only 1 vessel
    it('old MENA pattern on vessels returns only 1 vessel — confirming pre-fix state', () => {
      const oldVesselPat = CARGO_REGION_PORTS['MENA']; // the bug: same pattern for vessels
      const broken = vessels.filter((v) => oldVesselPat.test(v.body) || oldVesselPat.test(v.subject));
      expect(broken.length).toBe(1); // only MV NILE CARRIER (Alexandria is a MENA port)
    });

    it('old filter produced only 13×1=13 pairs — insufficient for realistic matching', () => {
      const oldVesselPat = CARGO_REGION_PORTS['MENA'];
      const brokenVessels = vessels.filter((v) => oldVesselPat.test(v.body) || oldVesselPat.test(v.subject));
      const filteredCargo = filterCargo(cargoes, 'MENA');
      const oldPairCount = filteredCargo.length * brokenVessels.length;
      // With 1 vessel that has cargo restrictions, the LLM would return 0 matches
      expect(oldPairCount).toBeLessThanOrEqual(13);
    });
  });

  describe('Med and WAFR regions still filter correctly', () => {
    it('Med cargo filter returns ≥5 inquiries', () => {
      expect(filterCargo(cargoes, 'Med').length).toBeGreaterThanOrEqual(5);
    });

    it('Med vessel filter returns ≥5 vessels', () => {
      expect(filterVessels(vessels, 'Med').length).toBeGreaterThanOrEqual(5);
    });

    it('WAFR cargo filter returns ≥5 inquiries', () => {
      expect(filterCargo(cargoes, 'WAFR').length).toBeGreaterThanOrEqual(5);
    });

    it('WAFR vessel filter returns ≥5 vessels', () => {
      expect(filterVessels(vessels, 'WAFR').length).toBeGreaterThanOrEqual(5);
    });
  });
});
