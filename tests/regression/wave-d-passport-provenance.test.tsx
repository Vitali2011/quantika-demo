/**
 * @jest-environment jsdom
 *
 * test-skill adversarial regression — wave D (feat/wave-d-revive-cleanup @ 7bb062ec)
 * Classes: displayed-value-provenance + conditional-ui-liveness (principle #8).
 * Targets: buildVesselPassport feed edges + VesselPassportPanel field bindings.
 * Invariants (plan T5): no fake defaults; psc undefined vs honest 0;
 * page must not 500 on db/data edges.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Database from 'better-sqlite3';
import { buildVesselPassport } from '@/lib/counterparty';
import { VesselPassportPanel } from '@/components/vessel/VesselPassportPanel';
import migration028 from '@/lib/migrations/028-psc-history';
import { upsertInspection } from '@/lib/market/psc-repository';
import type { ParsedVessel } from '@/lib/types';

const REF_YEAR = 2026;
const v = (o: Partial<ParsedVessel> = {}): ParsedVessel =>
  ({ imo: '8887296', flag: 'Malta', classSociety: 'DNV', pandi: 'Gard', built: 2008, restrictions: [], specialFeatures: [], ...o } as unknown as ParsedVessel);

describe('buildVesselPassport — feed edges (no fake defaults, no crash)', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); migration028.up(db); });
  afterEach(() => db.close());

  it('empty-string imo → no psc lookup, no crash', () => {
    const p = buildVesselPassport(db, v({ imo: '' }), REF_YEAR);
    expect(p.imo).toBeUndefined();
    expect(p.psc).toBeUndefined();
  });

  it('built sanity floor: 1899 rejected, 1900 accepted', () => {
    expect(buildVesselPassport(db, v({ built: 1899 }), REF_YEAR).age).toBeUndefined();
    expect(buildVesselPassport(db, v({ built: 1900 }), REF_YEAR).age).toBe(REF_YEAR - 1900);
  });

  it('future built (negative age) omitted; current-year built → age 0', () => {
    expect(buildVesselPassport(db, v({ built: REF_YEAR + 1 }), REF_YEAR).age).toBeUndefined();
    expect(buildVesselPassport(db, v({ built: REF_YEAR }), REF_YEAR).age).toBe(0);
  });

  it('non-numeric built garbage (NaN) omitted, no crash', () => {
    const p = buildVesselPassport(db, v({ built: NaN as unknown as number }), REF_YEAR);
    expect(p.age).toBeUndefined();
  });

  it('detentions all OUTSIDE the 3y window but inspections exist → honest 0 (data present)', () => {
    upsertInspection(db, { id: 'old', imo: '8887296', inspection_date: '2019-01-01', port: 'X', authority: 'paris-mou', deficiencies: 9, detained: true, source_url: null });
    const p = buildVesselPassport(db, v(), REF_YEAR);
    expect(p.psc).toEqual({ detentions3y: 0 }); // has data → 0, NOT undefined
  });

  it('inspections for a DIFFERENT imo only → psc undefined for ours (per-imo feed)', () => {
    upsertInspection(db, { id: 'x', imo: '9999999', inspection_date: '2025-01-01', port: 'X', authority: 'paris-mou', deficiencies: 1, detained: true, source_url: null });
    const p = buildVesselPassport(db, v(), REF_YEAR);
    expect(p.psc).toBeUndefined();
  });

  it('sanctions / shadowFleet never fabricated by the builder', () => {
    const p = buildVesselPassport(db, v(), REF_YEAR);
    expect(p.sanctions).toBeUndefined();
    expect(p.shadowFleet).toBeUndefined();
  });
});

describe('VesselPassportPanel — exact field bindings (not just plausible numbers)', () => {
  it('binds passport.age, not built year', () => {
    render(<VesselPassportPanel passport={{ age: 18 }} />);
    expect(screen.getByText('18 yrs')).toBeInTheDocument();
    expect(screen.queryByText(/2008/)).not.toBeInTheDocument();
  });

  it('age 0 still renders (no falsy-skip bug)', () => {
    render(<VesselPassportPanel passport={{ age: 0 }} />);
    expect(screen.getByText('0 yrs')).toBeInTheDocument();
  });

  it('psc.detentions3y 0 renders the honest zero row', () => {
    render(<VesselPassportPanel passport={{ psc: { detentions3y: 0 } }} />);
    expect(screen.getByText('PSC detentions (3y)')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('empty passport renders NOTHING (no empty card shell)', () => {
    const { container } = render(<VesselPassportPanel passport={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('imo-only passport renders nothing (imo is not a displayable row)', () => {
    const { container } = render(<VesselPassportPanel passport={{ imo: '8887296' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('no sanctions row unless the builder ever sets it (dead-feed honesty: row absent, not "Clean")', () => {
    render(<VesselPassportPanel passport={{ flag: { country: 'Malta' } }} />);
    expect(screen.queryByText('Sanctions')).not.toBeInTheDocument();
    expect(screen.queryByText('Clean')).not.toBeInTheDocument();
  });

  it('Paris MoU badge binds flag.parisMou literally', () => {
    render(<VesselPassportPanel passport={{ flag: { country: 'Palau', parisMou: 'black' } }} />);
    expect(screen.getByText('Paris MoU: black')).toBeInTheDocument();
  });
});
