// scripts/demo-seed/__tests__/manifest-schema.test.ts
import { ManifestSchema } from '../manifest-schema';

describe('ManifestSchema', () => {
  const valid = {
    schema_version: 1,
    generated_at: '2026-05-27T10:00:00.000Z',
    raw_emails_dir: '.private/raw-emails',
    raw_emails_count: 153,
    frozenDate: '2026-05-20',
    demo_window_days: 14,
    offsets: {
      'abc123': { offsetDays: -42, rationale: 'test', shifted_fields: ['email.date'] },
    },
    anonymization: {
      vessels: { 'M/V REAL': 'M/V FAKE 1' },
      charterers: {},
      brokers: {},
      sender_emails: {},
    },
    stats: { active_laycans_after_shift: 100, stale_laycans_after_shift: 5, anonymization_unknowns: [] },
  };

  it('accepts valid manifest', () => {
    expect(() => ManifestSchema.parse(valid)).not.toThrow();
  });

  it('rejects missing frozenDate', () => {
    const bad = { ...valid, frozenDate: undefined };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('rejects offsetDays as string', () => {
    const bad = { ...valid, offsets: { 'x': { offsetDays: '5', rationale: '', shifted_fields: [] } } };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('rejects frozenDate not in YYYY-MM-DD shape', () => {
    expect(() => ManifestSchema.parse({ ...valid, frozenDate: '2026/05/20' })).toThrow();
  });
});
