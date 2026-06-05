// schema.ts — golden-record types + runtime validation (zod, already a project dep)
import { z } from 'zod';

const honesty = z.enum(['stated', 'DEFAULT', 'index', 'external', 'manual']);

const expectedNum = z.object({
  value: z.number(),
  toleranceAbs: z.number().optional(),
  tolerancePct: z.number().optional(),
  source: z.string(),
});

export const GoldenRecordSchema = z.object({
  id: z.string(),
  bugClass: z.string(),
  rationale: z.string(),
  control: z.boolean(),
  inputs: z.object({
    cargo: z.object({
      ref: z.string(), qtyT: z.number().nullable(),
      qtyMinT: z.number().nullable().optional(), qtyMaxT: z.number().nullable().optional(),
      cargoType: z.string().optional(),            // engine CargoType MODE: BULK|BREAK_BULK|FCL|… (commodity → cargoDescription, default BULK)
      loadPort: z.string(), dischPort: z.string(),
      laycanStart: z.string(), laycanEnd: z.string(), sourceEmail: z.string(),
    }),
    vessel: z.object({
      name: z.string(), dwt: z.number().nullable(),
      dwccT: z.number().nullable().optional(),     // cargo capacity (weight-range vs capacity test)
      geared: z.boolean().optional(),              // has cranes (gear-gate for bagged/steel cargo)
      craneCapacityT: z.number().nullable().optional(),
      speedKn: z.number().nullable(), consumptionT: z.number().nullable(),
      openPort: z.string(), openDate: z.string(), sourceEmail: z.string(),
    }),
  }),
  expected: z.object({
    weightT: expectedNum,
    distanceNm: expectedNum,
    tcePerDay: expectedNum,
  }),
  inputHonesty: z.object({
    speedKn: honesty, consumptionT: honesty, freightRate: honesty, bunkerPrice: honesty,
  }),
  engineMust: z.object({
    speedNotDefaulted: z.boolean().optional(),
    speedMarkedEst: z.boolean().optional(),
    portFeesNonzero: z.boolean().optional(),
    tceSign: z.enum(['positive', 'negative']).optional(),
    verdictNotGood: z.boolean().optional(),
    weightNotMax: z.boolean().optional(),
  }),
  provenance: z.string(),
});

export type GoldenRecord = z.infer<typeof GoldenRecordSchema>;

export function parseGoldenRecord(x: unknown): GoldenRecord {
  return GoldenRecordSchema.parse(x);
}
