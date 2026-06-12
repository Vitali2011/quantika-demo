// audit D — buildVesselPassport: real passport from parsed fields + local registries.
// Sync, no network/LLM. Replaces the old fake getVesselPassport (constants).
import Database from 'better-sqlite3';
import { buildVesselPassport } from '../counterparty';
import type { VesselPassport } from '../counterparty';
import migration028 from '../migrations/028-psc-history';
import { upsertInspection } from '../market/psc-repository';
import type { ParsedVessel } from '../types';

const REF_YEAR = 2026;

const vessel = (overrides: Partial<ParsedVessel> = {}): ParsedVessel =>
  ({
    imo: '8887296',
    flag: 'Malta',
    classSociety: 'DNV',
    pandi: 'Gard',
    built: 2008,
    restrictions: [],
    specialFeatures: [],
    ...overrides,
  } as unknown as ParsedVessel);

describe('buildVesselPassport (audit D)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migration028.up(db);
  });

  afterEach(() => db.close());

  it('builds passport from parsed fields + local registries', () => {
    const p: VesselPassport = buildVesselPassport(db, vessel(), REF_YEAR);
    expect(p.imo).toBe('8887296');
    expect(p.flag).toEqual({ country: 'Malta', parisMou: 'white' });
    expect(p.class).toEqual({ society: 'DNV', isIacs: true });
    expect(p.pi).toEqual({ club: 'Gard', isIg: true });
    expect(p.age).toBe(REF_YEAR - 2008);
  });

  it('vessel without imo → psc undefined, no crash', () => {
    const p = buildVesselPassport(db, vessel({ imo: null }), REF_YEAR);
    expect(p.imo).toBeUndefined();
    expect(p.psc).toBeUndefined();
    expect(p.flag?.country).toBe('Malta');
  });

  it('no PSC rows for imo → psc undefined (NOT {detentions3y: 0}) — wave-A honest semantics', () => {
    const p = buildVesselPassport(db, vessel(), REF_YEAR);
    expect(p.psc).toBeUndefined();
  });

  it('PSC rows exist → detentions3y = detention count over 3y window', () => {
    // 2 detentions inside the window, 1 outside, 1 clean inspection inside
    upsertInspection(db, { id: 'i1', imo: '8887296', inspection_date: '2024-06-01', port: 'Hamburg', authority: 'paris-mou', deficiencies: 5, detained: true, source_url: null });
    upsertInspection(db, { id: 'i2', imo: '8887296', inspection_date: '2025-01-15', port: 'Rotterdam', authority: 'paris-mou', deficiencies: 3, detained: true, source_url: null });
    upsertInspection(db, { id: 'i3', imo: '8887296', inspection_date: '2020-03-01', port: 'Antwerp', authority: 'paris-mou', deficiencies: 7, detained: true, source_url: null });
    upsertInspection(db, { id: 'i4', imo: '8887296', inspection_date: '2025-05-05', port: 'Gdansk', authority: 'paris-mou', deficiencies: 0, detained: false, source_url: null });

    const p = buildVesselPassport(db, vessel(), REF_YEAR);
    expect(p.psc).toEqual({ detentions3y: 2 });
  });

  it('clean inspections only → psc present with detentions3y 0 (data exists, honest zero)', () => {
    upsertInspection(db, { id: 'i1', imo: '8887296', inspection_date: '2025-05-05', port: 'Gdansk', authority: 'paris-mou', deficiencies: 0, detained: false, source_url: null });
    const p = buildVesselPassport(db, vessel(), REF_YEAR);
    expect(p.psc).toEqual({ detentions3y: 0 });
  });

  it('null classSociety/pandi/flag/built → fields omitted, never fake defaults', () => {
    const p = buildVesselPassport(
      db,
      vessel({ flag: null, classSociety: null, pandi: null, built: null }),
      REF_YEAR,
    );
    expect(p.flag).toBeUndefined();
    expect(p.class).toBeUndefined();
    expect(p.pi).toBeUndefined();
    expect(p.age).toBeUndefined();
    // no fake constants from the old stub
    expect(JSON.stringify(p)).not.toContain('Bahamas');
  });

  it('unknown Paris MoU flag → parisMou omitted, country kept', () => {
    const p = buildVesselPassport(db, vessel({ flag: 'Atlantis' }), REF_YEAR);
    expect(p.flag).toEqual({ country: 'Atlantis' });
  });

  it('sanctions and shadowFleet are NOT fabricated (no sync local source)', () => {
    const p = buildVesselPassport(db, vessel(), REF_YEAR);
    expect(p.sanctions).toBeUndefined();
    expect(p.shadowFleet).toBeUndefined();
  });
});
