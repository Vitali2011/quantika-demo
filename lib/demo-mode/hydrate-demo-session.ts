import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import { updateSession } from '@/lib/session';
import { buildProcessedEmails } from '@/lib/classification-service';
import { deriveMatchLevel } from '@/lib/sailing/match-scoring';
import { deleteOrphanSessionMatches } from '@/lib/matching/matches-repository';
import { logger } from '@/lib/logger';
import type {
  Email, Classification, ParsedCargo, ParsedVessel, ParsedFixtureRecap, Match, ScoreBreakdown, SessionData,
} from '@/lib/types';

type DemoBlob = Pick<
  SessionData,
  'emails' | 'classifications' | 'parsedCargos' | 'parsedVessels'
  | 'parsedFixtureRecaps' | 'processedEmails' | 'matches' | 'isSampleData' | 'accountId'
  | 'lowConfidenceMatches' | 'insufficientData'
>;

interface EmailRow {
  gmail_message_id: string; thread_id: string; from_addr: string; from_name: string | null;
  from_email: string | null; to_addr: string; subject: string; date: string;
  body: string; snippet: string; label_ids: string | null;
}
interface ParsedRow { parse_type: string; result_json: string; }
interface MatchRow {
  cargo_id: string; vessel_id: string; score: number;
  reason: string | null; reason_structured: string | null;
  fit_percent: number | null; fit_breakdown: string | null;
}

function safeJsonArray<T>(json: string, ctx: string): T[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch (err) {
    logger.warn({ err, ctx }, 'demo hydrate: bad result_json, skipping row');
    return [];
  }
}

function safeJsonObject<T>(json: string | null): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

export function buildDemoSessionBlob(db: Database.Database): DemoBlob {
  const emailRows = db.prepare(
    `SELECT gmail_message_id, thread_id, from_addr, from_name, from_email,
            to_addr, subject, date, body, snippet, label_ids FROM emails`,
  ).all() as EmailRow[];

  const emails: Email[] = emailRows.map((r) => ({
    id: r.gmail_message_id,
    threadId: r.thread_id,
    from: r.from_addr,
    fromName: r.from_name,
    fromEmail: r.from_email,
    to: r.to_addr,
    subject: r.subject,
    date: r.date,
    body: r.body,
    snippet: r.snippet,
    labelIds: r.label_ids ? safeJsonArray<string>(r.label_ids, 'label_ids') : [],
  }));

  const parsedRows = db.prepare(
    `SELECT parse_type, result_json FROM parsed_results`,
  ).all() as ParsedRow[];

  const parsedCargos: ParsedCargo[] = [];
  const parsedVessels: ParsedVessel[] = [];
  const parsedFixtureRecaps: ParsedFixtureRecap[] = [];
  const classifications: Classification[] = [];
  for (const row of parsedRows) {
    switch (row.parse_type) {
      case 'cargo': parsedCargos.push(...safeJsonArray<ParsedCargo>(row.result_json, 'cargo')); break;
      case 'vessel': parsedVessels.push(...safeJsonArray<ParsedVessel>(row.result_json, 'vessel')); break;
      case 'recap': parsedFixtureRecaps.push(...safeJsonArray<ParsedFixtureRecap>(row.result_json, 'recap')); break;
      case 'classify': classifications.push(...safeJsonArray<Classification>(row.result_json, 'classify')); break;
    }
  }

  const hasFitCols = (db.prepare(`PRAGMA table_info(matches)`).all() as Array<{name:string}>).some(c => c.name === 'fit_percent');
  const selectCols = hasFitCols
    ? 'cargo_id, vessel_id, score, reason, reason_structured, fit_percent, fit_breakdown'
    : 'cargo_id, vessel_id, score, reason, reason_structured, NULL as fit_percent, NULL as fit_breakdown';

  // Only the seeded snapshot rows (user_id IS NULL). Per-session copies that
  // persistSessionMatches writes (user_id = sessionId) must NOT be re-read here,
  // or the demo's match set would grow/duplicate with every login.
  const matchRows = db.prepare(
    `SELECT ${selectCols} FROM matches WHERE user_id IS NULL`,
  ).all() as MatchRow[];

  // Realism buckets seeded by real-matches.ts (sentinel user_ids preserved
  // by deleteOrphanSessionMatches). Hydrated into session so /matches bucket
  // tabs are non-empty on first login without triggering LLM scoring.
  const reviewRows = db.prepare(
    `SELECT ${selectCols} FROM matches WHERE user_id = '__demo_review__'`,
  ).all() as MatchRow[];
  const insufficientRows = db.prepare(
    `SELECT ${selectCols} FROM matches WHERE user_id = '__demo_insufficient__'`,
  ).all() as MatchRow[];

  function rowsToMatches(rows: MatchRow[]): Match[] {
    return rows.map((r) => ({
      cargoEmailId: r.cargo_id,
      cargoItemIndex: 0,
      vesselEmailId: r.vessel_id,
      vesselItemIndex: 0,
      score: r.score,
      matchLevel: deriveMatchLevel(r.score),
      matchReasons: r.reason ? [r.reason] : [],
      issues: [],
      scoreBreakdown: safeJsonObject<ScoreBreakdown>(r.reason_structured),
      fitPercent: r.fit_percent ?? undefined,
      fitBreakdown: safeJsonObject<import('@/lib/types').FitBreakdown>(r.fit_breakdown),
    }));
  }

  const matches = rowsToMatches(matchRows);
  const lowConfidenceMatches = rowsToMatches(reviewRows);
  const insufficientData = rowsToMatches(insufficientRows);

  const processedEmails = buildProcessedEmails(emails, classifications, parsedCargos, parsedVessels);

  return {
    emails,
    classifications,
    parsedCargos,
    parsedVessels,
    parsedFixtureRecaps,
    processedEmails,
    matches,
    lowConfidenceMatches,
    insufficientData,
    isSampleData: true,
    accountId: 'demo',
  };
}

export function hydrateDemoSession(sessionId: string): void {
  const db = getStore().getDatabase();
  // Prune per-session match copies left by sessions that have ended. persistSessionMatches
  // writes ~436 copies (user_id = sessionId) on every /dashboard and /matches render; nothing
  // removes them when the session expires, so demo-seed.db grows ~436 rows per login. This
  // keeps the table bounded to live sessions and, after deploy, clears the accumulated bloat
  // on the first logins. Seeded rows (user_id IS NULL) — which buildDemoSessionBlob reads —
  // are authoritative and never touched.
  deleteOrphanSessionMatches(db);
  const blob = buildDemoSessionBlob(db);
  if (blob.emails.length === 0) {
    logger.warn({ sessionId }, 'demo hydrate: 0 emails — demo-seed.db may be empty/incomplete');
  }
  updateSession(sessionId, blob);
}
