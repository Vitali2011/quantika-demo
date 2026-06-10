# Draft-Quote Background Workshop (claude-cli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the partner-facing "unexpected end of JSON input" error on the Generate Quote button, then move draft-quote generation to a background workshop that runs the `claude` CLI on the founder's Claude subscription (zero paid-API cost) via a detached process outside the Next.js runtime, with results persisted in SQLite and delivered to the UI over the existing SSE channel with a polling fallback.

**Architecture:** Two independent slices. **Slice A (client bug fixes)** ships first and stands alone — it reorders `res.ok`/`res.json()`, adds a content-type guard and friendly messages, and gives `DraftQuoteCard` a toast. **Slice B (background workshop)** turns `POST /api/ai/draft-quote` into a fast job-enqueue endpoint (returns `{ jobId }`), persists jobs in a new `ai_quote_jobs` SQLite table, and drains the queue with a **single serialized detached worker** (`tsx scripts/quote-workshop/worker.ts`) that calls `callClaudeCliRaw` directly. The worker has no `NEXT_RUNTIME` env, so the existing `lib/ai-provider.ts:421` guard stays intact and the `.claude/rules/ai-provider.md` invariant is preserved. Completion is pushed to the browser via the existing in-memory `jobEvents` SSE emitter (the worker notifies the Next process through a localhost internal callback), with a status endpoint as polling fallback.

**Tech Stack:** Next.js (App Router, route handlers), TypeScript, `better-sqlite3` (numbered migrations under `lib/migrations/`), React client components, Server-Sent Events (`ReadableStream`), `child_process.spawn` (detached), `tsx` standalone scripts, Jest (`--maxWorkers=1 --ci --forceExit` on VPS).

**Subscription / ToS constraint (founder-accepted, single line):** running `claude --print` headlessly against the founder's personal Claude subscription is outside the consumer-subscription ToS happy-path; the founder reviewed and accepted this risk for the demo — do not add an API-fallback variant or re-litigate the decision.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `components/match/QuoteTab.tsx` | Match-page quote tab caller | Modify (Slice A + Slice B UI) |
| `components/request/draft-quote-card.tsx` | Cargo-page quote/reply card caller | Modify (Slice A + Slice B UI) |
| `lib/http/parse-json-response.ts` | Shared safe-JSON-response helper (ok-check + content-type guard + friendly message) | Create |
| `lib/migrations/048-ai-quote-jobs.ts` | `ai_quote_jobs` table migration | Create |
| `lib/migrations/index.ts` | Migration registry | Modify (register 048) |
| `lib/quote-jobs/store.ts` | CRUD + atomic claim + dedupe + stale-TTL reaper over `ai_quote_jobs` | Create |
| `lib/quote-jobs/prompt.ts` | Build system+user prompt for a job from session/cargo (extracted from current route) | Create |
| `app/api/ai/draft-quote/route.ts` | Enqueue job, dedupe, depth-guard, ensure worker, return `{ jobId }` (202) | Modify (rewrite body) |
| `app/api/ai/draft-quote/status/route.ts` | Polling fallback — return one job's status/result | Create |
| `app/api/internal/quote-event/route.ts` | Localhost-only callback the worker hits on completion → emits SSE | Create |
| `lib/jobs/event-emitter.ts` | Add `quote-update` event type + `emitQuoteUpdate` | Modify |
| `lib/quote-jobs/ensure-worker.ts` | Spawn the detached worker if none alive (single-flight via lock file) | Create |
| `scripts/quote-workshop/worker.ts` | Standalone serial queue drainer; calls `callClaudeCliRaw`; notifies Next | Create |
| `package.json` | Add `quote:workshop` script | Modify |
| `lib/migrations/049-quote-jobs-match-id.ts` | Add nullable `match_id` to `ai_quote_jobs` | Create (Stage 10b) |
| `lib/quote-jobs/match-context.ts` | `buildMatchQuoteContext` — numbers-only economics block + derived indicative band | Create (Stage 10b) |
| `lib/api-schemas.ts` | `DraftQuoteBodySchema` + optional `matchId` | Modify (Stage 10b) |
| `components/match/MatchTabs.tsx` / `app/match/[id]/page.tsx` | Thread `matchId` → `QuoteTab` | Modify (Stage 10b) |
| `.env.local.example` | Document new env vars | Modify |
| `scripts/deploy-vps.sh` / docs | Prod provisioning notes | Doc only (Stage 9) |

**Single source of truth for the SSE event name:** the string `quote-update` is defined once in `lib/jobs/event-emitter.ts` and imported everywhere else — never re-typed as a literal in the client or worker.

---

## Slice A — Client Bug Fixes (ship first, independent value)

Fixes the partner-reported error at `/match/54332`, `/match/54333`, `/match/54335`. These three stages have **no dependency on Slice B** and can be merged on their own.

### Stage 1 (S): Shared safe-JSON-response helper

**Files:**
- Create: `lib/http/parse-json-response.ts`
- Test: `lib/http/__tests__/parse-json-response.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/http/__tests__/parse-json-response.test.ts
import { parseJsonResponse, FriendlyHttpError } from '@/lib/http/parse-json-response';

function res(opts: { ok: boolean; status: number; contentType?: string; body: string }): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? opts.contentType ?? null : null) },
    json: async () => JSON.parse(opts.body),
    text: async () => opts.body,
  } as unknown as Response;
}

describe('parseJsonResponse', () => {
  it('returns parsed JSON on a 200 JSON response', async () => {
    const data = await parseJsonResponse<{ draft: string }>(res({ ok: true, status: 200, contentType: 'application/json', body: '{"draft":"hi"}' }));
    expect(data.draft).toBe('hi');
  });

  it('throws FriendlyHttpError with server message on a JSON error response', async () => {
    await expect(parseJsonResponse(res({ ok: false, status: 500, contentType: 'application/json', body: '{"error":"ai_error","message":"Gemini credentials missing"}' })))
      .rejects.toMatchObject({ message: 'Gemini credentials missing' });
  });

  it('throws a friendly message (not a SyntaxError) on an empty body', async () => {
    await expect(parseJsonResponse(res({ ok: false, status: 504, contentType: '', body: '' })))
      .rejects.toMatchObject({ message: expect.stringContaining('timed out') });
  });

  it('throws a friendly message on an HTML (non-JSON) body', async () => {
    await expect(parseJsonResponse(res({ ok: false, status: 502, contentType: 'text/html', body: '<!DOCTYPE html><h1>Bad Gateway</h1>' })))
      .rejects.toMatchObject({ message: expect.stringContaining('unavailable') });
    await expect(parseJsonResponse(res({ ok: false, status: 502, contentType: 'text/html', body: '<!DOCTYPE html>' })))
      .rejects.not.toMatchObject({ message: expect.stringContaining('Unexpected token') });
  });

  it('throws a friendly message when an ok response has a non-JSON body', async () => {
    await expect(parseJsonResponse(res({ ok: true, status: 200, contentType: 'text/html', body: '' })))
      .rejects.toMatchObject({ message: expect.stringContaining('unexpected response') });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/http/__tests__/parse-json-response.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/http/parse-json-response'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/http/parse-json-response.ts

/** Error whose `.message` is always safe to show a user (never a raw SyntaxError). */
export class FriendlyHttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = 'FriendlyHttpError';
    this.status = status;
    this.retryable = retryable;
  }
}

function friendlyForStatus(status: number): string {
  if (status === 504 || status === 408) return 'The request timed out — please retry.';
  if (status >= 500) return 'The service is temporarily unavailable — please retry.';
  if (status === 0) return 'Network error — please check your connection and retry.';
  return 'Request failed — please retry.';
}

/**
 * Reads a fetch Response safely:
 *  1. content-type-guarded JSON parse (never throws a raw SyntaxError to callers),
 *  2. on !ok, prefers the server's {message|error}, else a friendly status message.
 * Throws FriendlyHttpError on any failure; returns parsed body on success.
 */
export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const ct = res.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  if (!isJson) {
    // No JSON to read — surface a friendly message instead of letting res.json() throw.
    if (!res.ok) throw new FriendlyHttpError(friendlyForStatus(res.status), res.status, res.status >= 500);
    throw new FriendlyHttpError('Received an unexpected response from the server — please retry.', res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // Declared JSON but empty/truncated body.
    throw new FriendlyHttpError(friendlyForStatus(res.ok ? 502 : res.status), res.status, true);
  }

  if (!res.ok) {
    const b = body as { message?: string; error?: string } | null;
    const serverMsg = b?.message ?? b?.error;
    throw new FriendlyHttpError(serverMsg ?? friendlyForStatus(res.status), res.status, res.status >= 500);
  }

  return body as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/http/__tests__/parse-json-response.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 5 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/http/parse-json-response.ts lib/http/__tests__/parse-json-response.test.ts
git commit -m "feat(quote): safe JSON-response helper with content-type guard + friendly errors"
```

**Verification:** `npx jest lib/http --maxWorkers=1 --no-coverage` green.
**Rollback:** `git revert <sha>` — helper is unused until Stage 2/3 import it; reverting is safe.

---

### Stage 2 (S): Wire `QuoteTab` to the helper

**Files:**
- Modify: `components/match/QuoteTab.tsx:40-54`
- Test: `components/__tests__/quote-tab-generate-draft.test.tsx` (add cases)

- [ ] **Step 1: Add the failing tests**

```tsx
// append to components/__tests__/quote-tab-generate-draft.test.tsx
import { csrfFetch } from '@/lib/csrf-client';
jest.mock('@/lib/csrf-client');
const mockToastError = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ error: mockToastError, success: jest.fn() }) }));

it('shows a friendly message (not raw SyntaxError) when the body is empty', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: false, status: 504,
    headers: { get: () => 'application/json' },
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  });
  render(<QuoteTab cargoEmailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  const msg = mockToastError.mock.calls[0][0] as string;
  expect(msg).not.toContain('Unexpected end of JSON input');
  expect(msg.toLowerCase()).toContain('timed out');
});

it('shows a friendly message when the body is HTML', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: false, status: 502,
    headers: { get: () => 'text/html' },
    json: async () => { throw new SyntaxError("Unexpected token '<'"); },
  });
  render(<QuoteTab cargoEmailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  expect(mockToastError.mock.calls[0][0]).not.toContain('Unexpected token');
});
```

(Keep the existing well-formed-error test; it must still pass — the server `{message}` still surfaces verbatim. **PI3:** do not weaken the existing assertion.)

- [ ] **Step 2: Run tests to verify the two new ones fail**

Run: `npx jest components/__tests__/quote-tab-generate-draft.test.tsx --maxWorkers=1 --no-coverage`
Expected: the two new tests FAIL (current code calls `res.json()` first → SyntaxError message reaches the toast).

- [ ] **Step 3: Edit `generateDraft` to use the helper**

Replace `components/match/QuoteTab.tsx` lines 40-54 with:

```tsx
    try {
      const res = await csrfFetch('/api/ai/draft-quote', {
        method: 'POST',
        body: JSON.stringify({ emailId: cargoEmailId }),
      });
      const data = await parseJsonResponse<{ draft?: string }>(res);
      setDraft(data.draft ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate draft';
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
```

Add the import near line 9:

```tsx
import { parseJsonResponse } from '@/lib/http/parse-json-response';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest components/__tests__/quote-tab-generate-draft.test.tsx __tests__/components/QuoteTab.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — all cases, including the pre-existing `{message}` test.

- [ ] **Step 5: Commit**

```bash
git add components/match/QuoteTab.tsx components/__tests__/quote-tab-generate-draft.test.tsx
git commit -m "fix(quote): QuoteTab uses safe JSON parse — friendly message on empty/HTML body"
```

**Verification:** both QuoteTab test files green.
**Rollback:** `git revert <sha>` — restores prior inline parsing.

---

### Stage 3 (S): Wire `DraftQuoteCard` to the helper + add toast

**Files:**
- Modify: `components/request/draft-quote-card.tsx` (quote path lines 22-38, reply path 40-56, imports)
- Test: `components/request/__tests__/draft-quote-card.test.tsx` (create — no tests exist today)

- [ ] **Step 1: Write the failing test (first-ever for this component)**

```tsx
// components/request/__tests__/draft-quote-card.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DraftQuoteCard } from '@/components/request/draft-quote-card';
import { csrfFetch } from '@/lib/csrf-client';

jest.mock('@/lib/csrf-client');
const mockToastError = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ error: mockToastError, success: jest.fn() }) }));

beforeEach(() => jest.clearAllMocks());

it('renders a draft on a 200 response', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ draft: 'Dear Sirs, ...' }),
  });
  render(<DraftQuoteCard emailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /draft quote/i }));
  await waitFor(() => expect(screen.getByDisplayValue(/Dear Sirs/)).toBeInTheDocument());
});

it('fires a toast with a friendly message on an empty-body error', async () => {
  (csrfFetch as jest.Mock).mockResolvedValueOnce({
    ok: false, status: 504,
    headers: { get: () => 'application/json' },
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  });
  render(<DraftQuoteCard emailId="e1" />);
  fireEvent.click(screen.getByRole('button', { name: /draft quote/i }));
  await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  expect(mockToastError.mock.calls[0][0]).not.toContain('Unexpected end of JSON input');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/request/__tests__/draft-quote-card.test.tsx --maxWorkers=1 --no-coverage`
Expected: FAIL — `useToast` not imported in the component (no toast call) + raw SyntaxError on the empty-body case.

- [ ] **Step 3: Edit the component**

Add imports (top of `components/request/draft-quote-card.tsx`):

```tsx
import { useToast } from '@/components/ui/toast';
import { parseJsonResponse } from '@/lib/http/parse-json-response';
```

Inside `DraftQuoteCard`, after the `useState` hooks:

```tsx
  const toast = useToast();
```

Replace `generateQuote` body (lines 22-38) try/catch:

```tsx
    try {
      const res = await csrfFetch('/api/ai/draft-quote', {
        method: 'POST',
        body: JSON.stringify({ emailId }),
      });
      const data = await parseJsonResponse<{ draft?: string }>(res);
      setQuoteDraft(data.draft ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate quote';
      setQuoteError(msg);
      toast.error(msg);
    } finally {
      setLoadingQuote(false);
    }
```

Apply the identical pattern to `generateReply` (lines 40-56): swap `await res.json()` + `!res.ok` throw for `const data = await parseJsonResponse<{ draft?: string }>(res);`, and add `toast.error(msg)` in its catch alongside `setReplyError(msg)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/request/__tests__/draft-quote-card.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 5: Commit**

```bash
git add components/request/draft-quote-card.tsx components/request/__tests__/draft-quote-card.test.tsx
git commit -m "fix(quote): DraftQuoteCard toast + safe JSON parse on both buttons (#893 follow-up)"
```

**Verification:** new test file green; `npx tsc --noEmit` clean.
**Rollback:** `git revert <sha>`.

> **Slice A milestone:** after Stage 3, open/merge a PR for Slice A alone if the founder wants the partner unblocked immediately. The partner repro at `/match/54332-54335` now shows a friendly toast on every failure path. Slice B continues below.

---

## Slice B — Background Workshop (claude-cli)

### Stage 4 (M): `ai_quote_jobs` table + migration

**Files:**
- Create: `lib/migrations/048-ai-quote-jobs.ts`
- Modify: `lib/migrations/index.ts`
- Test: `lib/migrations/__tests__/048-ai-quote-jobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/migrations/__tests__/048-ai-quote-jobs.test.ts
import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';

it('creates ai_quote_jobs with the expected columns and index', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  const cols = (db.prepare(`PRAGMA table_info(ai_quote_jobs)`).all() as { name: string }[]).map(c => c.name);
  expect(cols).toEqual(expect.arrayContaining([
    'id', 'session_id', 'email_id', 'status', 'result', 'error', 'attempts', 'created_at', 'updated_at',
  ]));
  // status CHECK constraint rejects unknown states
  expect(() => db.prepare(
    `INSERT INTO ai_quote_jobs (id, session_id, email_id, status) VALUES ('j1','s1','e1','bogus')`,
  ).run()).toThrow();
});

it('down() drops the table', () => {
  const db = new Database(':memory:');
  migration048.up(db);
  migration048.down(db);
  const t = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='ai_quote_jobs'`).get();
  expect(t).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/migrations/__tests__/048-ai-quote-jobs.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```ts
// lib/migrations/048-ai-quote-jobs.ts
import type { Migration } from './types';

const migration048: Migration = {
  version: 48,
  name: '048-ai-quote-jobs',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_quote_jobs (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        email_id    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'queued'
                    CHECK(status IN ('queued','processing','done','error')),
        result      TEXT,
        error       TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_quote_jobs_status ON ai_quote_jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_quote_jobs_session_email ON ai_quote_jobs(session_id, email_id, status);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_quote_jobs_session_email;
      DROP INDEX IF EXISTS idx_quote_jobs_status;
      DROP TABLE IF EXISTS ai_quote_jobs;
    `);
  },
};

export default migration048;
```

- [ ] **Step 4: Register the migration**

In `lib/migrations/index.ts`, add the import after `migration047` and append `migration048` to the `allMigrations` array:

```ts
import migration048 from './048-ai-quote-jobs';
// ...
export const allMigrations: Migration[] = [/* …047, */ migration048];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/migrations/__tests__/048-ai-quote-jobs.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/migrations/048-ai-quote-jobs.ts lib/migrations/index.ts lib/migrations/__tests__/048-ai-quote-jobs.test.ts
git commit -m "feat(quote): ai_quote_jobs migration (048) — persistent quote-job queue"
```

**Verification:** migration test green; full migration suite `npx jest lib/migrations --maxWorkers=1 --no-coverage` green (no version collision).
**Rollback:** `git revert <sha>`; on a live DB run `migration048.down(db)`. No other table references it.

---

### Stage 5 (M): `lib/quote-jobs/store.ts` — enqueue, dedupe, atomic claim, stale-TTL reaper

**Files:**
- Create: `lib/quote-jobs/store.ts`
- Test: `lib/quote-jobs/__tests__/store.test.ts`

Design notes:
- **Dedupe:** `enqueueQuoteJob` returns an existing `queued|processing` job for the same `(session_id, email_id)` instead of creating a duplicate (one CLI call per match in flight).
- **Depth guard:** if `queued` count ≥ `QUOTE_QUEUE_MAX_DEPTH` (default 20) → throw `QueueFullError`.
- **Atomic claim:** `claimNextJob()` does a single `UPDATE ... SET status='processing' WHERE id = (SELECT id ... WHERE status='queued' ORDER BY created_at LIMIT 1) RETURNING *` so two worker instances can't grab the same row.
- **Stale TTL:** `reapStaleJobs(ttlMs)` flips `processing` rows older than `ttlMs` (default 120 000) to `error` so a crashed worker can't wedge the queue.

- [ ] **Step 1: Write the failing test**

```ts
// lib/quote-jobs/__tests__/store.test.ts
import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';
import {
  enqueueQuoteJob, getQuoteJob, claimNextJob, completeJob, failJob, reapStaleJobs,
  QueueFullError, countQueued,
} from '@/lib/quote-jobs/store';

function db() { const d = new Database(':memory:'); migration048.up(d); return d; }

it('enqueues a queued job and finds it by id', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  expect(job.status).toBe('queued');
  expect(getQuoteJob(d, job.id)?.email_id).toBe('e1');
});

it('dedupes a second enqueue for the same session+email in flight', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  const b = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  expect(b.id).toBe(a.id);
  expect(countQueued(d)).toBe(1);
});

it('claims the oldest queued job exactly once', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  const claimed = claimNextJob(d);
  expect(claimed?.id).toBe(a.id);
  expect(claimed?.status).toBe('processing');
  expect(claimNextJob(d)).toBeNull(); // nothing left to claim
});

it('completes and fails jobs terminally', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  claimNextJob(d);
  completeJob(d, a.id, 'Dear Sirs, ...');
  expect(getQuoteJob(d, a.id)?.status).toBe('done');
  expect(getQuoteJob(d, a.id)?.result).toContain('Dear Sirs');

  const b = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e2' });
  claimNextJob(d);
  failJob(d, b.id, 'claude CLI exited with status 1');
  expect(getQuoteJob(d, b.id)?.status).toBe('error');
});

it('throws QueueFullError past max depth', () => {
  const d = db();
  for (let i = 0; i < 20; i++) enqueueQuoteJob(d, { sessionId: 's1', emailId: `e${i}` });
  expect(() => enqueueQuoteJob(d, { sessionId: 's1', emailId: 'overflow' }, { maxDepth: 20 }))
    .toThrow(QueueFullError);
});

it('reaps stale processing jobs to error', () => {
  const d = db();
  const a = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1' });
  claimNextJob(d);
  d.prepare(`UPDATE ai_quote_jobs SET updated_at = updated_at - 999999 WHERE id = ?`).run(a.id);
  const reaped = reapStaleJobs(d, 120_000);
  expect(reaped).toBe(1);
  expect(getQuoteJob(d, a.id)?.status).toBe('error');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/quote-jobs/__tests__/store.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the store**

```ts
// lib/quote-jobs/store.ts
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type QuoteJobStatus = 'queued' | 'processing' | 'done' | 'error';

export interface QuoteJob {
  id: string;
  session_id: string;
  email_id: string;
  status: QuoteJobStatus;
  result: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

export class QueueFullError extends Error {
  constructor(depth: number) { super(`quote queue full (depth=${depth})`); this.name = 'QueueFullError'; }
}

const DEFAULT_MAX_DEPTH = Number(process.env.QUOTE_QUEUE_MAX_DEPTH) || 20;

export function countQueued(db: Database.Database): number {
  return (db.prepare(`SELECT COUNT(*) n FROM ai_quote_jobs WHERE status='queued'`).get() as { n: number }).n;
}

export function getQuoteJob(db: Database.Database, id: string): QuoteJob | undefined {
  return db.prepare(`SELECT * FROM ai_quote_jobs WHERE id = ?`).get(id) as QuoteJob | undefined;
}

export function enqueueQuoteJob(
  db: Database.Database,
  input: { sessionId: string; emailId: string },
  opts: { maxDepth?: number } = {},
): QuoteJob {
  // Dedupe: reuse an in-flight job for the same session+email.
  const existing = db.prepare(
    `SELECT * FROM ai_quote_jobs WHERE session_id=? AND email_id=? AND status IN ('queued','processing')
     ORDER BY created_at DESC LIMIT 1`,
  ).get(input.sessionId, input.emailId) as QuoteJob | undefined;
  if (existing) return existing;

  const depth = countQueued(db);
  const max = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (depth >= max) throw new QueueFullError(depth);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ai_quote_jobs (id, session_id, email_id, status) VALUES (?,?,?,'queued')`,
  ).run(id, input.sessionId, input.emailId);
  return getQuoteJob(db, id)!;
}

/** Atomically move the oldest queued job to processing and return it (or null). */
export function claimNextJob(db: Database.Database): QuoteJob | null {
  const row = db.prepare(
    `UPDATE ai_quote_jobs
       SET status='processing', attempts = attempts + 1, updated_at = strftime('%s','now') * 1000
     WHERE id = (SELECT id FROM ai_quote_jobs WHERE status='queued' ORDER BY created_at LIMIT 1)
     RETURNING *`,
  ).get() as QuoteJob | undefined;
  return row ?? null;
}

export function completeJob(db: Database.Database, id: string, result: string): void {
  db.prepare(
    `UPDATE ai_quote_jobs SET status='done', result=?, updated_at = strftime('%s','now') * 1000 WHERE id=?`,
  ).run(result, id);
}

export function failJob(db: Database.Database, id: string, error: string): void {
  db.prepare(
    `UPDATE ai_quote_jobs SET status='error', error=?, updated_at = strftime('%s','now') * 1000 WHERE id=?`,
  ).run(error.slice(0, 500), id);
}

/** Flip processing jobs whose updated_at is older than ttlMs to error. Returns count reaped. */
export function reapStaleJobs(db: Database.Database, ttlMs = 120_000): number {
  const cutoff = `strftime('%s','now') * 1000 - ${Number(ttlMs)}`;
  const r = db.prepare(
    `UPDATE ai_quote_jobs SET status='error', error='stale: worker did not finish in time',
       updated_at = strftime('%s','now') * 1000
     WHERE status='processing' AND updated_at < (${cutoff})`,
  ).run();
  return r.changes;
}
```

> **Note on `RETURNING`:** `better-sqlite3` supports `RETURNING` (SQLite ≥ 3.35). If the bundled SQLite predates it, replace `claimNextJob` with a `db.transaction(() => { select id; update; return getQuoteJob })`. Verify with the test in Step 5 before assuming.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/quote-jobs/__tests__/store.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 6 passed`. If `claimNextJob` test errors on `RETURNING`, apply the transaction fallback above and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/quote-jobs/store.ts lib/quote-jobs/__tests__/store.test.ts
git commit -m "feat(quote): persistent job store — dedupe, atomic claim, depth guard, stale-TTL reaper"
```

**Verification:** store test green.
**Rollback:** `git revert <sha>` — no consumers until Stage 6/7.

---

### Stage 6 (M): Prompt builder extraction

**Files:**
- Create: `lib/quote-jobs/prompt.ts`
- Test: `lib/quote-jobs/__tests__/prompt.test.ts`

Extract the system/user prompt assembly (currently inline in `route.ts:34-116`, including the RAG enrichment) into a pure-ish builder the **worker** can call. Keeping it in `lib/` (not the route) means the standalone script reuses identical prompt logic without importing a route handler.

- [ ] **Step 1: Write the failing test**

```ts
// lib/quote-jobs/__tests__/prompt.test.ts
import { buildQuotePrompt } from '@/lib/quote-jobs/prompt';

const cargo = { emailId: 'e1', cargoType: 'grain', cargoDescription: 'wheat in bulk' };
const email = { id: 'e1', from: 'broker@acme.com', fromName: 'Jane Broker', subject: 'Wheat fixture', body: 'Need a quote' };

it('builds a system + user prompt addressed to the resolved sender', async () => {
  const { system, user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).toContain('DRAFT'); // from DRAFT_QUOTE_SYSTEM_PROMPT
  expect(user).toContain('wheat in bulk');
  expect(user).toContain('Jane Broker'); // resolveSenderName output
});

it('omits RAG context when ragEnabled is false', async () => {
  const { system } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(system).not.toContain('IMSBC Cargo Safety Context');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/quote-jobs/__tests__/prompt.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the builder (move logic out of route.ts)**

```ts
// lib/quote-jobs/prompt.ts
import { DRAFT_QUOTE_SYSTEM_PROMPT } from '@/lib/prompts';
import { resolveSenderName } from '@/lib/utils/resolve-sender-name';

interface BuildArgs {
  parsedCargo: { emailId: string; cargoType?: string; cargoDescription?: unknown };
  email?: { id: string; from?: string; fromName?: string; subject?: string; body?: string };
  ragEnabled: boolean;
}

export async function buildQuotePrompt({ parsedCargo, email, ragEnabled }: BuildArgs): Promise<{ system: string; user: string }> {
  const fromName = resolveSenderName({ fromName: email?.fromName, from: email?.from });

  const ragContextParts: string[] = [];
  if (ragEnabled) {
    const cargoDesc = (() => {
      const d = parsedCargo.cargoDescription;
      if (!d) return '';
      if (typeof d === 'object' && 'value' in (d as object)) return String((d as { value: unknown }).value) || '';
      return String(d);
    })();
    const query = `${parsedCargo.cargoType || ''} ${cargoDesc}`.trim() || 'bulk cargo safety stowage';
    const [{ retrieve }, { getDb }] = await Promise.all([
      import('@/lib/knowledge/embeddings/retriever'),
      import('@/lib/db'),
    ]);
    const db = getDb();
    try {
      const imsbc = await retrieve(`IMSBC ${query}`, { vectorTable: 'imsbc_vec', ftsTable: 'imsbc_fts', topN: 3, db });
      if (imsbc.length) ragContextParts.push('=== IMSBC Cargo Safety Context ===',
        ...imsbc.map(c => `[IMSBC-${c.metadata?.id ?? c.chunkId}] ${c.content}`), '===================================');
    } catch (e) { console.warn('[quote-prompt] IMSBC RAG failed:', e); }
    try {
      const igc = await retrieve(`IGC grain gas ${query}`, { vectorTable: 'igc_vec', ftsTable: 'igc_fts', topN: 3, db });
      if (igc.length) ragContextParts.push('=== IGC Grain/Gas Cargo Context ===',
        ...igc.map(c => `[IGC-${c.metadata?.id ?? c.chunkId}] ${c.content}`), '====================================');
    } catch (e) { console.warn('[quote-prompt] IGC RAG failed:', e); }
  }

  const system = ragContextParts.length
    ? `${DRAFT_QUOTE_SYSTEM_PROMPT}\n\n${ragContextParts.join('\n')}`
    : DRAFT_QUOTE_SYSTEM_PROMPT;

  const user = `
Parsed cargo inquiry data:
${JSON.stringify(parsedCargo, null, 2)}

Original email:
From: ${email?.from || ''}
Subject: ${email?.subject || ''}
Body: ${email?.body?.slice(0, 1500) || ''}

Address the reply to: ${fromName}

Generate a professional draft quote email.`;

  return { system, user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/quote-jobs/__tests__/prompt.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/quote-jobs/prompt.ts lib/quote-jobs/__tests__/prompt.test.ts
git commit -m "feat(quote): extract buildQuotePrompt for reuse by the workshop worker"
```

**Verification:** prompt test green; `npx tsc --noEmit` clean.
**Rollback:** `git revert <sha>`.

---

### Stage 7 (M): SSE `quote-update` event + internal callback + status endpoint

**Files:**
- Modify: `lib/jobs/event-emitter.ts`
- Create: `app/api/internal/quote-event/route.ts`
- Create: `app/api/ai/draft-quote/status/route.ts`
- Test: `lib/jobs/__tests__/event-emitter-quote.test.ts`, `app/api/internal/__tests__/quote-event.test.ts`, `app/api/ai/draft-quote/__tests__/status.test.ts`

Cross-process bridge: the worker is a separate OS process and **cannot** reach the Next process's in-memory `jobEvents` map. On completion it POSTs to a localhost-only internal endpoint (shared-secret header) which calls `emitQuoteUpdate` inside the Next process → SSE push. The `status` endpoint is the polling fallback when SSE is unavailable.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/jobs/__tests__/event-emitter-quote.test.ts
import { jobEvents, emitQuoteUpdate, QUOTE_UPDATE_EVENT } from '@/lib/jobs/event-emitter';

it('delivers quote-update events to subscribers of a session', () => {
  const seen: unknown[] = [];
  const off = jobEvents.subscribe('s1', e => { if (e.type === QUOTE_UPDATE_EVENT) seen.push(e.data); });
  emitQuoteUpdate('s1', { id: 'j1', status: 'done', email_id: 'e1' });
  off();
  expect(seen).toEqual([{ id: 'j1', status: 'done', email_id: 'e1' }]);
});
```

```ts
// app/api/internal/__tests__/quote-event.test.ts
import { POST } from '@/app/api/internal/quote-event/route';
import { NextRequest } from 'next/server';

const SECRET = 'test-secret';
beforeAll(() => { process.env.INTERNAL_EVENT_TOKEN = SECRET; });

function req(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/internal/quote-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
    body: JSON.stringify(body),
  });
}

it('401s without the internal token', async () => {
  const r = await POST(req({ sessionId: 's1', job: { id: 'j1', status: 'done', email_id: 'e1' } }));
  expect(r.status).toBe(401);
});

it('202s and emits with a valid token', async () => {
  const r = await POST(req({ sessionId: 's1', job: { id: 'j1', status: 'done', email_id: 'e1' } }, SECRET));
  expect(r.status).toBe(202);
});
```

```ts
// app/api/ai/draft-quote/__tests__/status.test.ts  (status endpoint — session-guarded; mock requireSession + store)
// Asserts: 401 without session; 404 for a job not belonging to the session; 200 {status,result} for an owned job.
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/jobs/__tests__/event-emitter-quote.test.ts app/api/internal/__tests__/quote-event.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `emitQuoteUpdate` / route modules not found.

- [ ] **Step 3a: Extend the event emitter**

In `lib/jobs/event-emitter.ts` add the event type and emitter (single source of the event-name string):

```ts
export const QUOTE_UPDATE_EVENT = 'quote-update' as const;

type QuoteUpdateData = {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  email_id: string;
  result?: string;
  error?: string;
};

// extend the Event union:
type Event =
  | { type: 'job-update'; data: JobUpdateData }
  | { type: 'match-created'; data: MatchCreatedData }
  | { type: typeof QUOTE_UPDATE_EVENT; data: QuoteUpdateData };

export function emitQuoteUpdate(userId: string, data: QuoteUpdateData): void {
  emit(userId, { type: QUOTE_UPDATE_EVENT, data });
}
```

(The existing `app/api/jobs/stream/route.ts` `send` callback serializes any event type generically — no change needed there; new `quote-update` events flow through automatically.)

- [ ] **Step 3b: Internal callback endpoint**

```ts
// app/api/internal/quote-event/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { emitQuoteUpdate } from '@/lib/jobs/event-emitter';

// Localhost-only worker → Next bridge. Auth = shared secret (INTERNAL_EVENT_TOKEN).
// NOT an admin route; deliberately excluded from /api/admin auth and from middleware login.
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-internal-token');
  if (!process.env.INTERNAL_EVENT_TOKEN || token !== process.env.INTERNAL_EVENT_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { sessionId?: string; job?: { id: string; status: string; email_id: string; result?: string; error?: string } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  if (!body.sessionId || !body.job) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  emitQuoteUpdate(body.sessionId, body.job as Parameters<typeof emitQuoteUpdate>[1]);
  return NextResponse.json({ ok: true }, { status: 202 });
}
```

> **middleware note (`.claude/rules/admin-api.md`):** `/api/internal/quote-event` and `/api/ai/draft-quote/status` are NOT under `/api/admin/*`, so `requireAdmin` does not apply. They use their own auth (shared secret / session). Add **`/api/internal/quote-event`** to `AUTH_BYPASS_PATHS` in `middleware.ts` AND to the `bypassPaths` array in `__tests__/middleware-auth.test.ts` (exact-string match, per the rule). The `status` route is session-guarded via `requireSession`, so it follows the normal authenticated-page flow and does **not** need a bypass.

- [ ] **Step 3c: Status endpoint (polling fallback)**

```ts
// app/api/ai/draft-quote/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getQuoteJob } from '@/lib/quote-jobs/store';

export async function GET(req: NextRequest) {
  const auth = requireSession(req);
  if (auth instanceof NextResponse) return auth;
  const { sessionId } = auth;
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const job = getQuoteJob(getStore().getDb(), jobId);
  if (!job || job.session_id !== sessionId) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ id: job.id, status: job.status, result: job.result, error: job.error });
}
```

- [ ] **Step 4: Run tests to verify they pass + update middleware test**

Run: `npx jest lib/jobs/__tests__/event-emitter-quote.test.ts app/api/internal/__tests__/quote-event.test.ts app/api/ai/draft-quote/__tests__/status.test.ts __tests__/middleware-auth.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — including the updated `middleware-auth` bypass list.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/event-emitter.ts app/api/internal/quote-event/route.ts app/api/ai/draft-quote/status/route.ts middleware.ts \
  lib/jobs/__tests__/event-emitter-quote.test.ts app/api/internal/__tests__/quote-event.test.ts \
  app/api/ai/draft-quote/__tests__/status.test.ts __tests__/middleware-auth.test.ts
git commit -m "feat(quote): SSE quote-update event + internal worker callback + status endpoint"
```

**Verification:** all five test files green; `__tests__/middleware-auth.test.ts` confirms the bypass path.
**Rollback:** `git revert <sha>`; remove the bypass path from `middleware.ts` in the same revert.

---

### Stage 8 (M): Enqueue route + worker-ensure + standalone worker script

**Files:**
- Create: `lib/quote-jobs/ensure-worker.ts`
- Modify: `app/api/ai/draft-quote/route.ts` (rewrite POST body)
- Create: `scripts/quote-workshop/worker.ts`
- Modify: `package.json` (add `quote:workshop`)
- Test: `app/api/ai/draft-quote/__tests__/draft-quote.test.ts` (rewrite expectations — see PI3 note), `lib/quote-jobs/__tests__/ensure-worker.test.ts`

> **PI3 boundary:** the existing `app/api/ai/__tests__/draft-quote.test.ts` asserts the OLD synchronous contract (`200 {draft}`, `504 ai_timeout`, `500 ai_error`). The endpoint contract is intentionally changing to async `202 {jobId}`. This is a deliberate contract change driven by the founder decision, **not** a test-rewrite to fit an impl. Rewrite only the response-shape assertions; **preserve** the auth/validation assertions (401 no session, 400 bad body, 404 cargo-not-found) unchanged. If the rewrite touches more than ~5 expectation blocks, STOP and report `PLAN UPDATE NEEDED`.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/ai/draft-quote/__tests__/draft-quote.test.ts  (rewrite the success path)
it('returns 202 {jobId} and enqueues a job', async () => {
  // session mocked with a parsedCargo for emailId e1
  const r = await POST(reqWithSession({ emailId: 'e1' }));
  expect(r.status).toBe(202);
  const body = await r.json();
  expect(typeof body.jobId).toBe('string');
});
// PRESERVE unchanged: 401 no session, 400 invalid body, 404 parsed-cargo-not-found.
```

```ts
// lib/quote-jobs/__tests__/ensure-worker.test.ts
import { ensureWorker, __resetWorkerStateForTest } from '@/lib/quote-jobs/ensure-worker';

it('spawns at most one worker when the lock is fresh', () => {
  __resetWorkerStateForTest();
  const spawned: string[][] = [];
  const fakeSpawn = ((cmd: string, args: string[]) => { spawned.push([cmd, ...args]); return { unref() {}, pid: 1 } as any; }) as any;
  ensureWorker({ spawnFn: fakeSpawn });
  ensureWorker({ spawnFn: fakeSpawn }); // second call within lock window → no second spawn
  expect(spawned.length).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest app/api/ai/draft-quote/__tests__/draft-quote.test.ts lib/quote-jobs/__tests__/ensure-worker.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL.

- [ ] **Step 3a: `ensure-worker.ts` (single-flight detached spawn)**

```ts
// lib/quote-jobs/ensure-worker.ts
import { spawn as realSpawn } from 'node:child_process';

let lastSpawnAt = 0;
const COOLDOWN_MS = 5_000; // avoid spawn storms; worker self-exits when queue drains

export function __resetWorkerStateForTest() { lastSpawnAt = 0; }

/**
 * Ensure a quote-workshop worker is running. The worker drains the queue and
 * exits when empty; if a burst of requests arrives we may spawn again after the
 * cooldown — a fresh worker no-ops if another holds the DB claim. Detached so it
 * survives the request (pm2 reaps on its own). NOTE: never called with NEXT_RUNTIME
 * leaking into the child — env is sanitized below so the claude-cli guard passes.
 */
export function ensureWorker(opts: { spawnFn?: typeof realSpawn } = {}): void {
  const now = Date.now();
  if (now - lastSpawnAt < COOLDOWN_MS) return;
  lastSpawnAt = now;
  const spawnFn = opts.spawnFn ?? realSpawn;
  const env = { ...process.env };
  delete (env as Record<string, string | undefined>).NEXT_RUNTIME; // CRITICAL: child is NOT a Next runtime
  const child = spawnFn('npm', ['run', 'quote:workshop'], { detached: true, stdio: 'ignore', env });
  child.unref();
}
```

> **`Date.now()` caveat:** this is production runtime code (not a workflow script), so `Date.now()` is fine here. The test injects `spawnFn` and resets state, so it never asserts on wall-clock timing.

- [ ] **Step 3b: Rewrite the enqueue route**

```ts
// app/api/ai/draft-quote/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { validateCsrf } from '@/lib/csrf';
import { requireSession } from '@/lib/session';
import { DraftQuoteBodySchema } from '@/lib/api-schemas';
import { getStore } from '@/lib/session-store';
import { enqueueQuoteJob, QueueFullError } from '@/lib/quote-jobs/store';
import { ensureWorker } from '@/lib/quote-jobs/ensure-worker';

export async function POST(request: NextRequest) {
  if (!validateCsrf(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const result = requireSession(request);
  if (result instanceof NextResponse) return result;
  const { session, sessionId } = result;

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }
  const parsed = DraftQuoteBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body', details: parsed.error.format() }, { status: 400 });
  const { emailId } = parsed.data;

  const parsedCargo = session.parsedCargos.find(r => r.emailId === emailId);
  if (!parsedCargo) return NextResponse.json({ error: 'Parsed request not found' }, { status: 404 });

  try {
    const job = enqueueQuoteJob(getStore().getDb(), { sessionId, emailId });
    ensureWorker();
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (err) {
    if (err instanceof QueueFullError) {
      return NextResponse.json({ error: 'queue_full', message: 'Too many quotes in progress — please retry shortly.', retryable: true }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Failed to enqueue quote job';
    return NextResponse.json({ error: 'enqueue_error', message }, { status: 500 });
  }
}
```

> Note: `request.json()` is now wrapped (closes recon hypothesis H3 — the unguarded `await request.json()` at the old line 20). The expensive RAG/LLM work moves entirely to the worker.

- [ ] **Step 3c: The standalone worker (claude-cli, serialized)**

```ts
// scripts/quote-workshop/worker.ts
/**
 * Standalone quote-workshop worker. Runs OUTSIDE the Next.js runtime (no
 * NEXT_RUNTIME), so calling callClaudeCliRaw is sanctioned — the guard at
 * lib/ai-provider.ts:421 only fires when NEXT_RUNTIME is set. Precedent for
 * claude-cli inside a tsx script: package.json `seed:parse` / `seed:all`.
 *
 * Concurrency: this worker processes ONE job at a time (serial loop) — the
 * founder's Claude subscription tolerates ~1-2 concurrent CLI calls, so we
 * stay at 1. Atomic claimNextJob() means even if two workers race, each job is
 * handled once. Worker exits when the queue drains.
 */
import { getStore } from '@/lib/session-store';
import { callClaudeCliRaw } from '@/lib/ai-provider';
import { claimNextJob, completeJob, failJob, reapStaleJobs } from '@/lib/quote-jobs/store';
import { buildQuotePrompt } from '@/lib/quote-jobs/prompt';
import { isRagEnabled } from '@/lib/knowledge/flags';

const MODEL = process.env.DRAFT_QUOTE_CLI_MODEL ?? 'claude-sonnet-4-6';
const BUDGET = Number(process.env.DRAFT_QUOTE_CLI_BUDGET_USD) || 0.20;
const INTERNAL_URL = process.env.INTERNAL_EVENT_URL ?? 'http://127.0.0.1:3000/api/internal/quote-event';

async function notify(sessionId: string, job: { id: string; status: string; email_id: string; result?: string; error?: string }) {
  try {
    await fetch(INTERNAL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': process.env.INTERNAL_EVENT_TOKEN ?? '' },
      body: JSON.stringify({ sessionId, job }),
    });
  } catch (e) { console.warn('[quote-worker] SSE notify failed (UI will fall back to polling):', e); }
}

async function main() {
  const store = getStore();
  const db = store.getDb();
  reapStaleJobs(db, Number(process.env.QUOTE_JOB_TTL_MS) || 120_000);

  // Serial drain.
  for (;;) {
    const job = claimNextJob(db);
    if (!job) break;

    const session = store.getSessionById?.(job.session_id);
    const parsedCargo = session?.parsedCargos?.find((r: { emailId: string }) => r.emailId === job.email_id);
    if (!parsedCargo) {
      failJob(db, job.id, 'session or parsed cargo no longer available');
      await notify(job.session_id, { id: job.id, status: 'error', email_id: job.email_id, error: 'session expired' });
      continue;
    }
    const email = session?.emails?.find((e: { id: string }) => e.id === job.email_id);

    try {
      const { system, user } = await buildQuotePrompt({ parsedCargo, email, ragEnabled: isRagEnabled() });
      const { text } = callClaudeCliRaw(system, user, MODEL, { maxBudgetUsd: BUDGET, timeoutMs: 85_000 });
      completeJob(db, job.id, text);
      await notify(job.session_id, { id: job.id, status: 'done', email_id: job.email_id, result: text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'claude CLI failed';
      failJob(db, job.id, msg);
      await notify(job.session_id, { id: job.id, status: 'error', email_id: job.email_id, error: 'Quote generation failed — please retry.' });
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[quote-worker] fatal:', e); process.exit(1); });
```

> **`getSessionById` check:** confirm the session store exposes a by-id getter usable outside a request (the worker has no `NextRequest`). If only `requireSession(req)` exists, add a thin `getStore().getSessionById(id)` in `lib/session-store.ts` in this stage (small, covered by a unit test). If that getter requires more than a trivial lookup, STOP and report `PLAN UPDATE NEEDED`.

- [ ] **Step 3d: package.json script**

```json
"quote:workshop": "tsx scripts/quote-workshop/worker.ts"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest app/api/ai/draft-quote/__tests__/draft-quote.test.ts lib/quote-jobs/__tests__/ensure-worker.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `202 {jobId}` plus preserved auth/validation cases; single-spawn ensure-worker.

- [ ] **Step 5: Manual worker smoke (local/dev-VPS, claude CLI present)**

```bash
# Enqueue a job by id directly, then run the worker once:
npm run quote:workshop
# Expect: claims queued jobs, calls claude, marks done; exits when empty.
```

- [ ] **Step 6: Commit**

```bash
git add lib/quote-jobs/ensure-worker.ts app/api/ai/draft-quote/route.ts scripts/quote-workshop/worker.ts package.json \
  app/api/ai/draft-quote/__tests__/draft-quote.test.ts lib/quote-jobs/__tests__/ensure-worker.test.ts
git commit -m "feat(quote): async enqueue route + serialized claude-cli workshop worker"
```

**Verification:** route + ensure-worker tests green; worker smoke produces a `done` row.
**Rollback:** `git revert <sha>`. The old synchronous route body is in git history; reverting this commit alone restores it (Slice A fixes remain).

---

### Stage 9 (M): UI async flow — progress, result, retry, error states

**Files:**
- Modify: `components/match/QuoteTab.tsx`
- Modify: `components/request/draft-quote-card.tsx`
- Create: `lib/quote-jobs/use-quote-job.ts` (shared client hook: enqueue → subscribe SSE → poll fallback → resolve)
- Test: `lib/quote-jobs/__tests__/use-quote-job.test.tsx`, extend both component test files

The client now: POSTs → gets `{ jobId }` → shows "Generating… (queued/working)" → listens on `/api/jobs/stream` for a `quote-update` with its `jobId` → on `done` renders `result`, on `error` shows friendly message + a **Retry** button. Polling `GET /api/ai/draft-quote/status?jobId=` every ~3 s is the fallback if no SSE event arrives within a timeout.

- [ ] **Step 1: Write the failing hook test**

```tsx
// lib/quote-jobs/__tests__/use-quote-job.test.tsx — drives the hook with a mocked
// csrfFetch (enqueue → {jobId}) and a mocked EventSource; asserts:
//  - status transitions queued → processing → done
//  - onDone receives the result text
//  - falls back to polling status endpoint when no SSE event arrives before the timeout
//  - retry() re-enqueues and resets state
```

- [ ] **Step 2: Run test to verify it fails** — `npx jest lib/quote-jobs/__tests__/use-quote-job.test.tsx --maxWorkers=1 --no-coverage` → FAIL (module not found).

- [ ] **Step 3: Implement `useQuoteJob` hook**

Hook contract (implement to satisfy the test):

```ts
// lib/quote-jobs/use-quote-job.ts
export type QuoteJobUiState = 'idle' | 'queued' | 'processing' | 'done' | 'error';
export function useQuoteJob(emailId?: string): {
  state: QuoteJobUiState;
  draft: string;
  error: string;
  start: () => Promise<void>;   // enqueue
  retry: () => Promise<void>;   // reset + enqueue
};
```

Behavior: `start()` POSTs to `/api/ai/draft-quote` via `csrfFetch` + `parseJsonResponse` (reuses Stage 1 helper for the enqueue response too), stores `jobId`, opens an `EventSource('/api/jobs/stream')`, filters `quote-update` events by `data.id === jobId`. Maintains a `setTimeout` (default 8 s) that, if no SSE event seen, begins polling `status?jobId=` every 3 s until terminal. On `done` → `setDraft(result)`; on `error` → friendly `setError`. Clean up EventSource + timers on unmount and on terminal state.

- [ ] **Step 4: Run hook test** — Expected PASS.

- [ ] **Step 5: Rewire `QuoteTab`**

Replace the local `generateDraft`/`generating`/`generateError` machinery with `useQuoteJob(cargoEmailId)`. Button label reflects `state` (`Generating…` while `queued|processing`, `Generate` otherwise). Show a **Retry** button when `state === 'error'`. Keep the existing textarea bound to `draft` (now from the hook).

- [ ] **Step 6: Rewire `DraftQuoteCard`** (quote button only — the reply button keeps its existing synchronous `/api/ai/draft-reply` path; do NOT move draft-reply to the workshop — out of scope). Use `useQuoteJob(emailId)` for the quote path, with a Retry control on error.

- [ ] **Step 7: Run component tests** — `npx jest components/__tests__/quote-tab-generate-draft.test.tsx components/request/__tests__/draft-quote-card.test.tsx --maxWorkers=1 --no-coverage` → Expected PASS (update the success-path assertions to the async flow; preserve the friendly-error assertions from Slice A).

- [ ] **Step 8: Commit**

```bash
git add components/match/QuoteTab.tsx components/request/draft-quote-card.tsx lib/quote-jobs/use-quote-job.ts \
  lib/quote-jobs/__tests__/use-quote-job.test.tsx components/__tests__/quote-tab-generate-draft.test.tsx \
  components/request/__tests__/draft-quote-card.test.tsx
git commit -m "feat(quote): async UI flow — progress, SSE+poll, result render, retry"
```

**Verification:** hook + both component suites green; `npx tsc --noEmit` clean.
**Rollback:** `git revert <sha>` — restores the synchronous Slice-A UI (still bug-fixed).

---

### Stage 10 (S): Provider wiring docs + env

**Files:**
- Modify: `.env.local.example`
- Test: none (doc/config) — verify via `npx tsc --noEmit` only.

- [ ] **Step 1: Document the new env vars in `.env.local.example`**

```bash
# ── Draft-quote background workshop (claude-cli on founder subscription) ──
# claude-cli is invoked ONLY inside scripts/quote-workshop/worker.ts (a tsx script,
# NOT a Next handler). DRAFT_QUOTE_PROVIDER stays UNSET in Next — the route no longer
# calls callAiText; it enqueues a job. Do not set DRAFT_QUOTE_PROVIDER=claude-cli for
# the web process (the NEXT_RUNTIME guard at lib/ai-provider.ts:421 would reject it).
DRAFT_QUOTE_CLI_MODEL=claude-sonnet-4-6   # latency/quality balance for a quote email; opus = higher quality, ~2-3x slower
DRAFT_QUOTE_CLI_BUDGET_USD=0.20           # --max-budget-usd per call. Under subscription OAuth this is a SOFT spend
                                          # estimate the CLI enforces internally; it does not bill a card — it guards
                                          # against runaway loops. RAG-enriched quote prompts (~4-5 KB) need > the 0.05 default.
QUOTE_QUEUE_MAX_DEPTH=20                   # reject enqueue past this (429 queue_full)
QUOTE_JOB_TTL_MS=120000                    # processing jobs older than this are reaped to 'error'
INTERNAL_EVENT_TOKEN=                      # shared secret for worker → /api/internal/quote-event
INTERNAL_EVENT_URL=http://127.0.0.1:3000/api/internal/quote-event
```

**Model choice justification (record in PR description):** default `claude-sonnet-4-6` — a draft quote email is a short, structured generation where Sonnet's quality is sufficient and its latency (~5-15 s) keeps the workshop responsive; `claude-opus-4-7` is available via `DRAFT_QUOTE_CLI_MODEL` when a specific cargo needs higher-quality prose, at ~2-3× latency. Since this is now a background job, latency is less critical than under the old synchronous path — but Sonnet keeps the queue draining fast under the 1-concurrent serialization.

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "docs(quote): document workshop env vars + claude-cli model/budget semantics"
```

**Verification:** `npx tsc --noEmit` clean (no code change).
**Rollback:** `git revert <sha>`.

---

### Stage 10b (M): Match-aware justified rate (founder decision)

**Why:** when a quote is generated **from the match page**, the draft should propose a **justified, indicative rate** built from the match's real numbers — vessel (name/type/DWT), computed economics (TCE, breakeven freight), and a market benchmark — instead of falling back to `[RATE TO BE CONFIRMED]` when the client gave no rate. From the **cargo page** (`DraftQuoteCard`, no match context) behaviour stays exactly as today (the Stage 6 `[RATE TO BE CONFIRMED]` path is untouched). This stage is **value-bearing** — the rate is a number a partner will see — so it ends with a mandatory **VALUE_CHECK** step that proves the drafted rate derives from the inputs for a concrete match.

**Design (additive — does NOT rewrite Stages 4/6/8/9):**
- `buildQuotePrompt` (Stage 6) gains an **optional** `matchId`. When absent → identical output to Stage 6 (cargo path unchanged). When present → a deterministic `MATCH ECONOMICS & MARKET DATA` block + a rate-justification instruction is appended to the **user** prompt only (the global `DRAFT_QUOTE_SYSTEM_PROMPT` in `lib/prompts/draft.ts` is **not** edited — no literal removed).
- The numbers come from `getMatch(db, id)` (`lib/matching/matches-repository.ts:398`, `StoredMatch`: `vessel_name`, `vessel_dwt`, `load_port`, `discharge_port`, `tce_usd_per_day`, `freight_rate_usd_per_mt`, `freight_rate_source`, `distance_nm`) plus `getCurrentBenchmark('TOEPFER_TMI')` (`lib/market/benchmark.ts:23`, `MarketBenchmark.value` in USD/day, `.period`). matchId may be numeric or slug — resolve with `getMatch`/`getMatchBySlug` exactly as `app/match/[id]/page.tsx:43-50` does.
- **Indicative band (computed in code, never invented by the model):** `offeredRate = freight_rate_usd_per_mt`; `marketLow = offeredRate * (1 - INDICATIVE_SPREAD_PCT)`, `marketHigh = offeredRate * (1 + INDICATIVE_SPREAD_PCT)`, `INDICATIVE_SPREAD_PCT = 0.05` (named constant, documented). The builder passes `offeredRate`, `marketLow`, `marketHigh`, `tce_usd_per_day`, and the benchmark verbatim. The prompt instruction: *"Use ONLY the numbers in the MATCH ECONOMICS block — do NOT invent or round to a different rate. Present the offered rate as **indicative** (e.g. 'we can offer USD X.XX/mt, indicative; market range for this route USD LOW–HIGH/mt'). Do NOT output `[RATE TO BE CONFIRMED]` when an offered rate is present."*
- **Threading matchId to the worker:** the job row needs the id. Migration **049** adds a nullable `match_id TEXT` column to `ai_quote_jobs` (Stage 4's migration 048 is left untouched). `enqueueQuoteJob` accepts an optional `matchId`; the worker passes `job.match_id` into `buildQuotePrompt`.
- **Dedupe key stays `(session_id, email_id)`** (Stage 5). A match-page quote and a cargo-page quote for the same email dedupe together; for the demo that is acceptable — note it, do not change the key.
- **UI plumbing:** `useQuoteJob(emailId, matchId?)` includes `matchId` in the enqueue POST body. `QuoteTab` gains a `matchId` prop threaded `app/match/[id]/page.tsx → MatchTabs → QuoteTab`. `DraftQuoteCard` is **not** changed — it never passes `matchId`.

**Files:**
- Create: `lib/migrations/049-quote-jobs-match-id.ts`; Modify: `lib/migrations/index.ts` (register 049)
- Create: `lib/quote-jobs/match-context.ts` (`buildMatchQuoteContext(db, matchId)` → structured block + band) + test
- Modify: `lib/quote-jobs/prompt.ts` (optional `matchId` + `db`), `lib/quote-jobs/store.ts` (`QuoteJob.match_id`, `enqueueQuoteJob` optional `matchId`)
- Modify: `app/api/ai/draft-quote/route.ts` (read `matchId` from body, pass to enqueue), `lib/api-schemas.ts` (`DraftQuoteBodySchema` + optional `matchId`)
- Modify: `scripts/quote-workshop/worker.ts` (pass `job.match_id` to `buildQuotePrompt`)
- Modify: `lib/quote-jobs/use-quote-job.ts`, `components/match/QuoteTab.tsx`, `components/match/MatchTabs.tsx`, `app/match/[id]/page.tsx` (thread `matchId`)
- Tests: `lib/migrations/__tests__/049-quote-jobs-match-id.test.ts`, `lib/quote-jobs/__tests__/match-context.test.ts`, extend `lib/quote-jobs/__tests__/prompt.test.ts`, `lib/quote-jobs/__tests__/store.test.ts`, `app/api/ai/draft-quote/__tests__/draft-quote.test.ts`, `components/__tests__/quote-tab-generate-draft.test.tsx`

> **PI3 boundary:** this stage **adds** a conditional branch — it must NOT weaken any existing assertion. The Stage 6 prompt tests (no-match path → no economics block, `[RATE TO BE CONFIRMED]` rule intact) and the `DraftQuoteCard` tests (no `matchId` in body) must keep passing unchanged. If wiring `matchId` through forces rewriting > 5 existing expectation blocks → STOP, report `PLAN UPDATE NEEDED`. **Pre-removal grep is N/A** — no literal/env/export/route is removed (the `[RATE TO BE CONFIRMED]` string in `lib/prompts/draft.ts` stays exactly).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/migrations/__tests__/049-quote-jobs-match-id.test.ts
import Database from 'better-sqlite3';
import migration048 from '@/lib/migrations/048-ai-quote-jobs';
import migration049 from '@/lib/migrations/049-quote-jobs-match-id';

it('adds a nullable match_id column to ai_quote_jobs', () => {
  const db = new Database(':memory:');
  migration048.up(db); migration049.up(db);
  const cols = (db.prepare(`PRAGMA table_info(ai_quote_jobs)`).all() as { name: string }[]).map(c => c.name);
  expect(cols).toContain('match_id');
  // existing rows / inserts without match_id still work (nullable)
  expect(() => db.prepare(`INSERT INTO ai_quote_jobs (id,session_id,email_id,status) VALUES ('j','s','e','queued')`).run()).not.toThrow();
});
```

```ts
// lib/quote-jobs/__tests__/match-context.test.ts
import Database from 'better-sqlite3';
import { buildMatchQuoteContext, INDICATIVE_SPREAD_PCT } from '@/lib/quote-jobs/match-context';

// seed a StoredMatch row (vessel_name, vessel_dwt, load/discharge_port, tce_usd_per_day,
// freight_rate_usd_per_mt, distance_nm) into an in-memory matches table, then:
it('returns a block carrying ONLY the match numbers + a derived band', async () => {
  const ctx = await buildMatchQuoteContext(db, '54332'); // numeric id
  expect(ctx).not.toBeNull();
  expect(ctx!.block).toContain('MATCH ECONOMICS');
  expect(ctx!.offeredRate).toBeCloseTo(18.00, 2);
  expect(ctx!.marketLow).toBeCloseTo(18.00 * (1 - INDICATIVE_SPREAD_PCT), 2);
  expect(ctx!.marketHigh).toBeCloseTo(18.00 * (1 + INDICATIVE_SPREAD_PCT), 2);
  expect(ctx!.block).toContain('indicative');        // labels the rate
  expect(ctx!.block).toMatch(/use only/i);           // anti-hallucination instruction
});

it('returns null for an unknown match (caller falls back to the cargo path)', async () => {
  expect(await buildMatchQuoteContext(db, '999999')).toBeNull();
});
```

```ts
// extend lib/quote-jobs/__tests__/prompt.test.ts
it('injects the match economics block + indicative-rate instruction when matchId is given', async () => {
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false, matchId: '54332', db });
  expect(user).toContain('MATCH ECONOMICS');
  expect(user).toMatch(/indicative/i);
  expect(user).not.toContain('[RATE TO BE CONFIRMED]'); // suppressed when an offered rate exists
});

it('matchId omitted → byte-identical to the Stage 6 cargo path (no economics block)', async () => {
  const { user } = await buildQuotePrompt({ parsedCargo: cargo as any, email: email as any, ragEnabled: false });
  expect(user).not.toContain('MATCH ECONOMICS');
});
```

```ts
// extend lib/quote-jobs/__tests__/store.test.ts
it('persists match_id when enqueued from a match', () => {
  const d = db();
  const job = enqueueQuoteJob(d, { sessionId: 's1', emailId: 'e1', matchId: '54332' });
  expect(getQuoteJob(d, job.id)?.match_id).toBe('54332');
});
```

```tsx
// extend app/api/ai/draft-quote/__tests__/draft-quote.test.ts
it('forwards matchId from the body into the enqueued job', async () => {
  const r = await POST(reqWithSession({ emailId: 'e1', matchId: '54332' }));
  expect(r.status).toBe(202);
  // assert the store received matchId (spy on enqueueQuoteJob or read the row)
});
// extend components/__tests__/quote-tab-generate-draft.test.tsx
it('QuoteTab includes matchId in the enqueue POST body', async () => {
  render(<QuoteTab cargoEmailId="e1" matchId="54332" />);
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
  await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
  const body = JSON.parse((csrfFetch as jest.Mock).mock.calls[0][1].body);
  expect(body.matchId).toBe('54332');
});
```

- [ ] **Step 2: Run tests to verify they fail** — `npx jest lib/migrations/__tests__/049-quote-jobs-match-id.test.ts lib/quote-jobs/__tests__/match-context.test.ts lib/quote-jobs/__tests__/prompt.test.ts lib/quote-jobs/__tests__/store.test.ts --maxWorkers=1 --no-coverage` → FAIL (module/column/field not found).

- [ ] **Step 3a: Migration 049**

```ts
// lib/migrations/049-quote-jobs-match-id.ts
import type { Migration } from './types';
const migration049: Migration = {
  version: 49,
  name: '049-quote-jobs-match-id',
  up(db)  { db.exec(`ALTER TABLE ai_quote_jobs ADD COLUMN match_id TEXT`); },
  down(db){ db.exec(`ALTER TABLE ai_quote_jobs DROP COLUMN match_id`); }, // SQLite ≥3.35 (same baseline as Stage 5 RETURNING)
};
export default migration049;
```
Register in `lib/migrations/index.ts` after `migration048`.

- [ ] **Step 3b: `match-context.ts` (numbers-only block + derived band)**

```ts
// lib/quote-jobs/match-context.ts
import type Database from 'better-sqlite3';
import { getMatch, getMatchBySlug } from '@/lib/matching/matches-repository';
import { getCurrentBenchmark } from '@/lib/market/benchmark';

export const INDICATIVE_SPREAD_PCT = 0.05; // ±5% band around the computed freight rate

export interface MatchQuoteContext {
  block: string; offeredRate: number; marketLow: number; marketHigh: number;
}

/** Returns a numbers-only economics block for a match, or null if the match / its rate is unavailable. */
export async function buildMatchQuoteContext(db: Database.Database, matchId: string): Promise<MatchQuoteContext | null> {
  const m = /^\d+$/.test(matchId) ? getMatch(db, Number(matchId)) : getMatchBySlug(db, matchId);
  if (!m || m.freight_rate_usd_per_mt == null) return null; // no offered rate → caller keeps the [RATE TO BE CONFIRMED] path
  const offeredRate = m.freight_rate_usd_per_mt;
  const marketLow = offeredRate * (1 - INDICATIVE_SPREAD_PCT);
  const marketHigh = offeredRate * (1 + INDICATIVE_SPREAD_PCT);
  const tmi = await getCurrentBenchmark('TOEPFER_TMI').catch(() => null);
  const block = [
    '=== MATCH ECONOMICS & MARKET DATA (use ONLY these numbers — do NOT invent or re-round a rate) ===',
    `Vessel: ${m.vessel_name ?? 'n/a'} (DWT ${m.vessel_dwt ?? 'n/a'})`,
    `Route: ${m.load_port ?? 'n/a'} → ${m.discharge_port ?? 'n/a'} (${m.distance_nm ?? 'n/a'} nm)`,
    `Computed TCE: USD ${m.tce_usd_per_day ?? 'n/a'}/day (freight source: ${m.freight_rate_source ?? 'n/a'})`,
    `Offered freight rate (INDICATIVE): USD ${offeredRate.toFixed(2)}/mt`,
    `Indicative market range for this route: USD ${marketLow.toFixed(2)}–${marketHigh.toFixed(2)}/mt`,
    tmi ? `Market benchmark (Toepfer TMI ${tmi.period}): USD ${tmi.value}/day TCE` : '',
    'Present the offered rate as INDICATIVE; cite the market range. Do NOT output [RATE TO BE CONFIRMED] when an offered rate is present.',
    '====================================================================================',
  ].filter(Boolean).join('\n');
  return { block, offeredRate, marketLow, marketHigh };
}
```

- [ ] **Step 3c: `prompt.ts` — optional matchId**

Extend `BuildArgs` with `matchId?: string` and `db?: Database.Database`. After assembling the existing `user` string (Stage 6), if `matchId && db`, fetch `buildMatchQuoteContext(db, matchId)`; when non-null, append `\n\n${ctx.block}` to `user`. When null (unknown match or no offered rate) → leave `user` unchanged (cargo behaviour). **No change to the `system` prompt.**

- [ ] **Step 3d: `store.ts` + route + schema + worker wiring**
- `QuoteJob` gains `match_id: string | null`; `enqueueQuoteJob(db, { sessionId, emailId, matchId? }, opts)` writes `match_id` (INSERT column + dedupe SELECT unchanged).
- `DraftQuoteBodySchema` (`lib/api-schemas.ts`): add `matchId: z.string().optional()`.
- `route.ts`: `const { emailId, matchId } = parsed.data;` → `enqueueQuoteJob(getStore().getDb(), { sessionId, emailId, matchId });`.
- `worker.ts`: `buildQuotePrompt({ parsedCargo, email, ragEnabled: isRagEnabled(), matchId: job.match_id ?? undefined, db });`.

- [ ] **Step 3e: UI threading**
- `useQuoteJob(emailId?, matchId?)` → include `matchId` in the enqueue body.
- `QuoteTab` props gain `matchId?: string`; pass to `useQuoteJob`. Thread `matchId` from `app/match/[id]/page.tsx` (the resolved id) → `MatchTabs` → `QuoteTab`.
- `DraftQuoteCard` unchanged (never passes `matchId` → cargo path).

- [ ] **Step 4: Run tests to verify they pass** — `npx jest lib/migrations lib/quote-jobs app/api/ai/draft-quote components/__tests__/quote-tab-generate-draft.test.tsx components/request/__tests__/draft-quote-card.test.tsx --maxWorkers=1 --no-coverage` → PASS (incl. unchanged no-match prompt test + unchanged DraftQuoteCard tests).

- [ ] **Step 5: Commit**

```bash
git add lib/migrations/049-quote-jobs-match-id.ts lib/migrations/index.ts lib/quote-jobs/match-context.ts \
  lib/quote-jobs/prompt.ts lib/quote-jobs/store.ts app/api/ai/draft-quote/route.ts lib/api-schemas.ts \
  scripts/quote-workshop/worker.ts lib/quote-jobs/use-quote-job.ts components/match/QuoteTab.tsx \
  components/match/MatchTabs.tsx app/match/[id]/page.tsx \
  lib/migrations/__tests__/049-quote-jobs-match-id.test.ts lib/quote-jobs/__tests__/match-context.test.ts \
  lib/quote-jobs/__tests__/prompt.test.ts lib/quote-jobs/__tests__/store.test.ts \
  app/api/ai/draft-quote/__tests__/draft-quote.test.ts components/__tests__/quote-tab-generate-draft.test.tsx
git commit -m "feat(quote): match-aware indicative rate — vessel+economics+benchmark into draft (no invented rates)"
```

- [ ] **Step 6: VALUE_CHECK (MANDATORY — value-bearing rate a partner sees)**

This stage emits a rate number to a partner, so an automated string-passes check is **not** sufficient — the drafted rate must be proven to derive from the match inputs for a **concrete** match. At execution time, against a DB seeded with match `54332`:

```bash
# 1. Read the source-of-truth numbers for the match:
#    offeredRate = freight_rate_usd_per_mt, tce = tce_usd_per_day  (from getMatch(db,54332))
# 2. Generate a REAL draft via the worker path for an enqueued match-aware job (matchId=54332).
# 3. Extract the rate the model wrote and assert it equals offeredRate AND lies within
#    [offeredRate*0.95, offeredRate*1.05]; assert the draft does NOT contain "[RATE TO BE CONFIRMED]".
npm run quote:workshop   # drains the seeded match-aware job → writes result
```

```ts
// value-check assertion (run as a tsx/jest one-off; cite the concrete numbers in the report)
const m = getMatch(db, 54332);                          // e.g. freight_rate_usd_per_mt = 18.00, tce = 12450
const draft = getQuoteJob(db, jobId)!.result!;
const rate = Number(draft.match(/USD\s+(\d+\.\d{2})\s*\/mt/i)?.[1]);
assert(rate === m.freight_rate_usd_per_mt, `drafted rate ${rate} != match ${m.freight_rate_usd_per_mt}`);
assert(rate >= m.freight_rate_usd_per_mt*0.95 && rate <= m.freight_rate_usd_per_mt*1.05, 'rate outside indicative band');
assert(!/\[RATE TO BE CONFIRMED\]/.test(draft), 'placeholder leaked despite economics present');
```

Then emit the verdict (orchestrator tool — do NOT hunt for the script; the orchestrator runs it from your `.done`, or call it by bare name if explicitly told it is on PATH):

```bash
value-check-emit.sh <pr> PASS "match=54332 offered=USD18.00/mt drafted=USD18.00/mt band=17.10-18.90 tce=12450/day no-placeholder"
```

A draft whose rate is invented, out of band, or that still shows `[RATE TO BE CONFIRMED]` despite an offered rate present → emit `FAIL`, do not proceed to Stage 11.

**Verification:** all new + extended test files green; `npx tsc --noEmit` clean; Step 6 VALUE_CHECK = PASS with the concrete numbers cited.
**Rollback:** `git revert <sha>`; on a live DB run `migration049.down(db)`. The cargo path and Stages 4–10 are unaffected — reverting only removes the optional match block (jobs simply stop carrying `match_id`).

---

### Stage 11 (M): PROD provisioning (outreach-vps) + deploy gate

**Files:** ops/docs only — `docs/superpowers/plans/2026-06-10-draft-quote-claude-cli-workshop.md` (this runbook section) + any prod deploy notes file. No app-code change.

Recon verified the `claude` binary + `~/.claude/.credentials.json` exist on **dev-vps only**. Prod is **outreach-vps** and must be provisioned before the feature works there.

- [ ] **Step 1: Verify/install the claude CLI on outreach-vps**

```bash
ssh outreach-vps 'command -v claude && claude --version'   # expect Claude Code vX.Y.Z
# If absent: install per the same method used on dev-vps (npm i -g @anthropic-ai/claude-code or the documented installer),
# then re-verify. Pin the same major version as dev-vps to avoid --output-format json drift.
```

- [ ] **Step 2: Provision auth (OAuth subscription)**

```bash
# Option A (preferred): copy the founder's OAuth credentials to outreach-vps under the pm2 service user's HOME:
ssh outreach-vps 'test -f ~/.claude/.credentials.json && echo OK || echo MISSING'
# If MISSING: place ~/.claude/.credentials.json (600 perms) for the SAME user pm2 runs quantika-demo as.
# Option B: set CLAUDE_CODE_OAUTH_TOKEN in the pm2 env (see Step 3). Verify either path with a dry run:
ssh outreach-vps 'echo "ping" | claude --print --model claude-sonnet-4-6 --output-format json --max-budget-usd 0.05'
# expect JSON with is_error:false.
```

> The pm2 service user's `$HOME` must contain the credentials (or `CLAUDE_CODE_OAUTH_TOKEN` must be in pm2 env) — a detached child started by pm2 inherits pm2's env/HOME, not your interactive shell's.

- [ ] **Step 3: pm2 / systemd env**

```bash
# Add to the prod env (ecosystem file or .env consumed by deploy-vps.sh):
#   INTERNAL_EVENT_TOKEN=<generate a strong secret>
#   INTERNAL_EVENT_URL=http://127.0.0.1:<prod-port>/api/internal/quote-event
#   DRAFT_QUOTE_CLI_MODEL / DRAFT_QUOTE_CLI_BUDGET_USD / QUOTE_QUEUE_MAX_DEPTH / QUOTE_JOB_TTL_MS as desired
#   (optionally) CLAUDE_CODE_OAUTH_TOKEN=<token>
# Apply env (CLAUDE.md rule — reload does NOT re-read env):
ssh outreach-vps 'pm2 restart quantika-demo --update-env'
```

> **CLAUDE.md NEXT_PUBLIC rule:** none of the new vars are `NEXT_PUBLIC_*`, so no client-bundle rebuild is required for them. But the new routes/pages (`/api/ai/draft-quote/status`, `/api/internal/quote-event`) require a full `npm run build` before they exist — deploy-vps.sh already runs the build; do not hot-swap files (avoids "client reference manifest does not exist").

- [ ] **Step 4: Run migration 048 on prod**

```bash
# Confirm migrations run on boot (the app applies allMigrations at startup). After deploy:
ssh outreach-vps "sqlite3 <prod-db-path> \"SELECT name FROM sqlite_master WHERE name='ai_quote_jobs';\""  # expect ai_quote_jobs
```

- [ ] **Step 5: DEPLOY GATE — partner repro green**

```
Manual gate (browser-driven, per orchestrator rule — no curl-only outage claims):
1. Open https://<prod-host>/match/54332  (also 54333, 54335)
2. Open the Quote tab, click Generate.
3. Expect: button → "Generating…", then either the drafted quote renders OR a FRIENDLY
   error toast + Retry button. MUST NOT show "Unexpected end of JSON input" or "Unexpected token '<'".
4. Wait ≥3 s for hydration; confirm document.body.innerText contains the draft or the friendly message.
5. Match-aware (Stage 10b): when the draft renders for a match WITH a computed freight rate,
   it MUST show an INDICATIVE rate + market range (not "[RATE TO BE CONFIRMED]"), and the rate
   MUST match the match's freight_rate_usd_per_mt (re-confirms the Stage 10b VALUE_CHECK in prod).
```

Gate passes only when all three matches show the async flow with no raw SyntaxError. If the CLI auth is missing on prod, the job ends `error` and the UI shows the friendly retry message (graceful) — fix auth (Step 2) and re-run the gate.

- [ ] **Step 6: Commit the runbook** (this plan file already contains it; no separate commit needed unless prod notes live elsewhere).

**Verification:** Step 1-4 commands return the expected output; Step 5 gate green in a real browser on all three matches.
**Rollback:** set `DRAFT_QUOTE_CLI_*` aside and `git revert` the Slice-B route commit (Stage 8) to restore synchronous generation; Slice-A fixes stay. Worker/queue tables are inert when the route no longer enqueues.

---

## Concurrency & Safety Summary (founder requirement #6)

| Concern | Mechanism | Where |
|---------|-----------|-------|
| ≤1-2 concurrent CLI calls | Serial worker loop (processes one job at a time) | `scripts/quote-workshop/worker.ts` |
| No duplicate CLI per match | Dedupe on `(session_id, email_id)` in-flight | `enqueueQuoteJob` |
| Queue overflow | Depth guard → `429 queue_full` | `enqueueQuoteJob` + route |
| Crashed worker wedging queue | Stale-TTL reaper flips `processing` → `error` | `reapStaleJobs` (run at worker start) |
| Spawn storms | 5 s cooldown single-flight | `ensureWorker` |
| Survives pm2 restart | Jobs persisted in `ai_quote_jobs` SQLite table | migration 048 |
| Worker race on same row | Atomic `UPDATE … RETURNING` claim | `claimNextJob` |

---

## Test Inventory (TDD, jest worktree isolation per repo convention)

Run each with `--maxWorkers=1 --ci --forceExit --no-coverage` (VPS: never parallel waves > 2; full suite ~580 s).

| Stage | Test file | Behavioral assertion (PI2) |
|-------|-----------|----------------------------|
| 1 | `lib/http/__tests__/parse-json-response.test.ts` | real `parseJsonResponse(res)` calls on empty/HTML/JSON bodies |
| 2 | `components/__tests__/quote-tab-generate-draft.test.tsx` | rendered `QuoteTab`, click, `toast.error` content |
| 3 | `components/request/__tests__/draft-quote-card.test.tsx` | rendered `DraftQuoteCard`, click, toast + draft render |
| 4 | `lib/migrations/__tests__/048-ai-quote-jobs.test.ts` | real `migration048.up/down` on in-memory DB |
| 5 | `lib/quote-jobs/__tests__/store.test.ts` | real CRUD/claim/dedupe/reap on in-memory DB |
| 6 | `lib/quote-jobs/__tests__/prompt.test.ts` | real `buildQuotePrompt` output strings |
| 7 | `lib/jobs/__tests__/event-emitter-quote.test.ts`, `app/api/internal/__tests__/quote-event.test.ts`, `app/api/ai/draft-quote/__tests__/status.test.ts`, `__tests__/middleware-auth.test.ts` | real subscribe/emit; real route `POST/GET` |
| 8 | `app/api/ai/draft-quote/__tests__/draft-quote.test.ts`, `lib/quote-jobs/__tests__/ensure-worker.test.ts` | real route `POST` → 202 {jobId}; injected-spawn single-flight |
| 9 | `lib/quote-jobs/__tests__/use-quote-job.test.tsx`, both component suites | hook state machine with mocked EventSource + polling |
| 10b | `lib/migrations/__tests__/049-quote-jobs-match-id.test.ts`, `lib/quote-jobs/__tests__/match-context.test.ts`, extended `prompt`/`store`/`draft-quote`/`quote-tab` tests | real migration up/down; real `buildMatchQuoteContext` on seeded match; matchId threaded enqueue→store→prompt; `matchId` in QuoteTab POST body. **+ VALUE_CHECK** (Step 6): real drafted rate for match `54332` proven to equal/derive from `freight_rate_usd_per_mt` + band, no placeholder leak |

---

## Self-Review

**Spec coverage:**
- (1) Client bug fixes — Stages 1-3 (res.ok-before-json, content-type guard, friendly message, DraftQuoteCard toast). ✅
- (2) Background workshop (fast jobId, detached spawn outside Next, callClaudeCliRaw, guard intact, SQLite persist, SSE + poll) — Stages 4-8. ✅
- (3) UI async flow (progress, result, retry, error) — Stage 9. ✅
- (4) Provider wiring (claude-cli only in script, env out of Next, model justification, --max-budget-usd semantics) — Stages 8 + 10. ✅
- (5) PROD provisioning (verify/install CLI + auth on outreach-vps, systemd/pm2 env, NEXT_PUBLIC rebuild rules, deploy-gate partner repro) — Stage 11. ✅
- (8) Match-aware justified rate (founder decision): optional `matchId` into `buildQuotePrompt`; vessel+economics+benchmark numbers injected; indicative-rate label; ONLY-provided-numbers / no-invented-rate instruction; cargo path unchanged; **VALUE_CHECK** on a concrete match — Stage 10b. ✅
- (6) Concurrency (serialize, depth, dedupe, stale-TTL) — Stage 5 + summary table. ✅
- (7) TDD test list per stage + jest worktree isolation — every stage + test inventory. ✅

**Single-architecture (founder):** no API-fallback variant anywhere; the route either enqueues or returns 429/500. ✅ ToS constraint stated once at top. ✅

**Invariant preservation:** `lib/ai-provider.ts:421` NEXT_RUNTIME guard untouched; worker has no NEXT_RUNTIME (`ensureWorker` strips it from child env). `.claude/rules/ai-provider.md` and `.claude/rules/admin-api.md` (middleware bypass for the internal route) both respected. ✅

**Type consistency:** `QuoteJob`/`QuoteJobStatus` from `store.ts` used uniformly; `QUOTE_UPDATE_EVENT` single-sourced from `event-emitter.ts`; `parseJsonResponse`/`FriendlyHttpError` names consistent across Stages 1-3 + 9. ✅

**Open verification flags for the implementer (STOP-and-report if violated):** `better-sqlite3` `RETURNING` support (Stage 5 note), `getStore().getSessionById` availability (Stage 8 note), and the draft-quote test rewrite staying ≤5 expectation blocks (Stage 8 PI3 note).
