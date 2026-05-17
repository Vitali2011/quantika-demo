# Wave γ — Feature Flag Activation Runbook

> **Scope:** γ-05 LAYTIME_ENGINE_ENABLED · γ-09 BIMCO_RAG_ENABLED · γ-08 SUBS_TIMER_V2_ENABLED
>
> **Verified:** 2026-05-17 · Branch `orchestrator/wave-gamma-verify`
>
> **Test results:** all green (laytime 91/91, BIMCO 58/58, subs-timer 88/88, regression 10/10)
>
> **Operator:** set flags on VPS only — do **not** edit this file as part of activation.

---

## Pre-activation checklist

Before setting any flag:

- [ ] Latest build deployed (`npm run build` complete — `NEXT_PUBLIC_*` vars are baked at build time)
- [ ] `.env.local` backup exists (cron job at `/root/quantika-backup/` or manual)
- [ ] For BIMCO_RAG_ENABLED only: BIMCO seed data loaded (see §2 prerequisites)

---

## 1 · γ-05 LAYTIME_ENGINE_ENABLED

### What it enables

POST `/api/laytime/calculate` and POST `/api/laytime/parse-sof`, plus the `/laytime` UI page with full SHEX/SHINC/FHEX/FHINC mode support, weather delays, holiday exclusions, and demurrage/despatch calculations.

### Flag names

| Env var | Scope |
|---|---|
| `LAYTIME_ENGINE_ENABLED` | Server (route guard) |
| `NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED` | Client (page render) |

Both must be `true`. Setting only the server flag enables the API but shows the "Feature Not Enabled" page.

### Activation

```bash
# On VPS — edit .env.local
LAYTIME_ENGINE_ENABLED=true
NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED=true

# Rebuild (NEXT_PUBLIC_* is baked at build time)
cd /root/quantika && npm run build

# Restart
pm2 restart quantika-demo --update-env
```

### Smoke test

```bash
# 1. Confirm feature gate lifted (expect 200, not 503)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://demo.quantika.org/api/laytime/calculate \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: <csrf>" \
  --cookie "session=<cookie>" \
  -d '{
    "allowedLaytimeDays": 3,
    "mode": "SHINC",
    "commencedAt": "2026-05-01T06:00:00Z",
    "completedAt": "2026-05-04T06:00:00Z",
    "portHolidays": [],
    "weatherDelayHours": 0
  }'
# → 200

# 2. Verify UI page renders
curl -s https://demo.quantika.org/laytime | grep -q "Laytime Calculator" && echo OK
```

> **CSRF note:** obtain `x-csrf-token` from an authenticated page response header or cookie before running the POST smoke test.

### Rollback

```bash
# .env.local
LAYTIME_ENGINE_ENABLED=false
NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED=false

npm run build && pm2 restart quantika-demo --update-env
```

API returns 503, page shows "Feature Not Enabled" placeholder. No data loss — calculator state is client-side only.

### Code paths

- Route: `app/api/laytime/calculate/route.ts:19`
- Route: `app/api/laytime/parse-sof/route.ts:23`
- Page: `app/laytime/page.tsx:41`
- Core lib: `lib/laytime/calculator.ts`, `lib/laytime/sof-parser.ts`, `lib/laytime/dd-calculator.ts`
- Tests: `__tests__/api/laytime-calculate.test.ts`, `__tests__/api/laytime-parse-sof.test.ts`, `lib/__tests__/laytime-calculator.test.ts`

---

## 2 · γ-09 BIMCO_RAG_ENABLED

### What it enables

GET `/api/knowledge/clauses` (FTS5 full-text search across GENCON 2022, HEAVYCON, PROJECTCON clauses) and the `/clauses` UI search page.

### Flag names

| Env var | Scope |
|---|---|
| `BIMCO_RAG_ENABLED` | Server (route guard) |
| `NEXT_PUBLIC_BIMCO_RAG_ENABLED` | Client (page render) |

### Prerequisites — seed BIMCO data

The SQLite `bimco_fts` table must be populated before enabling the flag, otherwise the endpoint returns empty results.

```bash
# Run once on VPS before enabling flag
cd /root/quantika
npx tsx scripts/seed-bimco-clauses.ts
# Expected output: seeded 7 clauses (fixture set)

# Dry-run to verify without writing
npx tsx scripts/seed-bimco-clauses.ts --dry-run
```

Migration `029-bimco-rag` must have run (included in standard migration set). If uncertain:

```bash
npx tsx scripts/migrate.ts up
```

### Activation

```bash
# .env.local
BIMCO_RAG_ENABLED=true
NEXT_PUBLIC_BIMCO_RAG_ENABLED=true

npm run build && pm2 restart quantika-demo --update-env
```

### Smoke test

```bash
# 1. Basic search (no auth required by route — confirm 200 not 503)
curl -s "https://demo.quantika.org/api/knowledge/clauses?q=laytime" \
  --cookie "session=<cookie>" | jq '.results | length'
# → integer > 0 if seed ran

# 2. Charter party filter
curl -s "https://demo.quantika.org/api/knowledge/clauses?q=laytime&cp=GENCON+2022" \
  --cookie "session=<cookie>" | jq '.'

# 3. Flag-disabled gate still works (sanity check before enable)
curl -s -o /dev/null -w "%{http_code}" \
  "https://demo.quantika.org/api/knowledge/clauses?q=test"
# → 503 when flag is false, 200 after enable

# 4. UI page
curl -s https://demo.quantika.org/clauses | grep -q "BIMCO" && echo OK
```

### Rollback

```bash
BIMCO_RAG_ENABLED=false
NEXT_PUBLIC_BIMCO_RAG_ENABLED=false

npm run build && pm2 restart quantika-demo --update-env
```

API returns 503, page shows "BIMCO Clauses Coming Soon" placeholder. Seed data in SQLite is preserved — re-enabling the flag restores functionality without re-seeding.

### Periodic refresh

Cron task available for keeping clauses up-to-date:

```bash
npx tsx scripts/knowledge/cron/refresh-bimco-rag.ts
```

Schedule via cron or pm2 ecosystem if needed after activation.

### Code paths

- Route: `app/api/knowledge/clauses/route.ts:25`
- Page: `app/clauses/page.tsx:72`
- Migration: `lib/migrations/029-bimco-rag.ts`
- Fixture: `lib/knowledge/sources/bimco/fixture.ts` (7 clauses)
- Adapter: `lib/knowledge/sources/bimco/adapter.ts`
- Tests: `__tests__/api/clauses.test.ts`, `__tests__/lib/migrations/029-bimco-rag.test.ts`, `__tests__/lib/knowledge/sources/bimco/bimco-adapter.test.ts`

---

## 3 · γ-08 SUBS_TIMER_V2_ENABLED

### What it enables

`SubsCountdownWidget` in the dashboard — timezone-aware banking-day countdown to subs deadline with charterer-tier grace indicator (blue-chip gets +1 banking day).

### Flag names

| Env var | Scope |
|---|---|
| `SUBS_TIMER_V2_ENABLED` | Server (available for SSR checks if needed) |
| `NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED` | Client (widget render gate) |

The widget gates on `NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED` exclusively — it is a client component (`'use client'`). The server-side `SUBS_TIMER_V2_ENABLED` is available for future SSR logic.

### Activation

```bash
# .env.local
SUBS_TIMER_V2_ENABLED=true
NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED=true

npm run build && pm2 restart quantika-demo --update-env
```

### Smoke test

```bash
# 1. Confirm widget appears in dashboard HTML
curl -s https://demo.quantika.org/dashboard \
  --cookie "session=<cookie>" | grep -q "subs-countdown" && echo "widget present"

# 2. Manual UI check — open /dashboard, look for countdown badge near deal cards
# Widget renders: "Xd Yh remaining" or "EXPIRED" or grace indicator

# 3. Confirm flag-off hides widget (sanity before enable)
# When NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED=false: widget returns null, no DOM node
```

> Widget is purely client-side with no backend API call. There is no server endpoint to smoke-test beyond the dashboard page load.

### Rollback

```bash
SUBS_TIMER_V2_ENABLED=false
NEXT_PUBLIC_SUBS_TIMER_V2_ENABLED=false

npm run build && pm2 restart quantika-demo --update-env
```

Widget returns `null` and disappears from dashboard. No state stored server-side; no data loss.

### Code paths

- Widget: `components/deals/SubsCountdownWidget.tsx:25`
- Dashboard integration: `app/dashboard/page.tsx:168`
- Core lib: `lib/deadlines/subs-guardian.ts` (`normalizeDeadline`, `getChartererGraceDays`)
- Tests: `components/deals/__tests__/SubsCountdownWidget.test.tsx`, `__tests__/regression/RC-subs-countdown-import.test.tsx`
- Regression: `tests/regression/RC1-fail-open/gamma-08-A-03-widget-empty-deadline.test.tsx`, `tests/regression/RC4-ui-blind/gamma-08-A-01-widget-timezone-unused.test.tsx`

---

## Activation order recommendation

No hard dependency between the three flags, but recommended order:

1. **γ-08 SUBS_TIMER_V2_ENABLED** — pure client widget, lowest risk, no DB prerequisite
2. **γ-05 LAYTIME_ENGINE_ENABLED** — API + UI, all compute is in-process, no DB prerequisite
3. **γ-09 BIMCO_RAG_ENABLED** — requires seed step first; run `seed-bimco-clauses.ts` before setting flag

Can activate all three in a single `.env.local` edit + one `npm run build` cycle.

---

## Test evidence summary

| Flag | Test suites | Tests | Result |
|---|---|---|---|
| γ-05 LAYTIME_ENGINE_ENABLED | 4 | 91 | PASS |
| γ-09 BIMCO_RAG_ENABLED | 6 | 58 | PASS |
| γ-08 SUBS_TIMER_V2_ENABLED | 6 | 88 | PASS |
| Regression (gamma-07/08/09, RC-bimco, RC-subs) | 2 | 10 | PASS |

Verified with `LAYTIME_ENGINE_ENABLED=true NEXT_PUBLIC_LAYTIME_ENGINE_ENABLED=true npx jest --testPathPatterns="laytime" --forceExit --no-coverage` (and equivalents for other flags) on branch `orchestrator/wave-gamma-verify`.
