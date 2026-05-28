import { analyze } from '../analyze';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../../../__tests__/fixtures/demo-seed');

describe('analyze (Phase 0)', () => {
  it('reads all fixture emails', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(m.raw_emails_count).toBe(5);
    expect(Object.keys(m.offsets)).toHaveLength(5);
  });

  it('produces ManifestSchema-valid output', async () => {
    const { ManifestSchema } = await import('../manifest-schema');
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(() => ManifestSchema.parse(m)).not.toThrow();
  });

  it('is deterministic — same input → same output', async () => {
    const m1 = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    const m2 = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // Strip generated_at (the only non-deterministic field)
    const norm = (m: typeof m1) => ({ ...m, generated_at: 'FIXED' });
    expect(norm(m1)).toEqual(norm(m2));
  });

  it('extracts laycan_start/end for cargo emails', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // fixture-001 (threadId fixture001aabbcc1122): CARGO ENQUIRY with LAYCAN: 15-20 April 2026
    const entry = m.offsets['fixture001aabbcc1122'];
    expect(entry).toBeDefined();
    expect(entry.shifted_fields).toEqual(
      expect.arrayContaining(['email.date', 'laycan_start', 'laycan_end'])
    );
    expect(entry.rationale).toMatch(/laycan/i);
  });

  it('extracts open_date for vessel emails', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // fixture-003 (threadId fixture003aabbcc5566): VESSEL OPEN with OPEN DATE: 28 April 2026
    const entry = m.offsets['fixture003aabbcc5566'];
    expect(entry).toBeDefined();
    expect(entry.shifted_fields).toEqual(
      expect.arrayContaining(['email.date', 'open_date'])
    );
    expect(entry.rationale).toMatch(/open_date/i);
  });

  it('builds anonymization map for vessels/charterers/brokers/senders', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    expect(m.anonymization.vessels).toBeDefined();
    expect(m.anonymization.charterers).toBeDefined();
    expect(m.anonymization.brokers).toBeDefined();
    expect(m.anonymization.sender_emails).toBeDefined();
  });

  it('preserves pre-existing anonymization mappings (additive)', async () => {
    const seed = {
      vessels: { 'M/V REAL ONE': 'M/V SEAGULL 1' },
      charterers: {}, brokers: {}, sender_emails: {},
    };
    const m = await analyze({
      rawDir: FIXTURES,
      frozenDate: '2026-05-20',
      demoWindowDays: 14,
      seedAnonymization: seed,
    });
    expect(m.anonymization.vessels['M/V REAL ONE']).toBe('M/V SEAGULL 1');
  });

  it('extracts broker name from Gmail From header into anonymization map', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // Fixtures use "DEMO BROKER" as From name
    expect(m.anonymization.brokers).toHaveProperty('DEMO BROKER');
    expect(m.anonymization.brokers['DEMO BROKER']).toMatch(/^BROKER \d+$/);
  });

  it('extracts vessel names from body via regex', async () => {
    const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
    // Fixture email-003 body/subject contains "M/V FIXTURE WIND"
    const vesselKeys = Object.keys(m.anonymization.vessels);
    expect(vesselKeys.some(k => /FIXTURE WIND/i.test(k))).toBe(true);
  });

  it('honors seedAnonymization passed in (reconcile pseudonyms win)', async () => {
    const seeded = {
      vessels: { 'M/V SPRING WIND': 'M/V SEAGULL 1' },
      charterers: {},
      brokers: {},
      sender_emails: {},
    };
    const m = await analyze({
      rawDir: FIXTURES,
      frozenDate: '2026-05-20',
      demoWindowDays: 14,
      seedAnonymization: seeded,
    });
    expect(m.anonymization.vessels['M/V SPRING WIND']).toBe('M/V SEAGULL 1');
  });
});

describe('analyze with LLM cache', () => {
  // Lazily import to avoid loading llm-cache helpers during regex-path tests
  // (those tests run in CI where the cache file is never present).
  const fs = require('fs') as typeof import('fs');
  const { writeCache, corpusHash } = require('../llm-cache') as typeof import('../llm-cache');

  function readFixtureEmailIds(): string[] {
    return fs
      .readdirSync(FIXTURES)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => {
        const raw = JSON.parse(fs.readFileSync(`${FIXTURES}/${f}`, 'utf8'));
        return raw.messages?.[0]?.id ?? raw.id ?? f.replace('.json', '');
      });
  }

  it('rationales contain "cache:" prefix when LLM cache is present', async () => {
    const hash = corpusHash(FIXTURES);
    const ids = readFixtureEmailIds();
    const cache = {
      corpusHash: hash,
      generatedAt: '2026-05-27T20:00:00.000Z',
      classifications: ids.map((id: string) => ({
        emailId: id,
        category: 'CARGO_INQUIRY',
        isUnanswered: false,
        urgency: 'normal',
        daysWithoutReply: null,
        confidence: 1,
        originalSender: null,
        originalSenderCompany: null,
      })),
      parsedCargos: [],
      parsedVessels: [],
      parsedFixtureRecaps: [],
    };
    writeCache(FIXTURES, cache as unknown as import('../llm-cache').LlmCache);
    try {
      const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
      const rationales = Object.values(m.offsets).map((o) => o.rationale).join('|');
      expect(rationales).toMatch(/cache:/);
    } finally {
      fs.unlinkSync(`${FIXTURES}/.llm-cache/${hash}.json`);
      fs.rmdirSync(`${FIXTURES}/.llm-cache`);
    }
  });

  it('pulls laycan from cache.parsedCargos when present', async () => {
    const hash = corpusHash(FIXTURES);
    const ids = readFixtureEmailIds();
    const firstId = ids[0];
    const cache = {
      corpusHash: hash,
      generatedAt: '2026-05-27T20:00:00.000Z',
      classifications: [{
        emailId: firstId,
        category: 'CARGO_INQUIRY',
        isUnanswered: false,
        urgency: 'normal',
        daysWithoutReply: null,
        confidence: 1,
        originalSender: null,
        originalSenderCompany: null,
      }],
      parsedCargos: [{ emailId: firstId, itemIndex: 0, laycan: '10-15 May 2026' }],
      parsedVessels: [],
      parsedFixtureRecaps: [],
    };
    writeCache(FIXTURES, cache as unknown as import('../llm-cache').LlmCache);
    try {
      const m = await analyze({ rawDir: FIXTURES, frozenDate: '2026-05-20', demoWindowDays: 14 });
      // The threadId for firstId — find it via offsets values that mention laycan midpoint
      const matchingEntry = Object.values(m.offsets).find((o) =>
        /cache: laycan midpoint/.test(o.rationale),
      );
      expect(matchingEntry).toBeDefined();
      expect(matchingEntry!.shifted_fields).toEqual(
        expect.arrayContaining(['laycan_start', 'laycan_end']),
      );
    } finally {
      fs.unlinkSync(`${FIXTURES}/.llm-cache/${hash}.json`);
      fs.rmdirSync(`${FIXTURES}/.llm-cache`);
    }
  });
});
