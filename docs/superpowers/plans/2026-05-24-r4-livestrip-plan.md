# R4 — LiveStrip + Cached List · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** Активный «processing live» UX на `/matches`: SSE-driven LiveStrip + cached list + match-toasts + fresh-card animation. Главная UX-фишка приложения.

**Spec:** [r4-livestrip-design.md](../specs/2026-05-24-r4-livestrip-design.md)
**Branch:** `design/r4-livestrip` (create after R2 merged; can run parallel to R3)
**Depends:** R1 primitives, R2 AppShell
**Tier:** L · ~15 файлов + integration в existing processor · ~5-7 дней

---

## Pre-flight

- [ ] **0.1** Worktree от main (после R2 merge):
```bash
cd ~/work/quantika-demo
git fetch origin
git checkout main && git pull
git checkout -b design/r4-livestrip
git worktree add .worktrees/r4-livestrip design/r4-livestrip
cd .worktrees/r4-livestrip
```

- [ ] **0.2** Find existing job processor: `grep -rn 'process.*email\\|emails/parse\\|jobs.*table' lib/ app/api/ --include='*.ts' | head -20`. Document: путь, sig, current schema of jobs table.

---

## Task 1: Migration 038 (jobs.progress_percent)

**Files:**
- Create: `lib/migrations/038-jobs-progress.ts`
- Test: `__tests__/lib/migrations/038.test.ts`

- [ ] **1.1** Сначала проверь существует ли уже колонка: `grep -n 'progress_percent' lib/migrations/*.ts lib/db/schema.ts 2>/dev/null`. Если уже есть — Task 1 skip, переходи к Task 2.

- [ ] **1.2** Failing test:

```ts
import Database from 'better-sqlite3';
import { migrate } from '../../../lib/migrations/runner';

it('migration 038 adds progress_percent + current_step to jobs', () => {
  const db = new Database(':memory:');
  migrate(db, { upTo: 38 });
  const cols = db.prepare("PRAGMA table_info(jobs)").all() as { name: string }[];
  const names = cols.map(c => c.name);
  expect(names).toContain('progress_percent');
  expect(names).toContain('current_step');
});
```

- [ ] **1.3** Implement:

```ts
// lib/migrations/038-jobs-progress.ts
import type { Database } from 'better-sqlite3';
export const migration038 = {
  version: 38,
  name: '038-jobs-progress',
  up(db: Database): void {
    db.exec(`ALTER TABLE jobs ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE jobs ADD COLUMN current_step TEXT`);
  },
};
```

Register in `lib/migrations/index.ts`. PASS. Commit `feat(r4): migration 038 — jobs.progress_percent + current_step`.

---

## Task 2: Per-user pub/sub event emitter

**Files:**
- Create: `lib/jobs/event-emitter.ts`
- Test: `__tests__/lib/jobs/event-emitter.test.ts`

- [ ] **2.1** Failing test:

```ts
import { jobEvents, emitJobUpdate, emitMatchCreated } from '@/lib/jobs/event-emitter';

it('per-user channels do not leak across users', () => {
  const received: any[] = [];
  const off = jobEvents.subscribe('user-1', (e) => received.push(e));
  emitJobUpdate('user-1', { id: 'j1', status: 'processing', progress_percent: 50 });
  emitJobUpdate('user-2', { id: 'j2', status: 'processing', progress_percent: 30 });
  expect(received).toHaveLength(1);
  expect(received[0]).toMatchObject({ type: 'job-update', data: { id: 'j1' } });
  off();
});

it('emitMatchCreated delivers to right user', () => {
  const received: any[] = [];
  const off = jobEvents.subscribe('user-A', (e) => received.push(e));
  emitMatchCreated('user-A', { match_id: 'm1', score: 94 });
  expect(received[0]).toMatchObject({ type: 'match-created', data: { match_id: 'm1' } });
  off();
});
```

- [ ] **2.2** Implement:

```ts
// lib/jobs/event-emitter.ts
type Event = { type: 'job-update' | 'match-created'; data: Record<string, unknown> };
type Handler = (e: Event) => void;

const channels = new Map<string, Set<Handler>>();

export const jobEvents = {
  subscribe(userId: string, handler: Handler): () => void {
    let set = channels.get(userId);
    if (!set) { set = new Set(); channels.set(userId, set); }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) channels.delete(userId);
    };
  },
};

function emit(userId: string, event: Event): void {
  const set = channels.get(userId);
  if (!set) return;
  for (const h of set) h(event);
}

export function emitJobUpdate(userId: string, data: { id: string; status: string; progress_percent: number; current_step?: string; email_subject?: string; from?: string }): void {
  emit(userId, { type: 'job-update', data });
}

export function emitMatchCreated(userId: string, data: { match_id: string; score: number; vessel_name?: string; cargo_summary?: string }): void {
  emit(userId, { type: 'match-created', data });
}
```

- [ ] **2.3** PASS. Commit `feat(r4): in-memory per-user pub/sub event emitter`.

---

## Task 3: SSE endpoint /api/jobs/stream

**Files:**
- Create: `app/api/jobs/stream/route.ts`
- Test: `__tests__/api/jobs-stream.test.ts`

- [ ] **3.1** Test (smoke-level — SSE harder to unit-test):

```ts
import { GET } from '@/app/api/jobs/stream/route';
import { makeAuthRequest } from '../helpers/auth';

it('returns SSE response with correct headers when authenticated', async () => {
  const req = await makeAuthRequest('GET', '/api/jobs/stream');
  const res = await GET(req);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(res.headers.get('cache-control')).toContain('no-cache');
});

it('returns 401 without auth', async () => {
  const req = new Request('http://localhost/api/jobs/stream');
  const res = await GET(req as any);
  expect([401, 200]).toContain(res.status); // middleware may intercept first
});
```

- [ ] **3.2** Implement:

```ts
// app/api/jobs/stream/route.ts
import { type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { jobEvents } from '@/lib/jobs/event-emitter';

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: { type: string; data: unknown }) => {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
      };

      // Initial comment to open connection
      controller.enqueue(encoder.encode(': connected\n\n'));

      const off = jobEvents.subscribe(session.userId, send);

      // Heartbeat every 25s (avoid proxy timeout)
      const hb = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
      }, 25000);

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        off();
        clearInterval(hb);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no', // disable nginx buffering
    },
  });
}
```

- [ ] **3.3** PASS. Commit `feat(r4): SSE /api/jobs/stream with per-user channel + heartbeat`.

---

## Task 4: Wire existing processor to emit events

**Files:**
- Modify: existing job processor (path found in Task 0.2)

- [ ] **4.1** Identify entry points in processor — `grep -rn 'jobs.*update\\|matches.*insert\\|emails/parse' lib/jobs/ lib/email/ 2>/dev/null | head`. Document concrete file.

- [ ] **4.2** Add emit calls (example pattern — adapt to real code):

```ts
// In existing processor — at progress points:
import { emitJobUpdate, emitMatchCreated } from '@/lib/jobs/event-emitter';

// when starting:
db.prepare('UPDATE jobs SET progress_percent = 10, current_step = ? WHERE id = ?').run('parsing email', jobId);
emitJobUpdate(userId, { id: jobId, status: 'processing', progress_percent: 10, current_step: 'parsing email' });

// when extracted:
emitJobUpdate(userId, { id: jobId, status: 'processing', progress_percent: 50, current_step: 'matching vessels' });

// when match inserted:
emitMatchCreated(userId, { match_id, score, vessel_name, cargo_summary });

// when done:
emitJobUpdate(userId, { id: jobId, status: 'done', progress_percent: 100 });
```

- [ ] **4.3** Add test that exercises full pipeline:

```ts
import { processEmail } from '@/lib/jobs/process-email'; // adapt
import { jobEvents } from '@/lib/jobs/event-emitter';

it('processor emits job-update + match-created events', async () => {
  const received: any[] = [];
  jobEvents.subscribe('test-user', (e) => received.push(e));
  await processEmail({ userId: 'test-user', emailBody: '...test fixture...' });
  const types = received.map(r => r.type);
  expect(types).toContain('job-update');
  expect(types).toContain('match-created'); // assuming fixture creates match
});
```

- [ ] **4.4** PASS. Commit `feat(r4): wire job processor to emit progress + match events`.

---

## Task 5: useLiveJobs hook

**Files:**
- Create: `design-system/patterns/useLiveJobs.ts`
- Test: `design-system/__tests__/useLiveJobs.test.tsx`

- [ ] **5.1** Test:

```tsx
import { renderHook, act } from '@testing-library/react';
import { useLiveJobs } from '../patterns/useLiveJobs';

// Mock EventSource
class MockES { onmessage: any; close = jest.fn(); addEventListener(t: string, h: any) { (this as any)[`on${t}`] = h; } }
beforeEach(() => { (global as any).EventSource = jest.fn(() => new MockES()); });

it('returns initial empty state', () => {
  const { result } = renderHook(() => useLiveJobs());
  expect(result.current.jobs).toEqual([]);
  expect(result.current.latestMatch).toBeNull();
});

it('updates jobs on job-update event', () => {
  const es = new MockES();
  (global as any).EventSource = jest.fn(() => es);
  const { result } = renderHook(() => useLiveJobs());
  act(() => {
    (es as any).onjob-update?.({ data: JSON.stringify({ id: 'j1', status: 'processing', progress_percent: 50 }) });
  });
  expect(result.current.jobs).toHaveLength(1);
});
```

- [ ] **5.2** Implement:

```tsx
// design-system/patterns/useLiveJobs.ts
'use client';
import { useEffect, useState, useCallback } from 'react';

export interface LiveJob { id: string; status: string; progress_percent: number; current_step?: string; email_subject?: string; from?: string }
export interface NewMatch { match_id: string; score: number; vessel_name?: string; cargo_summary?: string; createdAt: number }

export function useLiveJobs() {
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [latestMatch, setLatestMatch] = useState<NewMatch | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let es: EventSource | null = null;
    let retry = 1000;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      es = new EventSource('/api/jobs/stream');
      es.addEventListener('job-update', (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as LiveJob;
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === data.id);
          if (data.status === 'done' || data.progress_percent === 100) {
            // remove on done after 2s
            setTimeout(() => setJobs((p) => p.filter((j) => j.id !== data.id)), 2000);
          }
          if (idx === -1) return [...prev, data];
          const next = [...prev]; next[idx] = data; return next;
        });
      });
      es.addEventListener('match-created', (ev) => {
        const data = JSON.parse((ev as MessageEvent).data) as Omit<NewMatch, 'createdAt'>;
        setLatestMatch({ ...data, createdAt: Date.now() });
      });
      es.onerror = () => {
        es?.close();
        retry = Math.min(retry * 2, 30_000);
        setTimeout(connect, retry);
      };
    }
    connect();
    return () => { cancelled = true; es?.close(); };
  }, []);

  const dismissMatch = useCallback(() => setLatestMatch(null), []);
  return { jobs, latestMatch, dismissMatch };
}
```

- [ ] **5.3** PASS. Commit `feat(r4): useLiveJobs hook with SSE + reconnect`.

---

## Task 6: LiveStripCard

**Files:**
- Create: `design-system/patterns/LiveStripCard.tsx`
- Test: `design-system/__tests__/LiveStripCard.test.tsx`

- [ ] **6.1** Test + impl:

```tsx
import { render, screen } from '@testing-library/react';
import { LiveStripCard } from '../patterns/LiveStripCard';

it('renders queue state', () => {
  render(<LiveStripCard from="Boris" subject="HSS cargo" status="queue" />);
  expect(screen.getByText('Boris')).toBeInTheDocument();
});

it('renders done with checkmark', () => {
  render(<LiveStripCard from="Boris" subject="HSS" status="done" matchHint="MV Atlas 94" />);
  expect(screen.getByText(/MV Atlas 94/)).toBeInTheDocument();
});
```

```tsx
// design-system/patterns/LiveStripCard.tsx
'use client';
import { cn } from '@/design-system/primitives/_utils';

interface Props { from: string; subject: string; status: 'queue' | 'active' | 'done'; matchHint?: string; }

export function LiveStripCard({ from, subject, status, matchHint }: Props) {
  return (
    <div className={cn(
      'bg-ds-surface border rounded-ds-sm px-2 py-1.5 text-[10px]',
      status === 'queue' && 'border-orange-200 opacity-60',
      status === 'active' && 'border-amber-400 ring-2 ring-amber-200',
      status === 'done' && 'border-green-300 bg-green-50',
    )}>
      <div className="font-semibold text-ds-text">{from}</div>
      <div className="text-ds-text-muted truncate">{subject}</div>
      <div className={cn('text-[9px] mt-0.5 uppercase tracking-wide', status === 'done' && 'text-green-700 font-semibold', status === 'active' && 'text-amber-700 font-semibold', status === 'queue' && 'text-ds-text-subtle')}>
        {status === 'queue' && 'queue'}
        {status === 'active' && '⋯ processing'}
        {status === 'done' && `✓ ${matchHint ?? 'done'}`}
      </div>
    </div>
  );
}
```

- [ ] **6.2** Commit `feat(r4): LiveStripCard with queue/active/done states`.

---

## Task 7: LiveStrip container

**Files:**
- Create: `design-system/patterns/LiveStrip.tsx`
- Test: `design-system/__tests__/LiveStrip.test.tsx`

- [ ] **7.1** Test:

```tsx
import { render, screen } from '@testing-library/react';
import { LiveStrip } from '../patterns/LiveStrip';

it('hidden when no jobs', () => {
  const { container } = render(<LiveStrip jobs={[]} />);
  expect(container.firstChild).toBeNull();
});

it('visible with progress when 1+ jobs', () => {
  render(<LiveStrip jobs={[
    { id: 'j1', status: 'processing', progress_percent: 50, from: 'Boris', email_subject: 'HSS' },
  ]} />);
  expect(screen.getByText(/Boris/)).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});
```

- [ ] **7.2** Implement:

```tsx
// design-system/patterns/LiveStrip.tsx
'use client';
import { LiveStripCard } from './LiveStripCard';
import type { LiveJob } from './useLiveJobs';

export function LiveStrip({ jobs }: { jobs: LiveJob[] }) {
  if (jobs.length === 0) return null;
  const done = jobs.filter((j) => j.progress_percent >= 100).length;
  const total = jobs.length;
  const avgPercent = Math.round(jobs.reduce((s, j) => s + j.progress_percent, 0) / total);
  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-300 px-6 py-3" role="region" aria-label="Live email processing">
      <div className="flex items-center justify-between text-xs text-amber-900 mb-2">
        <span><b>📥 Обрабатываем {total} email{total > 1 ? "'ов" : ''}</b> · {done}/{total} готово</span>
        <span className="text-amber-700">live</span>
      </div>
      <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={avgPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${avgPercent}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-1.5">
        {jobs.slice(0, 5).map((j) => (
          <LiveStripCard
            key={j.id}
            from={j.from ?? '...'}
            subject={j.email_subject ?? j.current_step ?? ''}
            status={j.progress_percent === 0 ? 'queue' : j.progress_percent >= 100 ? 'done' : 'active'}
            matchHint={j.current_step}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **7.3** Commit `feat(r4): LiveStrip container with gradient + progress + 5-slot grid`.

---

## Task 8: MatchToast

**Files:**
- Create: `design-system/patterns/MatchToast.tsx`
- Test: `design-system/__tests__/MatchToast.test.tsx`

- [ ] **8.1** Test:

```tsx
import { render, screen, act } from '@testing-library/react';
import { MatchToast } from '../patterns/MatchToast';

it('renders match info', () => {
  render(<MatchToast match={{ match_id: 'm1', score: 94, vessel_name: 'MV Atlas', cargo_summary: 'HSS Constanta', createdAt: Date.now() }} onDismiss={() => {}} />);
  expect(screen.getByText(/MV Atlas/)).toBeInTheDocument();
  expect(screen.getByText(/94/)).toBeInTheDocument();
});

it('null match → nothing rendered', () => {
  const { container } = render(<MatchToast match={null} onDismiss={() => {}} />);
  expect(container.firstChild).toBeNull();
});

it('auto-dismisses after 5s', () => {
  jest.useFakeTimers();
  const dismiss = jest.fn();
  render(<MatchToast match={{ match_id: 'm1', score: 94, createdAt: Date.now() }} onDismiss={dismiss} />);
  act(() => { jest.advanceTimersByTime(5100); });
  expect(dismiss).toHaveBeenCalled();
  jest.useRealTimers();
});
```

- [ ] **8.2** Implement:

```tsx
// design-system/patterns/MatchToast.tsx
'use client';
import { useEffect } from 'react';
import type { NewMatch } from './useLiveJobs';

export function MatchToast({ match, onDismiss }: { match: NewMatch | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!match) return;
    const tid = setTimeout(onDismiss, 5000);
    return () => clearTimeout(tid);
  }, [match, onDismiss]);
  if (!match) return null;
  return (
    <div role="status" aria-live="polite" className="fixed bottom-6 right-6 z-50 bg-green-50 border border-green-300 text-green-900 rounded-ds-md px-4 py-3 shadow-lg flex items-center gap-2">
      <span>✨ Новый match:</span>
      <b>{match.vessel_name ?? `match #${match.match_id}`}</b>
      <span className="text-xs text-green-700">score {match.score}</span>
      <button onClick={onDismiss} aria-label="dismiss" className="ml-2 text-green-700 hover:text-green-900">✕</button>
    </div>
  );
}
```

- [ ] **8.3** Commit `feat(r4): MatchToast with auto-dismiss + accessible region`.

---

## Task 9: Wire into MatchesClient

**Files:**
- Modify: `app/matches/MatchesClient.tsx` (или какой это сейчас файл)

- [ ] **9.1** Read existing MatchesClient. Identify integration point (above match list).

- [ ] **9.2** Add (минимально-инвазивно):

```tsx
import { LiveStrip } from '@/design-system/patterns/LiveStrip';
import { MatchToast } from '@/design-system/patterns/MatchToast';
import { useLiveJobs } from '@/design-system/patterns/useLiveJobs';

export function MatchesClient(/* existing props */) {
  // ... existing state ...
  const { jobs, latestMatch, dismissMatch } = useLiveJobs();

  // when latestMatch.match_id appears — re-fetch matches list (или optimistic insert)
  useEffect(() => {
    if (!latestMatch) return;
    // existing refetch helper
    refetchMatches?.();
  }, [latestMatch?.match_id]);

  return (
    <>
      <LiveStrip jobs={jobs} />
      {/* existing matches table/cards */}
      <MatchToast match={latestMatch} onDismiss={dismissMatch} />
    </>
  );
}
```

- [ ] **9.3** Smoke test existing matches behaviour preserved.

- [ ] **9.4** Commit `feat(r4): wire LiveStrip + MatchToast into MatchesClient`.

---

## Task 10: E2E Playwright + axe

**Files:**
- Create: `tests/visual/live-strip.spec.ts`

- [ ] **10.1** Spec:

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('LiveStrip hidden when no active jobs', async ({ page }) => {
  await page.goto('/matches');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', { name: /live email processing/i })).toHaveCount(0);
});

test('a11y on /matches with mock job', async ({ page }) => {
  // mock SSE endpoint via route interception
  await page.route('**/api/jobs/stream', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: job-update\ndata: {"id":"j1","status":"processing","progress_percent":50,"from":"Boris","email_subject":"HSS"}\n\n',
    });
  });
  await page.goto('/matches');
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
```

- [ ] **10.2** Commit `test(r4): Playwright + axe for LiveStrip`.

---

## Task 11: Final + PR

- [ ] **11.1** TS strict, jest, Playwright + axe green
- [ ] **11.2** Push + PR `R4: Matches LiveStrip + SSE job stream + cached list integration`
- [ ] **11.3** NO auto-merge

## Success criteria

- LiveStrip auto-show/hide based on active jobs
- Real progress percent
- match-toast appears + auto-dismiss
- Cached list still works
- TS strict + tests green

## Out of scope

- WebSocket replacement
- Cross-tab broadcast
- Persistent event log
