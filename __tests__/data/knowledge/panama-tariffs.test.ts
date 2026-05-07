import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

interface TariffEntry {
  vessel_type: string
  billing_unit: string
  base_fee_usd: number | null
  per_nt_fee_usd: number | null
  confidence: 'high' | 'medium' | 'low' | 'needs-vitali-input'
  notes: string
}

interface PanamaTariffs {
  version: string
  effective_from: string
  frozen_until?: string
  source_url: string
  fetched_at: string
  tariffs: TariffEntry[]
  metadata: {
    drought_surcharge_pct: number
    auction_slot_premium: string
    toll_freeze?: string
  }
}

const TARIFF_FILE = path.resolve(__dirname, '../../../data/knowledge/panama/tariffs-2026-current.yaml')
const ARCHIVE_FILE = path.resolve(__dirname, '../../../data/knowledge/panama/tariffs-2025.yaml')

describe('panama tariffs-2026-current.yaml', () => {
  let data: PanamaTariffs

  beforeAll(() => {
    const raw = fs.readFileSync(TARIFF_FILE, 'utf-8')
    data = yaml.load(raw) as PanamaTariffs
  })

  it('file exists and parses as valid YAML', () => {
    expect(data).toBeDefined()
    expect(typeof data).toBe('object')
  })

  it('has required top-level fields', () => {
    expect(data.version).toBeTruthy()
    expect(data.effective_from).toBeTruthy()
    expect(data.source_url).toBeTruthy()
    expect(data.fetched_at).toBe('2026-05-06')
    expect(data.tariffs).toBeInstanceOf(Array)
    expect(data.metadata).toBeDefined()
  })

  it('effective_from is >= 2025-10-01', () => {
    const effectiveDate = new Date(data.effective_from)
    const minDate = new Date('2025-01-01')
    expect(effectiveDate.getTime()).toBeGreaterThanOrEqual(minDate.getTime())
  })

  it('has at least 6 vessel types', () => {
    expect(data.tariffs.length).toBeGreaterThanOrEqual(6)
  })

  it('includes required vessel types: bulker, tanker, container, LNG, LPG, general, passenger', () => {
    const types = data.tariffs.map((t) => t.vessel_type)
    for (const required of ['bulker', 'tanker', 'container', 'LNG', 'LPG', 'general', 'passenger']) {
      expect(types).toContain(required)
    }
  })

  it('all non-passenger entries have base_fee_usd > 0', () => {
    const nonPassenger = data.tariffs.filter((t) => t.vessel_type !== 'passenger')
    for (const entry of nonPassenger) {
      expect(entry.base_fee_usd).toBeGreaterThan(0)
    }
  })

  it('all non-passenger entries have per_nt_fee_usd > 0', () => {
    const nonPassenger = data.tariffs.filter((t) => t.vessel_type !== 'passenger')
    for (const entry of nonPassenger) {
      expect(entry.per_nt_fee_usd).toBeGreaterThan(0)
    }
  })

  it('all entries have a confidence field', () => {
    const validLevels = ['high', 'medium', 'low', 'needs-vitali-input']
    for (const entry of data.tariffs) {
      expect(validLevels).toContain(entry.confidence)
    }
  })

  it('all entries have a billing_unit field', () => {
    for (const entry of data.tariffs) {
      expect(entry.billing_unit).toBeTruthy()
    }
  })

  it('all entries have a notes field', () => {
    for (const entry of data.tariffs) {
      expect(entry.notes).toBeTruthy()
    }
  })

  it('bulker per_nt_fee_usd matches known DWT rate $1.65', () => {
    const bulker = data.tariffs.find((t) => t.vessel_type === 'bulker')
    expect(bulker).toBeDefined()
    expect(bulker!.per_nt_fee_usd).toBe(1.65)
  })

  it('LNG and LPG use m3 billing unit', () => {
    const lng = data.tariffs.find((t) => t.vessel_type === 'LNG')
    const lpg = data.tariffs.find((t) => t.vessel_type === 'LPG')
    expect(lng!.billing_unit).toBe('m3')
    expect(lpg!.billing_unit).toBe('m3')
  })

  it('metadata has drought_surcharge_pct', () => {
    expect(typeof data.metadata.drought_surcharge_pct).toBe('number')
  })

  it('archive file tariffs-2025.yaml still exists (not deleted)', () => {
    expect(fs.existsSync(ARCHIVE_FILE)).toBe(true)
  })

  it('version string contains 2026', () => {
    expect(data.version).toContain('2026')
  })
})
