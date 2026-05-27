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
});
