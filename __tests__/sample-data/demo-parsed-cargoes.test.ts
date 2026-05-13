/**
 * wave-γ-3-demo: unit tests for resolveDemoParsedCargoes loader.
 * wave-γ-1.5-A: extended with tests for resolveDemoClassifications,
 *               resolveDemoParsedVessels, resolveDemoProcessedEmails.
 *
 * Tests:
 * 1. date resolution: +Nd offsets → ISO dates based on `now`
 * 2. schema parity: all returned records satisfy ParsedCargo shape
 * 3. no mutation of the fixture JSON
 * 4. classifications: 32 records, correct categories
 * 5. parsedVessels: 9 records, openDate resolved relative to `now`
 * 6. processedEmails: delegates to buildProcessedEmails, correct emailIds
 */

import {
  resolveDemoParsedCargoes,
  resolveDemoClassifications,
  resolveDemoParsedVessels,
  resolveDemoProcessedEmails,
} from '@/lib/sample-data/demo-parsed-cargoes';
import type { ParsedCargo } from '@/lib/types';

const NOW = new Date('2026-05-10T00:00:00.000Z');

describe('resolveDemoParsedCargoes — date resolution', () => {
  it('returns an array of records for every cargo-inquiry email (sample-01..12) plus demo fixtures', () => {
    const result = resolveDemoParsedCargoes(NOW);
    expect(result.length).toBeGreaterThanOrEqual(4);
    // spec-03 adds demo-cargo-economics, so upper bound is 13
    expect(result.length).toBeLessThanOrEqual(13);
  });

  it('resolves +Nd offsets to ISO date strings relative to now', () => {
    const result = resolveDemoParsedCargoes(NOW);
    // Every record with a non-null laycan must have dates >= now (it's laycan start,
    // should be future relative to seed time)
    for (const cargo of result) {
      if (cargo.laycan !== null) {
        // laycan format: "YYYY-MM-DD .. YYYY-MM-DD"
        expect(cargo.laycan).toMatch(/^\d{4}-\d{2}-\d{2} \.\. \d{4}-\d{2}-\d{2}$/);
        const [startStr, endStr] = cargo.laycan.split(' .. ');
        const start = new Date(startStr);
        const end = new Date(endStr);
        expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
        // Start should be at or after NOW
        expect(start.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      }
    }
  });

  it('uses the provided now date, not the current date', () => {
    const now1 = new Date('2026-05-10T00:00:00.000Z');
    const now2 = new Date('2026-06-01T00:00:00.000Z');
    const result1 = resolveDemoParsedCargoes(now1);
    const result2 = resolveDemoParsedCargoes(now2);

    // Laycans should differ when seed date differs
    const laycans1 = result1.map(c => c.laycan).filter(Boolean);
    const laycans2 = result2.map(c => c.laycan).filter(Boolean);
    expect(laycans1).not.toEqual(laycans2);
  });

  it('does not mutate the fixture JSON between calls', () => {
    const result1 = resolveDemoParsedCargoes(NOW);
    const result2 = resolveDemoParsedCargoes(NOW);
    // Both calls return the same resolved dates
    expect(result1.map(c => c.laycan)).toEqual(result2.map(c => c.laycan));
  });
});

describe('resolveDemoParsedCargoes — schema parity with ParsedCargo', () => {
  let result: ParsedCargo[];

  beforeAll(() => {
    result = resolveDemoParsedCargoes(NOW);
  });

  it('each record has required string fields: emailId, itemIndex, cargoType', () => {
    for (const cargo of result) {
      expect(typeof cargo.emailId).toBe('string');
      expect(cargo.emailId.length).toBeGreaterThan(0);
      expect(typeof cargo.itemIndex).toBe('number');
      expect(typeof cargo.cargoType).toBe('string');
    }
  });

  it('each record has missingInfo as an array', () => {
    for (const cargo of result) {
      expect(Array.isArray(cargo.missingInfo)).toBe(true);
    }
  });

  it('each emailId matches a real cargo-inquiry ID (sample-01 through sample-12) or a demo fixture ID', () => {
    const validIds = new Set([
      'sample-01', 'sample-02', 'sample-03', 'sample-04', 'sample-05',
      'sample-06', 'sample-07', 'sample-08', 'sample-09', 'sample-10',
      'sample-11', 'sample-12',
      // spec-03: guaranteed demo match fixture
      'demo-cargo-economics',
    ]);
    for (const cargo of result) {
      expect(validIds.has(cargo.emailId)).toBe(true);
    }
  });

  it('cargoType is a valid CargoType enum value', () => {
    const validTypes = new Set(['FCL', 'LCL', 'BREAK_BULK', 'BULK', 'PROJECT', 'AIR', 'RORO', 'OTHER']);
    for (const cargo of result) {
      expect(validTypes.has(cargo.cargoType)).toBe(true);
    }
  });
});

// ── wave-γ-1.5-A: resolveDemoClassifications ─────────────────────────────────

describe('resolveDemoClassifications — 32 records, correct schema', () => {
  it('returns exactly 32 Classification records (one per sample email)', () => {
    const result = resolveDemoClassifications();
    expect(result).toHaveLength(32);
  });

  it('sample-01 is classified as CARGO_INQUIRY', () => {
    const result = resolveDemoClassifications();
    const c = result.find(r => r.emailId === 'sample-01');
    expect(c).toBeDefined();
    expect(c!.category).toBe('CARGO_INQUIRY');
  });

  it('sample-13 is classified as VESSEL_POSITION', () => {
    const result = resolveDemoClassifications();
    const c = result.find(r => r.emailId === 'sample-13');
    expect(c).toBeDefined();
    expect(c!.category).toBe('VESSEL_POSITION');
  });

  it('sample-21 is classified as FIXTURE_RECAP', () => {
    const result = resolveDemoClassifications();
    const c = result.find(r => r.emailId === 'sample-21');
    expect(c).toBeDefined();
    expect(c!.category).toBe('FIXTURE_RECAP');
  });

  it('sample-32 is classified as VESSEL_CERTIFICATE', () => {
    const result = resolveDemoClassifications();
    const c = result.find(r => r.emailId === 'sample-32');
    expect(c).toBeDefined();
    expect(c!.category).toBe('VESSEL_CERTIFICATE');
  });

  it('all records have confidence of 1.0', () => {
    const result = resolveDemoClassifications();
    for (const c of result) {
      expect(c.confidence).toBe(1.0);
    }
  });

  it('all emailIds are unique (no duplicate emailId entries)', () => {
    const result = resolveDemoClassifications();
    const ids = result.map(c => c.emailId);
    const unique = new Set(ids);
    expect(unique.size).toBe(32);
  });

  it('category values are valid EmailCategory enum values', () => {
    const valid = new Set(['CARGO_INQUIRY', 'VESSEL_POSITION', 'FIXTURE_RECAP', 'CLIENT_REPLY', 'DOCUMENT', 'TCT_REQUEST', 'VESSEL_CERTIFICATE', 'OTHER']);
    const result = resolveDemoClassifications();
    for (const c of result) {
      expect(valid.has(c.category)).toBe(true);
    }
  });

  it('does not mutate the fixture JSON between calls', () => {
    const r1 = resolveDemoClassifications();
    const r2 = resolveDemoClassifications();
    expect(r1).toEqual(r2);
  });
});

// ── wave-γ-1.5-A: resolveDemoParsedVessels ────────────────────────────────────

describe('resolveDemoParsedVessels — date resolution and schema', () => {
  const NOW = new Date('2026-05-10T00:00:00.000Z');

  it('returns exactly 10 ParsedVessel records (8 emails, sample-16 has 2 vessels, plus demo-vessel-economics)', () => {
    const result = resolveDemoParsedVessels(NOW);
    expect(result).toHaveLength(10);
  });

  it('sample-13 vessel (CARPATHIAN STAR) has correct vesselName and IMO', () => {
    const result = resolveDemoParsedVessels(NOW);
    const v = result.find(r => r.emailId === 'sample-13' && r.itemIndex === 0);
    expect(v).toBeDefined();
    expect(v!.vesselName).toEqual({ value: 'CARPATHIAN STAR', confidence: 'confirmed' });
    expect(v!.imo).toBe('9234563');
  });

  it('sample-16 has two vessels (ATLAS itemIndex=0 and ZEUS itemIndex=1)', () => {
    const result = resolveDemoParsedVessels(NOW);
    const atlas = result.find(r => r.emailId === 'sample-16' && r.itemIndex === 0);
    const zeus = result.find(r => r.emailId === 'sample-16' && r.itemIndex === 1);
    expect(atlas).toBeDefined();
    expect(zeus).toBeDefined();
    expect(atlas!.vesselName!.value).toBe('ATLAS');
    expect(zeus!.vesselName!.value).toBe('ZEUS');
  });

  it('openDate is resolved to an absolute ISO date string', () => {
    const result = resolveDemoParsedVessels(NOW);
    for (const v of result) {
      if (v.openDate !== null) {
        expect(v.openDate.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(v.openDate.value).getTime()).toBeGreaterThanOrEqual(NOW.getTime());
      }
    }
  });

  it('sample-20 (CARBON LADY) has ciiRating D', () => {
    const result = resolveDemoParsedVessels(NOW);
    const v = result.find(r => r.emailId === 'sample-20');
    expect(v).toBeDefined();
    expect(v!.ciiRating).toBe('D');
  });

  it('uses the provided now date for openDate resolution', () => {
    const now1 = new Date('2026-05-10T00:00:00.000Z');
    const now2 = new Date('2026-06-01T00:00:00.000Z');
    const r1 = resolveDemoParsedVessels(now1);
    const r2 = resolveDemoParsedVessels(now2);
    // openDate values should differ
    const dates1 = r1.map(v => v.openDate?.value).filter(Boolean);
    const dates2 = r2.map(v => v.openDate?.value).filter(Boolean);
    expect(dates1).not.toEqual(dates2);
  });
});

// ── wave-γ-1.5-A: resolveDemoProcessedEmails ─────────────────────────────────

describe('resolveDemoProcessedEmails — delegates to buildProcessedEmails', () => {
  const NOW = new Date('2026-05-10T00:00:00.000Z');

  function makeSampleEmail(id: string) {
    return {
      id,
      threadId: `thread-${id}`,
      from: `sender@example.com`,
      fromName: 'Sender',
      fromEmail: 'sender@example.com',
      to: 'broker@example.com',
      subject: `Subject for ${id}`,
      date: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      body: '',
      snippet: '',
      labelIds: ['INBOX'],
    };
  }

  const SAMPLE_IDS = Array.from({ length: 32 }, (_, i) => `sample-${String(i + 1).padStart(2, '0')}`);
  const emails = SAMPLE_IDS.map(makeSampleEmail);

  it('returns exactly 32 ProcessedEmail records (one per classification)', () => {
    const result = resolveDemoProcessedEmails(NOW, emails);
    expect(result).toHaveLength(32);
  });

  it('sample-01 processedEmail has type CARGO_INQUIRY', () => {
    const result = resolveDemoProcessedEmails(NOW, emails);
    const pe = result.find(p => p.emailId === 'sample-01');
    expect(pe).toBeDefined();
    expect(pe!.type).toBe('CARGO_INQUIRY');
  });

  it('sample-01 processedEmail has expirySource of laycan (cargo has laycan field)', () => {
    const result = resolveDemoProcessedEmails(NOW, emails);
    const pe = result.find(p => p.emailId === 'sample-01');
    expect(pe).toBeDefined();
    // calculateExpiry returns 'laycan' as source when laycan string is present on parsedCargo
    expect(pe!.expirySource).toBe('laycan');
  });

  it('all returned emailIds match the 32 classification emailIds', () => {
    const result = resolveDemoProcessedEmails(NOW, emails);
    const classificationIds = new Set(resolveDemoClassifications().map(c => c.emailId));
    for (const pe of result) {
      expect(classificationIds.has(pe.emailId)).toBe(true);
    }
  });
});
