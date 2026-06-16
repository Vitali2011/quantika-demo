/**
 * Integrity tests for the CII static dataset (lib/sample-data/imo/cii.json).
 *
 * Honesty invariant: every demo-vessel rating we ADDED is a conservative age/type
 * ESTIMATE and must carry source:"estimated" + basis:"age/type". The 3 real demo
 * ratings (founder-confirmed) must stay real (no 'estimated' marker) and unchanged.
 */
import * as fs from 'fs';
import * as path from 'path';
import { estimateCiiByBuildYear } from '../cii-estimate';

interface CiiRecord {
  imo: string;
  rating: string;
  source?: string;
  basis?: string;
}

const dataset = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'lib/sample-data/imo/cii.json'), 'utf-8'),
) as { year: number; records: CiiRecord[] };

// Founder-confirmed REAL demo ratings — must be preserved as real (no 'estimated').
const REAL_DEMO = { '8887296': 'D', '9166510': 'E', '9238363': 'D' } as const;

// Demo vessels (imo → built) we fill with estimates. Mirrors demo-parsed-vessels.json.
const ESTIMATED_DEMO: Record<string, number> = {
  '8605480': 1986,
  '9701360': 2015,
  '9063873': 1993,
  '9145786': 1997,
  '9125073': 1997,
  '9367841': 2006,
  '9238351': 2001,
  '8834940': 1988,
  '9145360': 1996,
  '9554145': 2010,
  '9167320': 1997,
  '9111761': 1996,
  '8216100': 1987,
  '9381407': 2008,
  '1033822': 2020,
  '9013012': 1991,
  '9013036': 1991,
  '9103740': 1995,
  '9173331': 1999,
};

function find(imo: string): CiiRecord | undefined {
  return dataset.records.find((r) => r.imo === imo);
}

describe('cii.json — real demo ratings preserved', () => {
  for (const [imo, rating] of Object.entries(REAL_DEMO)) {
    it(`${imo} stays real ${rating} (no 'estimated' marker)`, () => {
      const rec = find(imo);
      expect(rec).toBeDefined();
      expect(rec!.rating).toBe(rating);
      expect(rec!.source).not.toBe('estimated');
      expect(rec!.basis).toBeUndefined();
    });
  }
});

describe('cii.json — estimated demo entries carry honesty markers', () => {
  for (const [imo, built] of Object.entries(ESTIMATED_DEMO)) {
    it(`${imo} present, source:"estimated", basis:"age/type"`, () => {
      const rec = find(imo);
      expect(rec).toBeDefined();
      expect(rec!.source).toBe('estimated');
      expect(rec!.basis).toBe('age/type');
    });

    it(`${imo} rating matches the deterministic rule for built ${built}`, () => {
      const rec = find(imo)!;
      expect(rec.rating).toBe(estimateCiiByBuildYear(built));
    });
  }

  it('every estimated entry has a valid C/D/E rating (never optimistic A/B)', () => {
    const estimated = dataset.records.filter((r) => r.source === 'estimated');
    expect(estimated.length).toBeGreaterThanOrEqual(19);
    for (const rec of estimated) {
      expect(['C', 'D', 'E']).toContain(rec.rating);
      expect(rec.basis).toBe('age/type');
    }
  });
});
