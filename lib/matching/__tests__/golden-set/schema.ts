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
      loadCountry: z.string().nullable().optional(),   // for trading-restriction gate (e.g. Ukraine, EU member)
      dischCountry: z.string().nullable().optional(),
      volumeCbm: z.number().nullable().optional(),     // cubic/stowage-factor overflow test (break-bulk/steel)
      stowageFactor: z.number().nullable().optional(),
      laycanStart: z.string(), laycanEnd: z.string(), sourceEmail: z.string(),
    }),
    vessel: z.object({
      name: z.string(), dwt: z.number().nullable(),
      dwccT: z.number().nullable().optional(),     // cargo capacity (weight-range vs capacity test)
      geared: z.boolean().optional(),              // has cranes (gear-gate for bagged/steel cargo)
      craneCapacityT: z.number().nullable().optional(),
      restrictions: z.array(z.string()).optional(),    // stated trading limits (e.g. "No Ukraine", "no EU") — restriction gate
      grainCapacityCbm: z.number().nullable().optional(), // cubic capacity for volume-fit
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
    // gates from the 3-round matching-principles research (see matching-principles-research.md)
    tradingRestrictionEnforced: z.boolean().optional(), // vessel's stated "no X" → must BLOCK a cargo to X
    volumeFits: z.boolean().optional(),                 // cargo cubic (vol/SF) must fit hold capacity, not just weight
    capacityWithinDwcc: z.boolean().optional(),         // qty (correct point of range) ≤ DWCC, voyage-adjusted
    spotNotIdealised: z.boolean().optional(),           // spot/prompt vessel w/o real position must not score as ideal
    portResolved: z.boolean().optional(),               // unknown port must flag, not score blind on null distance
    laycanFeasible: z.boolean().optional(),             // vessel can reach load port by cancelling date
    draftWithinPortLimit: z.boolean().optional(),       // laden draft/LOA must fit the disch port (e.g. panamax cannot enter Douala river)
  }),
  // assertion keys expected to STILL FAIL against the current engine (it.failing).
  // Keys: 'tceNeg' | 'block' | 'spot' | 'verdict' | 'distance' | 'speedEst'.
  // A gate present in engineMust but NOT listed here is asserted as a real (green) `it`
  // because the live engine already enforces it. Empirically set from the baseline run.
  xfail: z.array(z.string()).optional(),
  provenance: z.string(),
});

export type GoldenRecord = z.infer<typeof GoldenRecordSchema>;

export function parseGoldenRecord(x: unknown): GoldenRecord {
  return GoldenRecordSchema.parse(x);
}
