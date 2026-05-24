# R4 — Matches LiveStrip + Cached List (Design Spec)

**Дата:** 2026-05-24
**Parent:** §3.5 + экраны 2 + live-processing.html mockup
**Depends:** R1 primitives, R2 AppShell

## 1. Цель

Главная UX-фишка приложения. `/matches` всегда показывает:
- **Cached matches** мгновенно (SSR + initial fetch)
- **LiveStrip** сверху когда есть активная email-обработка (SSE-driven)
- **Toast** «✨ Новый match» при появлении свежего
- **Fresh-card animation** (зелёная обводка 10 сек) на свежей карточке

## 2. Backend

### Migration 038: jobs.progress_percent (если ещё нет)

```sql
ALTER TABLE jobs ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN current_step TEXT;
```

### SSE endpoint `/api/jobs/stream`

```
GET /api/jobs/stream → Server-Sent-Events
event: job-update
data: { id, status, progress_percent, current_step, email_subject, from }

event: match-created
data: { match_id, score, vessel_name, cargo_summary }
```

Auth-gated, session-isolated (только jobs текущего user'а).

### Trigger SSE events

В существующем job processor (`lib/jobs/process-email.ts` или подобном) добавить:
- `emitJobUpdate(jobId, progressPercent, currentStep)` после каждого шага
- `emitMatchCreated(matchData)` после insert в matches table

In-memory pub/sub через EventEmitter; per-user channel.

## 3. Frontend components

```
design-system/patterns/
├── LiveStrip.tsx              — gradient amber strip, 5-slot grid, progress bar
├── LiveStripCard.tsx          — single email card (queue/active/done state)
├── MatchToast.tsx             — auto-dismiss after 5s
├── useLiveJobs.ts             — SSE hook (returns { jobs, latestMatch })
└── __tests__/
    ├── LiveStrip.test.tsx
    ├── useLiveJobs.test.tsx

app/api/jobs/stream/
└── route.ts                    — SSE handler

lib/jobs/
└── event-emitter.ts            — per-user pub/sub singleton (in-memory)
```

## 4. UX-детали (из live-processing.html mockup)

- LiveStrip background: gradient amber-50 → orange-50 (Maritime Deep accent-soft)
- 5 cards в grid (queue / active / done states styled differently)
- Progress bar: real `progress_percent` от job, не fake
- "ETA ~20 сек" hint estimated by remaining queue × avg processing time
- Match-toast: green border, "✨ Новый match: MV Atlas → ...", auto-dismiss 5s
- Card slide-in animation: fresh card highlight зелёным fade 10s

## 5. Mode awareness

- Charterer mode: strip text "Обрабатываем 5 email'ов от брокеров (груз)"
- Owner mode: "Обрабатываем 5 email'ов (открытые суда)"
- (Mode hook used)

## 6. Modify `/matches` page

`app/matches/page.tsx` (или MatchesClient):
1. SSR/initial fetch — existing cached matches
2. `<LiveStrip />` mount above list (auto-hides when no active jobs)
3. SSE subscription via `useLiveJobs()` updates list reactively

**КРИТИЧНО:** не сломать существующий cached-list flow. LiveStrip = additive над текущим UI.

## 7. Empty state

| State | UI |
|---|---|
| 0 cached + 0 jobs (новый user) | LiveStrip placeholder: «👇 Подключи Gmail / кинь email / опиши груз словами» + ниже sample-fixture с пометкой `DEMO` |
| 0 cached + есть active job | LiveStrip с прогрессом, ниже skeleton |
| cached есть + 0 jobs | List как обычно, strip hidden |
| cached + active jobs | List + strip + toasts |

## 8. Files (~15)

NEW:
- `lib/migrations/038-jobs-progress.ts`
- `lib/jobs/event-emitter.ts`
- `app/api/jobs/stream/route.ts`
- `design-system/patterns/LiveStrip.tsx`
- `design-system/patterns/LiveStripCard.tsx`
- `design-system/patterns/MatchToast.tsx`
- `design-system/patterns/useLiveJobs.ts`
- tests for each

MODIFIED:
- `app/matches/MatchesClient.tsx` — add `<LiveStrip />` above list + `useLiveJobs()` subscription
- `lib/jobs/process-email.ts` (or wherever existing processor lives) — emit events at progress points
- `middleware.ts` — `/api/jobs/stream` нужен auth (no bypass), но SSE-headers correct

## 9. Out of scope

- WebSocket replacement (SSE достаточно для unidirectional)
- Persistence event log (in-memory only; refresh = re-fetch state)
- Cross-tab sync (broadcast channel — R6 polish)
- Pre-existing job processor logic — НЕ переписываем

## 10. Risks

| Risk | Mitigation |
|---|---|
| SSE connection drops on mobile sleep | Auto-reconnect with exponential backoff в useLiveJobs |
| Memory leak от EventEmitter listeners | Cleanup в useEffect return |
| Job processor doesn't emit events (existing legacy) | Wrap existing process function with emit-on-progress proxy |
| Toast spam если 20 emails сразу | Batch: показывать только последний + counter «+3 more» |
| Fake-timers tests на animation | useFakeTimers с manual advanceTimersByTime в jest |

## 11. Success criteria

- LiveStrip появляется при первой active job, исчезает в покое
- Real progress (не fake), match-toasts работают
- Cached list рендерится мгновенно
- TS strict + jest + Playwright visual + axe
