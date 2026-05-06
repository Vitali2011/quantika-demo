/**
 * Validator for knowledge data files.
 * Usage: npx tsx scripts/knowledge/validate-data-files.ts ports
 */

import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'

// ── Schemas ──────────────────────────────────────────────────────────────────

const PortSchema = z.object({
  locode: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}$/, 'LOCODE must match [A-Z]{2}[A-Z0-9]{3}'),
  name: z.string().min(1),
  country: z.string().length(2),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  rank: z.number().int().min(1).max(200),
  category: z.enum(['container', 'bulk', 'tanker', 'mixed']),
})

export type Port = z.infer<typeof PortSchema>

const PortsArraySchema = z.array(PortSchema)

// ── Validator function ────────────────────────────────────────────────────────

export function validateTopPorts(json: unknown): {
  valid: boolean
  errors: string[]
  data?: Port[]
} {
  const result = PortsArraySchema.safeParse(json)

  if (!result.success) {
    const errors = result.error.errors.map(
      (e) => `[${e.path.join('.')}] ${e.message}`
    )
    return { valid: false, errors }
  }

  const data = result.data
  const errors: string[] = []

  // Exactly 200 entries
  if (data.length !== 200) {
    errors.push(`Expected 200 ports, got ${data.length}`)
  }

  // Unique LOCODEs
  const locodes = data.map((p) => p.locode)
  const uniqueLocodes = new Set(locodes)
  if (uniqueLocodes.size !== locodes.length) {
    const dupes = locodes.filter((l, i) => locodes.indexOf(l) !== i)
    errors.push(`Duplicate LOCODEs: ${[...new Set(dupes)].join(', ')}`)
  }

  // Unique ranks 1..200
  const ranks = data.map((p) => p.rank).sort((a, b) => a - b)
  const expectedRanks = Array.from({ length: 200 }, (_, i) => i + 1)
  const missingRanks = expectedRanks.filter((r) => !ranks.includes(r))
  if (missingRanks.length > 0) {
    errors.push(`Missing ranks: ${missingRanks.join(', ')}`)
  }
  const dupeRanks = ranks.filter((r, i) => ranks.indexOf(r) !== i)
  if (dupeRanks.length > 0) {
    errors.push(`Duplicate ranks: ${[...new Set(dupeRanks)].join(', ')}`)
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return { valid: true, errors: [], data }
}

// ── Regional distribution check ───────────────────────────────────────────────

const REGION_COUNTRIES: Record<string, string[]> = {
  asia: ['CN','HK','KR','JP','TW','VN','TH','MY','ID','PH','AU','NZ','BD','MM','LK','IN','PK','SG','PG','FJ'],
  mena: ['AE','SA','OM','KW','BH','QA','EG','IL','TR','IR','IQ','LB','JO','YE','DJ'],
  europe: ['NL','DE','BE','ES','IT','PL','RU','FI','SE','DK','NO','EE','GR','GB','FR','LT','UA','GE','PT','IE'],
  americas: ['US','PA','MX','BR','CL','AR','UY','PE','CO','VE','TT','JM','CA','PR','DO','GT','SV','HN','NI','CR'],
  africa: ['ZA','TZ','KE','NG','GH','CI','SN','MA','DZ','TN','AO','LY','ET','MZ'],
}

export function checkRegionalDistribution(data: Port[]): Record<string, number> {
  const counts: Record<string, number> = { asia: 0, mena: 0, europe: 0, americas: 0, africa: 0, other: 0 }
  for (const port of data) {
    let found = false
    for (const [region, countries] of Object.entries(REGION_COUNTRIES)) {
      if (countries.includes(port.country)) {
        counts[region]++
        found = true
        break
      }
    }
    if (!found) counts.other++
  }
  return counts
}

// ── CLI entry point ───────────────────────────────────────────────────────────

// Only run CLI logic when executed directly (not when imported by tests)
const isCLI = process.argv[1]?.includes('validate-data-files')

const command = isCLI ? process.argv[2] : undefined

if (isCLI && command === 'ports') {
  const filePath = path.join(process.cwd(), 'data', 'knowledge', 'top-200-ports.json')
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

  const result = validateTopPorts(raw)

  if (!result.valid) {
    console.error('FAIL: validation errors:')
    result.errors.forEach((e) => console.error(' -', e))
    process.exit(1)
  }

  const dist = checkRegionalDistribution(result.data!)
  const targets: Record<string, number> = { asia: 70, mena: 40, europe: 40, americas: 30, africa: 20 }
  const tolerance = 3
  const distErrors: string[] = []
  for (const [region, count] of Object.entries(dist)) {
    if (region === 'other' && count > 0) {
      distErrors.push(`${count} ports unclassified by region`)
      continue
    }
    if (region === 'other') continue
    const target = targets[region]
    if (Math.abs(count - target) > tolerance) {
      distErrors.push(`${region}: ${count} (target ${target} ±${tolerance})`)
    }
  }

  if (distErrors.length > 0) {
    console.error('FAIL: regional distribution out of bounds:')
    distErrors.forEach((e) => console.error(' -', e))
    process.exit(1)
  }

  console.log(`OK: 200 ports, LOCODEs valid, ranks 1-200 unique`)
  console.log(`Distribution: ${JSON.stringify(dist)}`)
} else if (isCLI) {
  console.log('Usage: npx tsx scripts/knowledge/validate-data-files.ts ports')
}
