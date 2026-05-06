#!/usr/bin/env ts-node
/**
 * validate-data-files.ts
 * Minimal validator for knowledge data YAML files.
 * Run: npx ts-node scripts/knowledge/validate-data-files.ts
 */

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

interface ValidationResult {
  file: string
  ok: boolean
  errors: string[]
}

function validatePanamaTariffs2026(filePath: string): ValidationResult {
  const result: ValidationResult = { file: filePath, ok: true, errors: [] }

  if (!fs.existsSync(filePath)) {
    result.ok = false
    result.errors.push(`File not found: ${filePath}`)
    return result
  }

  let data: Record<string, unknown>
  try {
    data = yaml.load(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  } catch (e) {
    result.ok = false
    result.errors.push(`YAML parse error: ${e}`)
    return result
  }

  // Required top-level fields
  for (const field of ['version', 'effective_from', 'source_url', 'fetched_at', 'tariffs', 'metadata']) {
    if (!data[field]) {
      result.errors.push(`Missing required field: ${field}`)
    }
  }

  const tariffs = data['tariffs'] as Array<Record<string, unknown>>
  if (!Array.isArray(tariffs) || tariffs.length < 6) {
    result.errors.push(`Expected ≥6 vessel types, got ${Array.isArray(tariffs) ? tariffs.length : 0}`)
  }

  if (Array.isArray(tariffs)) {
    for (const t of tariffs) {
      if (!t.confidence) result.errors.push(`Missing confidence on vessel_type: ${t.vessel_type}`)
      if (!t.billing_unit) result.errors.push(`Missing billing_unit on vessel_type: ${t.vessel_type}`)
      if (t.vessel_type !== 'passenger') {
        if (typeof t.base_fee_usd !== 'number' || (t.base_fee_usd as number) <= 0) {
          result.errors.push(`base_fee_usd must be > 0 for: ${t.vessel_type}`)
        }
        if (typeof t.per_nt_fee_usd !== 'number' || (t.per_nt_fee_usd as number) <= 0) {
          result.errors.push(`per_nt_fee_usd must be > 0 for: ${t.vessel_type}`)
        }
      }
    }
  }

  result.ok = result.errors.length === 0
  return result
}

function main() {
  const root = path.resolve(__dirname, '../../')
  const checks: ValidationResult[] = [
    validatePanamaTariffs2026(path.join(root, 'data/knowledge/panama/tariffs-2026-current.yaml')),
  ]

  let allOk = true
  for (const r of checks) {
    if (r.ok) {
      console.log(`✓ ${r.file}`)
    } else {
      allOk = false
      console.error(`✗ ${r.file}`)
      for (const e of r.errors) console.error(`  - ${e}`)
    }
  }

  process.exit(allOk ? 0 : 1)
}

main()
