import { getStore } from './session-store';

export interface TrialState {
  session_id: string;
  started_at: string;
  ends_at: string;
  activated_at: string | null;
  region: string;
  demo_seeded: boolean;
}

type TrialRegion = 'MENA' | 'Med' | 'WAFR';

const TRIAL_DAYS = 14;

function toTrialState(row: {
  session_id: string;
  started_at: string;
  ends_at: string;
  activated_at: string | null;
  region: string;
  demo_seeded: number;
}): TrialState {
  return {
    session_id: row.session_id,
    started_at: row.started_at,
    ends_at: row.ends_at,
    activated_at: row.activated_at,
    region: row.region,
    demo_seeded: row.demo_seeded === 1,
  };
}

export async function startTrial(sessionId: string, region: TrialRegion): Promise<TrialState> {
  const db = getStore().getDatabase();
  const now = new Date();
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  db.prepare(
    'INSERT OR REPLACE INTO trial_state (session_id, started_at, ends_at, region) VALUES (?, ?, ?, ?)'
  ).run(sessionId, now.toISOString(), endsAt.toISOString(), region);

  return {
    session_id: sessionId,
    started_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    activated_at: null,
    region,
    demo_seeded: false,
  };
}

export async function getTrialState(sessionId: string): Promise<TrialState | null> {
  const db = getStore().getDatabase();
  const row = db.prepare<[string], {
    session_id: string;
    started_at: string;
    ends_at: string;
    activated_at: string | null;
    region: string;
    demo_seeded: number;
  }>('SELECT * FROM trial_state WHERE session_id = ?').get(sessionId);

  if (!row) return null;
  return toTrialState(row);
}

export async function markActivated(sessionId: string): Promise<void> {
  const db = getStore().getDatabase();
  db.prepare(
    'UPDATE trial_state SET activated_at = ? WHERE session_id = ?'
  ).run(new Date().toISOString(), sessionId);
}

export function daysRemaining(trial: TrialState): number {
  const now = Date.now();
  const ends = new Date(trial.ends_at).getTime();
  const diff = ends - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function isExpired(trial: TrialState): boolean {
  return new Date(trial.ends_at).getTime() < Date.now();
}
