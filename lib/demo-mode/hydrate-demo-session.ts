import type Database from 'better-sqlite3';
import { getStore } from '@/lib/session-store';
import { updateSession } from '@/lib/session';
import { buildProcessedEmails } from '@/lib/classification-service';
import { deriveMatchLevel } from '@/lib/sailing/match-scoring';
import { logger } from '@/lib/logger';
import type {
  Email, Classification, ParsedCargo, ParsedVessel, ParsedFixtureRecap, Match, ScoreBreakdown, SessionData,
} from '@/lib/types';

type DemoBlob = Pick<
  SessionData,
  'emails' | 'classifications' | 'parsedCargos' | 'parsedVessels'
  | 'parsedFixtureRecaps' | 'processedEmails' | 'matches' | 'isSampleData' | 'accountId'
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

  const matchRows = db.prepare(
    // Only the seeded snapshot rows (user_id IS NULL). Per-session copies that
    // persistSessionMatches writes (user_id = sessionId) must NOT be re-read here,
    // or the demo's match set would grow/duplicate with every login.
    `SELECT cargo_id, vessel_id, score, reason, reason_structured FROM matches WHERE user_id IS NULL`,
  ).all() as MatchRow[];

  const matches: Match[] = matchRows.map((r) => ({
    cargoEmailId: r.cargo_id,
    cargoItemIndex: 0,
    vesselEmailId: r.vessel_id,
    vesselItemIndex: 0,
    score: r.score,
    matchLevel: deriveMatchLevel(r.score),
    matchReasons: r.reason ? [r.reason] : [],
    issues: [],
    scoreBreakdown: safeJsonObject<ScoreBreakdown>(r.reason_structured),
  }));

  const processedEmails = buildProcessedEmails(emails, classifications, parsedCargos, parsedVessels);

  return {
    emails,
    classifications,
    parsedCargos,
    parsedVessels,
    parsedFixtureRecaps,
    processedEmails,
    matches,
    isSampleData: true,
    accountId: 'demo',
  };
}

export function hydrateDemoSession(sessionId: string): void {
  const db = getStore().getDatabase();
  const blob = buildDemoSessionBlob(db);
  if (blob.emails.length === 0) {
    logger.warn({ sessionId }, 'demo hydrate: 0 emails — demo-seed.db may be empty/incomplete');
  }
  updateSession(sessionId, blob);
}
