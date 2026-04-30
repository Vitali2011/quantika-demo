/**
 * Demo scenario fixtures for brokers — 10 canonical cases that exercise
 * Wave-1/2/3 features end-to-end. Each scenario is a self-contained
 * (cargo, vessel, expected-outcome) triple suitable for read-only fixture
 * tests and for in-session "Try a scenario" walkthroughs.
 *
 * Wave-1 features: hard filters (draft/crane/volume/cargo-vessel), IMO
 * validation, date sanity, stale position.
 * Wave-2: confidence calibration + source traceability.
 * Wave-3: Equasis verification, sanctions screening.
 */
import type { ParsedCargo, ParsedVessel } from '@/lib/types';

export type ExpectedOutcome =
  | { kind: 'filtered_out'; reasonMatches: RegExp }
  | { kind: 'match'; minScore?: number; level?: 'good' | 'possible' | 'weak'; mustContainIssue?: RegExp }
  | { kind: 'warning_only'; warningMatches: RegExp };

export interface DemoScenario {
  id: string;
  title: string;
  narrative: string;
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  expectedOutcome: ExpectedOutcome;
}

import s01 from './01-karasu-mykolaiv-idle.json';
import s05 from './05-ru-flag-mykolaiv-sanctioned.json';
import s08 from './08-inverted-laycan-rejected.json';
import s11 from './11-suez-vs-cape-decision.json';
import s15 from './15-counterparty-news-hit.json';

/**
 * Load demo scenarios (V2 minimal corpus — 5 canonical cases covering
 * Wave α/β/γ acceptance: idle vessel, sanctioned cargo, inverted laycan,
 * Suez-vs-Cape routing, counterparty news hit).
 *
 * Materialises JSON fixtures into typed objects with real RegExps
 * reassembled from string form.
 */
export function loadDemoScenarios(): DemoScenario[] {
  const raws = [s01, s05, s08, s11, s15];
  return raws.map(raw => reviveScenario(raw as unknown as RawScenario));
}

interface RawScenario {
  id: string;
  title: string;
  narrative: string;
  cargo: ParsedCargo;
  vessel: ParsedVessel;
  expectedOutcome:
    | { kind: 'filtered_out'; reasonMatches: string }
    | { kind: 'match'; minScore?: number; level?: 'good' | 'possible' | 'weak'; mustContainIssue?: string }
    | { kind: 'warning_only'; warningMatches: string };
}

function reviveScenario(raw: RawScenario): DemoScenario {
  const eo = raw.expectedOutcome;
  let outcome: ExpectedOutcome;
  if (eo.kind === 'filtered_out') {
    outcome = { kind: 'filtered_out', reasonMatches: new RegExp(eo.reasonMatches, 'i') };
  } else if (eo.kind === 'warning_only') {
    outcome = { kind: 'warning_only', warningMatches: new RegExp(eo.warningMatches, 'i') };
  } else {
    outcome = {
      kind: 'match',
      minScore: eo.minScore,
      level: eo.level,
      mustContainIssue: eo.mustContainIssue ? new RegExp(eo.mustContainIssue, 'i') : undefined,
    };
  }
  return {
    id: raw.id,
    title: raw.title,
    narrative: raw.narrative,
    cargo: raw.cargo,
    vessel: raw.vessel,
    expectedOutcome: outcome,
  };
}
