# Phase 1 SCOPE — matches-m1

## Assumptions (Rule A)

Понимаю задачу как: создать полный stack для ручного сохранения/управления матчами (cargo ↔ vessel) — DB migration, typed repository, API routes (GET/POST/PATCH), и UI. POST /api/matches принимает {cargo_id, vessel_id} где cargo_id = emailId из session.parsedCargos, vessel_id = emailId из session.parsedVessels; вызывает pair-analyzer для scoring; сохраняет в DB.

Альтернатива: cargo_id/vessel_id как отдельные entity IDs — но в M1 нет таблицы cargos/vessels; session is the source of truth.

Иду по email ID из session, потому что: существующий /api/ai/match работает на session.parsedCargos/parsedVessels; entity IDs — это M2+.

## Affected Files

### New production files
1. `lib/migrations/032-matches.ts` — matches table migration
2. `lib/matching/matches-repository.ts` — CRUD + transition validation
3. `app/api/matches/route.ts` — GET + POST
4. `app/api/matches/[id]/route.ts` — PATCH
5. `app/matches/MatchesClient.tsx` — client component (action buttons, optimistic update)
6. `app/matches/page.tsx` — replace DEMO_MATCHES skeleton (server fetch)

### Modified
7. `lib/migrations/index.ts` — add migration032 import + allMigrations entry

### Test files (Rule G)
8. `lib/migrations/__tests__/032-matches.test.ts`
9. `lib/matching/__tests__/matches-repository.test.ts`
10. `__tests__/api/matches.test.ts`
11. `__tests__/api/matches-id.test.ts`
12. `__tests__/matches-page.test.tsx`

## Can Change / Cannot Change / Must Not Break

### Can Change
- `app/matches/page.tsx`
- `lib/migrations/index.ts`

### Cannot Change
- `lib/matching/pair-analyzer.ts`
- `lib/matching/reason-enricher.ts`
- `lib/types.ts` (existing Match type unchanged; new StoredMatch lives in repository)
- All other files outside scope

### Must Not Break
- All existing tests (npm test green)
- Session-based matching flow (/api/ai/match)
- middleware.ts auth logic

## Interface Contracts

### StoredMatch (matches-repository.ts)
```typescript
export type MatchStatus = 'shortlist' | 'saved' | 'dismissed' | 'archived';

export interface StoredMatch {
  id: number;
  cargo_id: string;
  vessel_id: string;
  score: number;
  reason: string;        // JSON.stringify(matchReasons[])
  status: MatchStatus;
  user_id: string | null;
  created_at: number;
  updated_at: number;
}
```

### Repository functions
```typescript
listMatches(db, opts: { status?: MatchStatus; sortBy: 'score'|'created_at'; sortDir: 'asc'|'desc'; limit?: number; offset?: number }): StoredMatch[]
getMatch(db, id: number): StoredMatch | null
createMatch(db, input: { cargo_id, vessel_id, score, reason, status?, user_id? }): StoredMatch
updateMatchStatus(db, id: number, newStatus: MatchStatus): StoredMatch
// throws InvalidTransitionError for invalid transitions
```

### Valid status transitions
- shortlist → saved | dismissed | archived
- saved → archived | dismissed
- dismissed → archived | saved
- archived → saved

## Cross-Cutting Surface (Rule C)

| File | Symbol | Risk |
|------|--------|------|
| `lib/types.ts` | `Match` | LOW — StoredMatch is separate, no collision |
| `lib/session-store.ts` | `getStore` | LOW — same pattern as other routes |
| `lib/session.ts` | `requireSession` | LOW — same pattern |
| `lib/migrations/index.ts` | `allMigrations` | MEDIUM — must add migration032 correctly |

## Feature-flag wiring (Rule D)
`MATCHES_ENABLED` is server-side only — no NEXT_PUBLIC_*. Default ON ('true'). Wiring check N/A for SSG.

## Rule F (Admin endpoint)
`/api/matches` is NOT under /api/admin/ → no AUTH_BYPASS_PATHS change.

## Rule E (Seed coverage)
`matches` table: user-generated data, no seed needed.

## Gotchas Acknowledged
- [x] Worktree форкается от origin/main → передаём тесты inline в Phase 2b
- [x] PI3: логируем каждый принятый patch
- [x] Dynamic imports: grep lazy/import() после impl
- [x] MATCHES_ENABLED server-side → wiring check N/A
