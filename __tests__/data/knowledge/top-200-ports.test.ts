import portsData from '../../../data/knowledge/top-200-ports.json'
import { validateTopPorts, checkRegionalDistribution, type Port } from '../../../scripts/knowledge/validate-data-files'

describe('top-200-ports.json', () => {
  let ports: Port[]

  beforeAll(() => {
    const result = validateTopPorts(portsData)
    if (!result.valid) {
      throw new Error('Schema validation failed:\n' + result.errors.join('\n'))
    }
    ports = result.data!
  })

  it('contains exactly 200 ports', () => {
    expect(ports).toHaveLength(200)
  })

  it('all ports have required fields', () => {
    for (const port of ports) {
      expect(port).toHaveProperty('locode')
      expect(port).toHaveProperty('name')
      expect(port).toHaveProperty('country')
      expect(port).toHaveProperty('lat')
      expect(port).toHaveProperty('lon')
      expect(port).toHaveProperty('rank')
      expect(port).toHaveProperty('category')
    }
  })

  it('all LOCODEs are 5 chars matching [A-Z]{2}[A-Z0-9]{3}', () => {
    for (const port of ports) {
      expect(port.locode).toMatch(/^[A-Z]{2}[A-Z0-9]{3}$/)
    }
  })

  it('all LOCODEs are unique', () => {
    const locodes = ports.map((p) => p.locode)
    expect(new Set(locodes).size).toBe(200)
  })

  it('ranks are unique integers from 1 to 200', () => {
    const ranks = ports.map((p) => p.rank).sort((a, b) => a - b)
    expect(ranks).toEqual(Array.from({ length: 200 }, (_, i) => i + 1))
  })

  it('lat is within [-90, 90]', () => {
    for (const port of ports) {
      expect(port.lat).toBeGreaterThanOrEqual(-90)
      expect(port.lat).toBeLessThanOrEqual(90)
    }
  })

  it('lon is within [-180, 180]', () => {
    for (const port of ports) {
      expect(port.lon).toBeGreaterThanOrEqual(-180)
      expect(port.lon).toBeLessThanOrEqual(180)
    }
  })

  it('category is one of container | bulk | tanker | mixed', () => {
    const valid = new Set(['container', 'bulk', 'tanker', 'mixed'])
    for (const port of ports) {
      expect(valid.has(port.category)).toBe(true)
    }
  })

  it('country is 2-char ISO code', () => {
    for (const port of ports) {
      expect(port.country).toMatch(/^[A-Z]{2}$/)
    }
  })

  describe('regional distribution (±3 tolerance)', () => {
    const TARGETS: Record<string, number> = {
      asia: 70,
      mena: 40,
      europe: 40,
      americas: 30,
      africa: 20,
    }
    const TOLERANCE = 3
    let dist: Record<string, number>

    beforeAll(() => {
      dist = checkRegionalDistribution(ports)
    })

    for (const [region, target] of Object.entries(TARGETS)) {
      it(`${region}: ~${target} (±${TOLERANCE})`, () => {
        expect(dist[region]).toBeGreaterThanOrEqual(target - TOLERANCE)
        expect(dist[region]).toBeLessThanOrEqual(target + TOLERANCE)
      })
    }

    it('no unclassified ports', () => {
      expect(dist.other ?? 0).toBe(0)
    })
  })

  it('schema rejects invalid LOCODE (negative test)', () => {
    const bad = [{ locode: 'SAJIZAN', name: 'Jizan', country: 'SA', lat: 16.89, lon: 42.55, rank: 1, category: 'mixed' }]
    const result = validateTopPorts(bad)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('LOCODE'))).toBe(true)
  })
})
