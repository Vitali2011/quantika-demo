/**
 * β-15: in-memory draft queue for auto pre-quote pipeline.
 *
 * Storage is intentionally in-memory (per-process) — for demo/CI runs the
 * cron is single-shot and reads the queue immediately afterwards. For
 * persistence beyond demo, swap _store with a better-sqlite3-backed
 * adapter; the public API stays the same.
 *
 * The queue is the Plan-First gate's enforcement point: every draft is
 * created with status='awaiting_approval' and only transitions to
 * 'approved' / 'rejected' via approveDraft / rejectDraft.
 */

import { randomUUID } from 'node:crypto';

export type DraftStatus = 'awaiting_approval' | 'approved' | 'rejected';

export interface PendingEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
}

export interface QuoteDraftInput {
  emailId: string;
  vessel: string;
  freightUsd: number;
  summary: string;
}

export interface QuoteDraft extends QuoteDraftInput {
  id: string;
  status: DraftStatus;
  createdAt: string;
  rejectReason?: string;
}

// ---- in-memory store ----
const _store: Map<string, QuoteDraft> = new Map();

// ---- pluggable hooks (test seams) ----
export type EmailFetcher = () => Promise<PendingEmail[]>;
export type QuoteDrafter = (e: PendingEmail) => Promise<QuoteDraftInput>;

let _emailFetcher: EmailFetcher = async () => [];
let _quoteDrafter: QuoteDrafter = async (e) => ({
  emailId: e.id,
  vessel: 'TBD',
  freightUsd: 0,
  summary: `Auto-draft for ${e.subject}`,
});

export function setEmailFetcher(fn: EmailFetcher): void {
  _emailFetcher = fn;
}
export function setQuoteDrafter(fn: QuoteDrafter): void {
  _quoteDrafter = fn;
}
export function getEmailFetcher(): EmailFetcher {
  return _emailFetcher;
}
export function getQuoteDrafter(): QuoteDrafter {
  return _quoteDrafter;
}

export function _resetQueue(): void {
  _store.clear();
  _emailFetcher = async () => [];
  _quoteDrafter = async (e) => ({
    emailId: e.id,
    vessel: 'TBD',
    freightUsd: 0,
    summary: `Auto-draft for ${e.subject}`,
  });
}

// ---- CRUD ----
export function enqueueDraft(input: QuoteDraftInput): QuoteDraft {
  const draft: QuoteDraft = {
    id: randomUUID(),
    status: 'awaiting_approval',
    createdAt: new Date().toISOString(),
    ...input,
  };
  _store.set(draft.id, draft);
  return draft;
}

export function listPendingDrafts(): QuoteDraft[] {
  return Array.from(_store.values()).filter((d) => d.status === 'awaiting_approval');
}

export function getDraft(id: string): QuoteDraft | undefined {
  return _store.get(id);
}

export function approveDraft(id: string): QuoteDraft {
  const d = _store.get(id);
  if (!d) throw new Error(`approveDraft: draft ${id} not found`);
  d.status = 'approved';
  _store.set(id, d);
  return d;
}

export function rejectDraft(id: string, reason: string): QuoteDraft {
  const d = _store.get(id);
  if (!d) throw new Error(`rejectDraft: draft ${id} not found`);
  d.status = 'rejected';
  d.rejectReason = reason;
  _store.set(id, d);
  return d;
}

export function countAwaitingApproval(): number {
  return listPendingDrafts().length;
}
