# Phase 1 SCOPE — matches-m3

## Assumptions (Rule A)

Понимаю задачу как: финальный polish матчей — (1) advanced DB-level filters через новые nullable
колонки в matches таблице (нет отдельных cargos/vessels entity tables), (2) score breakdown
UI из уже имеющегося ScoreBreakdown объекта, сохранённого как JSON в новой колонке
`reason_structured`, (3) bulk actions API + UI.

**Ключевое расхождение со спецификацией:**
Спец говорит "JOIN на cargos + vessels" — но в проекте нет отдельных таблиц cargos/vessels.
cargo_id/vessel_id — это email ID строки из сессий. Решение: denormalize filter-metadata
(cargo_type, load_port, discharge_port, laycan_start, laycan_end, vessel_dwt) в matches
таблицу как nullable колонки. Migration 033 добавляет эти поля + reason_structured.

**Score breakdown format:** spec определяет новый named shape, но `computeScoreBreakdown()`
из lib/sailing/match-scoring.ts уже возвращает `ScoreBreakdown` с `components: ScoreBreakdownComponent[]`.
Будем сохранять и читать именно этот формат в reason_structured. UI рендерит components[] как
progress bars + labels + reason.

**Bulk DELETE auth:** DELETE /api/matches/bulk требует requireSession (session cookie) +
requireAdmin (X-Admin-Token) — двойная защита. Путь НЕ под /api/admin/, поэтому Rule F
не применяется (нет AUTH_BYPASS_PATHS entry нужен).

Альтернативы рассмотрены (отдельный /api/admin/matches/bulk):
- нарушало бы спецификацию URL
- двойная auth (session + admin token) достаточно строга

## Scope Freshness Check

M1 уже LIVE:
- ✅ migration032 существует и применена
- ✅ matches-repository.ts: createMatch, getMatch, listMatches, updateMatchStatus
- ✅ GET/POST /api/matches, PATCH /api/matches/[id]
- ✅ app/matches/page.tsx + MatchesClient.tsx с status chips + sort + actions

M3 items — ни один не FIXED, все в pending:
- ❌ Advanced filters (cargo_type/route/laycan/score/dwt) — НЕ реализованы
- ❌ Migration 033 — не создана
- ❌ reason_structured колонка — не существует
- ❌ Score breakdown UI — нет expand panel
- ❌ Bulk PATCH + DELETE — нет эндпоинта
- ❌ Filter panel UI с URL state — нет

## Affected Files

### New production files
1. `lib/migrations/033-matches-score-breakdown.ts` — adds reason_structured + filter columns
2. `app/api/matches/bulk/route.ts` — PATCH bulk status + DELETE admin-only

### Modified production files
3. `lib/migrations/index.ts` — add migration033 import + allMigrations entry
4. `lib/matching/matches-repository.ts` — extend interfaces + filter WHERE + createMatch input
5. `app/api/matches/route.ts` — parse new filter params (GET) + accept new fields (POST)
6. `app/matches/MatchesClient.tsx` — filter panel + score breakdown + bulk UI

### New test files
7. `__tests__/api/matches-filters.test.ts` — GET filter params, all 7 new filters
8. `__tests__/api/matches-bulk.test.ts` — PATCH bulk, DELETE admin-only, transaction rollback
9. `lib/matching/__tests__/matches-repository-filters.test.ts` — repository filter WHERE logic
10. `__tests__/matches-client-m3.test.tsx` — UI: filter panel URL state, bulk checkboxes, score breakdown, confirm modal

## Can Change / Cannot Change / Must Not Break

### Can Change
- `lib/migrations/index.ts`
- `lib/matching/matches-repository.ts`
- `app/api/matches/route.ts`
- `app/matches/MatchesClient.tsx`

### Cannot Change (Must Not Break)
- `lib/matching/pair-analyzer.ts` — DO NOT TOUCH (already handles scoreBreakdown computation)
- `lib/types.ts` — DO NOT ADD new types here; match types live in matches-repository.ts
- `lib/sailing/match-scoring.ts` — DO NOT TOUCH
- All existing API routes outside matches
- Middleware.ts (no new bypass paths for matches)

### Must Not Break
- All existing tests (5818+ pass)
- Existing GET/POST/PATCH /api/matches (backward compatible via nullable new fields)
- `npm run build`
- `npm run lint`

## Interface Contracts

### Migration 033 schema additions (matches table)
```sql
ALTER TABLE matches ADD COLUMN reason_structured TEXT;    -- nullable JSON ScoreBreakdown
ALTER TABLE matches ADD COLUMN cargo_type TEXT;           -- nullable: 'grain'|'coal'|'ore'|'container'|'project'
ALTER TABLE matches ADD COLUMN load_port TEXT;            -- nullable: UNLOCODE or name
ALTER TABLE matches ADD COLUMN discharge_port TEXT;       -- nullable
ALTER TABLE matches ADD COLUMN laycan_start INTEGER;      -- nullable: unix ms timestamp
ALTER TABLE matches ADD COLUMN laycan_end INTEGER;        -- nullable: unix ms timestamp
ALTER TABLE matches ADD COLUMN vessel_dwt INTEGER;        -- nullable
```

### StoredMatch (extended)
```typescript
export interface StoredMatch {
  id: number;
  cargo_id: string;
  vessel_id: string;
  score: number;
  reason: string;
  reason_structured: string | null;  // NEW: JSON of ScoreBreakdown | null
  cargo_type: string | null;         // NEW
  load_port: string | null;          // NEW
  discharge_port: string | null;     // NEW
  laycan_start: number | null;       // NEW: unix ms
  laycan_end: number | null;         // NEW: unix ms
  vessel_dwt: number | null;         // NEW
  status: MatchStatus;
  user_id: string | null;
  created_at: number;
  updated_at: number;
}
```

### ListMatchesOptions (extended)
```typescript
export interface ListMatchesOptions {
  status?: MatchStatus;
  cargo_type?: string[];        // multi-select OR
  route?: string;               // substring match on load_port OR discharge_port
  laycan_from?: number;         // unix ms: cargo.laycan_start <= laycan_to AND cargo.laycan_end >= laycan_from
  laycan_to?: number;           // unix ms
  score_min?: number;           // score >= score_min
  dwt_min?: number;             // vessel_dwt >= dwt_min
  dwt_max?: number;             // vessel_dwt <= dwt_max
  sortBy: 'score' | 'created_at';
  sortDir: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
```

### CreateMatchInput (extended)
```typescript
export interface CreateMatchInput {
  cargo_id: string;
  vessel_id: string;
  score: number;
  reason: string;
  reason_structured?: string | null;   // NEW: optional JSON
  cargo_type?: string | null;          // NEW
  load_port?: string | null;           // NEW
  discharge_port?: string | null;      // NEW
  laycan_start?: number | null;        // NEW
  laycan_end?: number | null;          // NEW
  vessel_dwt?: number | null;          // NEW
  status?: MatchStatus;
  user_id?: string | null;
}
```

### GET /api/matches — new query params
- `cargo_type` (multi-value: ?cargo_type=grain&cargo_type=coal)
- `route` (string)
- `laycan_from` (ISO date or unix ms)
- `laycan_to` (ISO date or unix ms)
- `score_min` (number)
- `dwt_min` (number)
- `dwt_max` (number)

### POST /api/matches — new body fields (all optional)
- `reason_structured` (string | null)
- `cargo_type` (string | null)
- `load_port` (string | null)
- `discharge_port` (string | null)
- `laycan_start` (number | null)
- `laycan_end` (number | null)
- `vessel_dwt` (number | null)

### PATCH /api/matches/bulk
```
POST body: { ids: number[], status: 'saved' | 'dismissed' | 'archived' }
Success: 200 { updated: StoredMatch[] }
Partial failure (invalid transition): 400 { error: string, failed_id: number } — no commit
Transaction: atomic, fail-fast
```

### DELETE /api/matches/bulk
```
Body: { ids: number[] }
Auth: requireSession + requireAdmin (X-Admin-Token)
Success: 200 { deleted: number[] }
Not found: 404
Transaction: atomic
```

## Work Fronts

### Front A — Backend (can run parallel with Front B)
Files:
1. `lib/migrations/033-matches-score-breakdown.ts` (NEW)
2. `lib/migrations/index.ts` (MOD)
3. `lib/matching/matches-repository.ts` (MOD)
4. `app/api/matches/route.ts` (MOD)
5. `app/api/matches/bulk/route.ts` (NEW)

Tests:
7. `__tests__/api/matches-filters.test.ts`
8. `__tests__/api/matches-bulk.test.ts`
9. `lib/matching/__tests__/matches-repository-filters.test.ts`

### Front B — UI (can run parallel with Front A)
Files:
6. `app/matches/MatchesClient.tsx` (MOD)

Tests:
10. `__tests__/matches-client-m3.test.tsx`

### Overlap Check
No file appears in both fronts. ✅ Safe to parallelize.

## Cross-Cutting Surface (Rule C — 6 production files)

| File | Symbol | Risk |
|------|--------|------|
| `lib/matching/matches-repository.ts` | `listMatches`, `createMatch`, `StoredMatch` | HIGH — extended interface, backward compat required |
| `app/api/matches/route.ts` | GET handler, POST handler | HIGH — new query params + body fields |
| `app/api/matches/bulk/route.ts` | PATCH/DELETE handlers | HIGH — transaction + admin auth |
| `lib/migrations/index.ts` | `allMigrations` array | MEDIUM — must add migration033 |
| `app/matches/MatchesClient.tsx` | `MatchesClient` | MEDIUM — major UI overhaul |
| `__tests__/api/matches.test.ts` | existing GET/POST tests | MEDIUM — must not break |
| `__tests__/api/matches-id.test.ts` | existing PATCH tests | LOW — no change to [id] route |
| `__tests__/matches-page.test.tsx` | existing page tests | LOW — page.tsx barely changes |

## Feature-flag wiring (Rule D)

MATCHES_ENABLED feature flag already exists and is checked in:
- `app/api/matches/route.ts` ✅
- `app/api/matches/[id]/route.ts` ✅
- `app/matches/page.tsx` ✅

New endpoints need to also check MATCHES_ENABLED:
- `app/api/matches/bulk/route.ts` — add isFeatureEnabled() check ✅

## Data Invariant Audit

Migration 033 adds nullable columns to existing matches table. Backward compatible:
- Existing rows: all new columns = NULL
- Existing code reading matches: StoredMatch extended with nullable fields (no breaking change)
- Existing code creating matches (POST /api/matches): new fields optional, ignored if absent

Producer/consumer matrix:
| Producer | Consumer | Risk |
|----------|----------|------|
| migration033.up() | All DB reads | LOW — adds nullable columns |
| createMatch() extended | POST /api/matches | MEDIUM — optional new fields |
| listMatches() extended | GET /api/matches | HIGH — new WHERE clauses, test each filter |
| bulk route | MatchesClient.tsx | HIGH — atomic transaction guarantee |

## Security Analysis

DELETE /api/matches/bulk:
- requireSession guard (session_id cookie)
- requireAdmin guard (X-Admin-Token header)
- Body validates `ids: number[]` — type check, max length guard (suggest: max 100 ids per request)
- SQL: parameterized IN clause — no injection risk if using `?` placeholders and proper array binding

PATCH /api/matches/bulk:
- requireSession guard
- Validates `status` is MatchStatus enum (no open string)
- Validates all `ids` are numbers
- Atomic transaction: reads all existing, validates all transitions, then commits all → fail-fast 400 if any invalid

## Open Questions

None — all architectural decisions resolved above.

## Gotchas Acknowledged

1. Worktree forks from origin/main — tests passed inline in 2b prompt
2. PI3: must not rewrite existing test expectations
3. Dynamic imports in Next.js may escape cross-cutting grep (not applicable here)
4. SQLite IN clause with arrays: better-sqlite3 requires spreading params, not arrays directly
5. Confirm modal state: must be React state only (not URL), URL only for filters
