// scripts/demo-seed/manifest-schema.ts
import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const OffsetEntrySchema = z.object({
  offsetDays: z.number().int(),
  rationale: z.string(),
  shifted_fields: z.array(z.string()),
});

export const AnonymizationSchema = z.object({
  vessels: z.record(z.string()),
  charterers: z.record(z.string()),
  brokers: z.record(z.string()),
  sender_emails: z.record(z.string()),
});

export const ManifestSchema = z.object({
  schema_version: z.literal(1),
  generated_at: z.string().datetime(),
  raw_emails_dir: z.string(),
  raw_emails_count: z.number().int().nonnegative(),
  frozenDate: IsoDate,
  demo_window_days: z.number().int().positive(),
  offsets: z.record(OffsetEntrySchema),
  anonymization: AnonymizationSchema,
  stats: z.object({
    active_laycans_after_shift: z.number().int().nonnegative(),
    stale_laycans_after_shift: z.number().int().nonnegative(),
    anonymization_unknowns: z.array(z.string()),
  }),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type OffsetEntry = z.infer<typeof OffsetEntrySchema>;
