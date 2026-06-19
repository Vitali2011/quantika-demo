import { checkLOA, runHardFilters, type HardFilterInput } from '../match-filters';

// Task #8 — LOA-под-причал berth gate, mirror of checkDraft.
// Sfax (TNSFA) has maxLOA 180m in port-master.json.

describe('checkLOA', () => {
  it('fails when vessel LOA exceeds the port berth max', () => {
    const r = checkLOA('Sfax', 185);
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/LOA/i);
  });

  it('passes when vessel LOA fits the port berth max', () => {
    expect(checkLOA('Sfax', 150).pass).toBe(true);
  });

  it('graceful pass: unknown port', () => {
    expect(checkLOA('Atlantis', 250).pass).toBe(true);
  });

  it('graceful pass: vessel LOA unknown', () => {
    expect(checkLOA('Sfax', null).pass).toBe(true);
  });

  it('graceful pass: port without maxLOA (Black Sea backfill pending)', () => {
    expect(checkLOA('Odesa', 250).pass).toBe(true);
  });
});

function baseInput(over: Partial<HardFilterInput> = {}): HardFilterInput {
  return {
    cargoType: 'BULK',
    originPort: 'Sfax',
    destinationPort: null,
    weightMt: null,
    cargoDescription: null,
    stowageFactor: null,
    vesselType: 'bulk',
    geared: null,
    draftMax: null,
    grainCapacity: null,
    dwtSummer: null,
    dwcc: null,
    ...over,
  };
}

describe('runHardFilters — LOA berth gate', () => {
  it('demotes a pair whose vessel LOA exceeds the origin port berth max', () => {
    const r = runHardFilters(baseInput({ originPort: 'Sfax', vesselLoa: 200 }));
    expect(r.checks.loaBerth?.pass).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.failures.some((f) => /LOA/i.test(f))).toBe(true);
  });

  it('passes a vessel that fits the berth LOA', () => {
    const r = runHardFilters(baseInput({ originPort: 'Sfax', vesselLoa: 150 }));
    expect(r.checks.loaBerth?.pass).toBe(true);
  });

  it('graceful pass when vessel LOA is unknown', () => {
    const r = runHardFilters(baseInput({ originPort: 'Sfax', vesselLoa: null }));
    expect(r.checks.loaBerth?.pass).toBe(true);
  });

  it('checks the destination port berth LOA too', () => {
    const r = runHardFilters(baseInput({ originPort: 'Odesa', destinationPort: 'Sfax', vesselLoa: 200 }));
    expect(r.checks.destLoaBerth?.pass).toBe(false);
    expect(r.pass).toBe(false);
  });
});
