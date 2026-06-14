/** @jest-environment jsdom */
/**
 * Behavioral regression — dashboard KPI count must equal rendered list length.
 *
 * Divergence bug: the "open matches" KPI used countQualifyingMatches (deduped DB
 * rows, fit>=60) while the lists below it used session.matches filtered by
 * session-time matchLevel (not deduped, not re-checked against the re-patched DB
 * fit_percent). So a "possible" match that re-patched below 60, or a duplicate
 * row, made headline N != list M.
 *
 * Fix: both surfaces derive from deriveDashboardSurfaces -> listQualifyingMatches
 * (one deduped, fit>=60 source). This test pins: a session whose re-patch crosses
 * the 60 boundary AND contains a duplicate => KPI count === rendered list length.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Database from 'better-sqlite3';
import migration032 from '@/lib/migrations/032-matches';
import migration033 from '@/lib/migrations/033-matches-score-breakdown';
import migration034 from '@/lib/migrations/034-matches-unique-constraint';
import migration035 from '@/lib/migrations/035-matches-tce-distance';
import migration036 from '@/lib/migrations/036-matches-freight-rate';
import migration041 from '@/lib/migrations/041-matches-vessel-name';
import migration042 from '@/lib/migrations/042-matches-fit';
import { createMatch } from '@/lib/matching/matches-repository';
import { countQualifyingMatches } from '@/lib/matching/count-qualifying';
import { deriveDashboardSurfaces } from '@/lib/matching/dashboard-surfaces';
import { DashboardFreshMatches } from '@/components/dashboard/DashboardFreshMatches';
import type { Match } from '@/lib/types';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  for (const m of [migration032, migration033, migration034, migration035, migration036, migration041, migration042]) {
    m.up(db);
  }
  return db;
}

// Minimal session Match for enrichment — only the fields deriveDashboardSurfaces reads.
function sessionMatch(over: Partial<Match> & { cargoEmailId: string; vesselEmailId: string }): Match {
  return {
    cargoItemIndex: 0,
    vesselItemIndex: 0,
    matchLevel: 'possible',
    matchReasons: ['session reason'],
    score: 80,
    ...over,
  } as unknown as Match;
}

const USER = 'sess-1';

it('KPI count equals rendered list length when a re-patch crosses 60 AND a duplicate exists', () => {
  const db = freshDb();

  // (A) Duplicate pair: two DB rows sharing the dedup key (vessel/cargo/port/laycan),
  // both fit>=60 -> dedup collapses to ONE qualifying row.
  createMatch(db, {
    cargo_id: 'cA1', vessel_id: 'vA1', score: 82, reason: 'dup A', user_id: USER,
    fit_percent: 75, vessel_name: 'MV ALPHA', cargo_ref: 'GRAIN-1', load_port: 'UAODS', laycan_start: 1748908800000,
  });
  createMatch(db, {
    cargo_id: 'cA2', vessel_id: 'vA2', score: 80, reason: 'dup A', user_id: USER,
    fit_percent: 70, vessel_name: 'MV ALPHA', cargo_ref: 'GRAIN-1', load_port: 'UAODS', laycan_start: 1748908800000,
  });

  // (B) Boundary cross: labelled "possible" at session time, but re-patch dropped
  // its DB fit_percent to 58 (<60) -> must be excluded from BOTH count and list.
  createMatch(db, {
    cargo_id: 'cB', vessel_id: 'vB', score: 64, reason: 'dropped below 60', user_id: USER,
    fit_percent: 58, vessel_name: 'MV BETA', cargo_ref: 'COAL-9', load_port: 'AUPHE', laycan_start: 1749000000000,
  });

  // (C) A normal qualifying row.
  createMatch(db, {
    cargo_id: 'cC', vessel_id: 'vC', score: 90, reason: 'clean match', user_id: USER,
    fit_percent: 88, vessel_name: 'MV GAMMA', cargo_ref: 'IRON-3', load_port: 'BRTUB', laycan_start: 1749100000000,
  });

  const sessionMatches: Match[] = [
    sessionMatch({ cargoEmailId: 'cA1', vesselEmailId: 'vA1', matchLevel: 'good' }),
    sessionMatch({ cargoEmailId: 'cA2', vesselEmailId: 'vA2', matchLevel: 'good' }),
    sessionMatch({ cargoEmailId: 'cB', vesselEmailId: 'vB', matchLevel: 'possible' }), // session says possible — but DB says <60
    sessionMatch({ cargoEmailId: 'cC', vesselEmailId: 'vC', matchLevel: 'good' }),
  ];

  const kpiCount = countQualifyingMatches(db, { user_id: USER });
  const { openMatchCount, priorityCards, freshMatchesData } = deriveDashboardSurfaces(db, sessionMatches, USER);

  // dedup collapses A1/A2 -> 1; B excluded (<60); C -> 1 ==> 2 qualifying.
  expect(kpiCount).toBe(2);
  expect(openMatchCount).toBe(kpiCount);

  // Both lists are exactly the qualifying set — count === list length (the invariant).
  expect(freshMatchesData).toHaveLength(openMatchCount);
  expect(priorityCards).toHaveLength(openMatchCount);

  // The dropped (<60) row appears in NEITHER surface.
  expect(freshMatchesData.some((m) => m.matchReasons.includes('dropped below 60'))).toBe(false);

  // Render the actual list component — rendered rows === headline count.
  render(<DashboardFreshMatches matches={freshMatchesData} />);
  const renderedLinks = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/match/'));
  expect(renderedLinks).toHaveLength(openMatchCount);
});
