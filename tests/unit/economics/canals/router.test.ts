/**
 * TDD tests for canal router (lib/economics/canals/index.ts)
 *
 * Input Contract:
 *   unknown canalCode → throw Error('Unknown canal code: ...')
 *   empty/falsy canalCode → throw Error
 *   valid codes → dispatches to correct module
 */

import Database from 'better-sqlite3';
import { _setCanalDb } from '@/lib/economics/canals/db';
import { quoteCanal } from '@/lib/economics/canals/index';
import * as suezModule from '@/lib/economics/canals/suez';
import { makeTestDb } from '../../../helpers/canal-db';

let db: Database.Database;

beforeAll(() => {
  db = makeTestDb();
  _setCanalDb(db);
});

afterAll(() => {
  _setCanalDb(null);
  db.close();
});

const suezInput = { vesselDwt: 70000, vesselNt: 35000, vesselType: 'bulker' as const, laden: true };
const otherInput = { vesselDwt: 70000, vesselNt: 35000, vesselType: 'bulker' as const };

// ── Unknown canal code ───────────────────────────────────────────────────────

describe('unknown canal code', () => {
  it('throws for unknown string', () => {
    expect(() => quoteCanal('xyz' as 'suez', suezInput)).toThrow(/Unknown canal/i);
  });

  it('throws for empty string', () => {
    expect(() => quoteCanal('' as 'suez', suezInput)).toThrow(/Unknown canal/i);
  });
});

// ── Routing to correct module ────────────────────────────────────────────────
// Verify routing by checking module-specific fields in the returned quote.

describe('routes to correct canal module', () => {
  it('routes suez → result has Suez-specific scnt and tier fields', () => {
    const result = quoteCanal('suez', suezInput) as ReturnType<typeof suezModule.quoteSuez>;
    expect(result).toHaveProperty('scnt');
    expect(result).toHaveProperty('tier');
    expect(result.source).toMatch(/sca/i);
  });

  it('routes panama → result uses acp source', () => {
    const result = quoteCanal('panama', otherInput);
    expect(result.source).toMatch(/acp/i);
  });

  it('routes kiel → result uses kiel source', () => {
    const result = quoteCanal('kiel', otherInput);
    expect(result.source).toMatch(/kiel/i);
  });

  it('routes bosporus → result uses bosporus source', () => {
    const result = quoteCanal('bosporus', otherInput);
    expect(result.source).toMatch(/bosporus/i);
  });
});

// ── Return type structure ────────────────────────────────────────────────────

describe('return value shape', () => {
  it('suez result has totalUsd, baseFeeUsd, warRiskUsd, source', () => {
    const result = quoteCanal('suez', suezInput);
    expect(typeof result.totalUsd).toBe('number');
    expect(typeof result.baseFeeUsd).toBe('number');
    expect(typeof result.warRiskUsd).toBe('number');
    expect(typeof result.source).toBe('string');
  });

  it('panama result has totalUsd >= 0', () => {
    const result = quoteCanal('panama', otherInput);
    expect(result.totalUsd).toBeGreaterThanOrEqual(0);
  });

  it('kiel result has totalUsd >= 0', () => {
    const result = quoteCanal('kiel', otherInput);
    expect(result.totalUsd).toBeGreaterThanOrEqual(0);
  });

  it('bosporus result has totalUsd >= 0', () => {
    const result = quoteCanal('bosporus', otherInput);
    expect(result.totalUsd).toBeGreaterThanOrEqual(0);
  });
});
