# Spec 10: `app/api/ai/parse-cargo` — парсинг с моком (5+ тестов)

> Batch: D5 | Complexity: medium | Est: 45 min | Files: 1

## Project Context

- **Project:** quantika-demo
- **Path:** /Users/jarvis/work/quantika-demo
- **Stack:** Next.js 14.2.35 (App Router, TypeScript 5.9.3 strict), Jest 30.3.0 + ts-jest 29.4.9, OpenAI SDK 6.33.0 (via ClipProxy), googleapis 171.4.0, Tailwind CSS 3.4.19 + shadcn 4.1.2, PM2 + Caddy
- **Architecture:** Next.js App Router; `app/api/ai/parse-cargo/route.ts` is a thin POST handler — reads session classifications, maps CARGO_INQUIRY emails, calls `callAiJson()` from `lib/openai.ts` for each, transforms AI JSON response into `ParsedCargo[]` via `toConfidence<T>()`, and persists to session via `updateSession()`. All state is in-memory session Map (lib/session.ts). No database.
- **Test command:** `npm test` (`jest --forceExit`)
- **Lint command:** `npm run lint` (`next lint`)

## Task Description

`app/api/ai/parse-cargo/route.ts` is a critical AI route that parses freight cargo inquiry emails into structured `ParsedCargo` objects. It is currently untested. The route contains a `toConfidence<T>()` helper (duplicated from parse-vessel and parse-recap), session auth guards, empty-state short-circuits, and AI JSON transformation logic — all of which require regression coverage before any refactor.

Test coverage for this module is 0%. The `toConfidence<T>()` helper maps raw AI JSON fields (object with `value`/`confidence`/`source_text` keys, or primitive values, or null) to `ConfidenceField<T> | null`. The route also performs field coercion: `commissionPercent` via `parseFloat`, `volumeCbm`/`quantity` via `Number`, `cargoType` defaults to `'OTHER'`, `missingInfo` defaults to `[]`.

This spec writes the test file `app/api/ai/__tests__/parse-cargo.test.ts` covering ≥5 mock-based test cases. All `callAiJson` calls must be mocked via `jest.mock` — tests must not reach the real OpenAI/ClipProxy endpoint.

Sources: `app/api/ai/parse-cargo/route.ts:1-88` · `lib/types.ts:5-15, 67-92` · `research-api-contracts.md` (parse-cargo contract) · `research-tech-stack.md` (Jest 30 + ts-jest, no jest.config.mjs present → owned by spec-05) · `research-shared-types.md` (SessionData shape) · ROADMAP.md §6 (Jest setup + first 30 tests, парс-cargo explicitly listed) · audit-code-quality HIGH (покрытие тестами 1.4%)

## Dependencies

- **spec-05** must run first — creates `jest.config.mjs` (with `next/jest` preset and `@/*` moduleNameMapper) and `jest.setup.ts`. Without these, `import { POST } from '@/app/api/ai/parse-cargo/route'` will fail to resolve.
- No dependency on spec-07 (session tests) — this spec mocks `getSession`/`updateSession` directly.
- No dependency on the helper-extraction spec — `toConfidence<T>()` is tested inline via the route import; if `lib/ai-utils.ts` exists (from a helper-extraction spec), the route will import from there, but the mock interface remains the same.

## Requirements

1. Create `app/api/ai/__tests__/parse-cargo.test.ts`. All tests use `jest.mock` at the module level:
   - Mock `@/lib/openai`: `callAiJson` returns a configurable `mockResolvedValue`.
   - Mock `@/lib/session`: `getSession` and `updateSession` return configurable values.
   - Mock `next/headers` / `next/server` request cookies if needed for session_id extraction.

2. **Auth guard — no cookie**: Construct a `NextRequest` with no `session_id` cookie. Call `POST(request)`. Assert response status is `401` and body contains `{ error: 'No session' }`.

3. **Auth guard — expired session**: `getSession` returns `null`. Assert response status `401` and body contains `{ error: 'Session expired' }`.

4. **Empty classifications — zero cargo emails**: `getSession` returns a session with `classifications: []` (no CARGO_INQUIRY). `callAiJson` must NOT be called. Assert response `{ count: 0 }` and `updateSession` called with `{ parsedCargos: [] }`.

5. **Single cargo email — full field mapping**: `getSession` returns a session with one CARGO_INQUIRY classification and one matching email. `callAiJson` resolves to:
   ```json
   {
     "items": [{
       "origin_port": { "value": "Rotterdam", "confidence": "high", "source_text": "from Rotterdam" },
       "destination_port": { "value": "Singapore", "confidence": "medium" },
       "cargo_description": { "value": "Steel coils", "confidence": "high" },
       "weight_mt": { "value": 5000, "confidence": "high" },
       "cargo_type": "BULK",
       "commission_percent": "2.5",
       "missing_info": ["laycan"]
     }]
   }
   ```
   Assert:
   - `updateSession` called once with `parsedCargos` array of length 1.
   - `parsedCargos[0].emailId` equals the email's id.
   - `parsedCargos[0].itemIndex` is `0`.
   - `parsedCargos[0].originPort` equals `{ value: 'Rotterdam', confidence: 'high', sourceText: 'from Rotterdam' }`.
   - `parsedCargos[0].cargoType` equals `'BULK'`.
   - `parsedCargos[0].commissionPercent` equals `2.5` (number, not string).
   - `parsedCargos[0].missingInfo` equals `['laycan']`.
   - Response body `{ count: 1 }`.

6. **toConfidence — null/missing field**: `callAiJson` returns an item with `origin_port: null` and `destination_port` absent. Assert `parsedCargos[0].originPort` is `null` and `parsedCargos[0].destinationPort` is `null`.

7. **toConfidence — primitive value (no confidence wrapper)**: `callAiJson` returns `cargo_description: "Grain"` (string, not object). Assert `parsedCargos[0].cargoDescription` equals `{ value: 'Grain', confidence: 'confirmed' }` (no sourceText).

8. **Multiple items per email**: `callAiJson` returns `{ items: [item1, item2] }`. Assert `parsedCargos` has length 2, with `itemIndex` values `0` and `1` respectively; both share the same `emailId`.

9. **Default field values**: `callAiJson` returns an item with `cargo_type` absent and `missing_info` absent. Assert `parsedCargos[0].cargoType` equals `'OTHER'` and `parsedCargos[0].missingInfo` equals `[]`.

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `app/api/ai/__tests__/parse-cargo.test.ts` | create | ≥8 unit tests covering auth guards, empty state, AI response mapping, toConfidence transformations, multi-item parsing, and default field values |

**Action:** create = новый файл | modify = изменить существующий | extend = добавить в существующий

## Files FORBIDDEN

**No-regression guard** — управляются другими спеками этого батча.
Нельзя: удалять или изменять существующие строки.
Можно: добавлять новое содержимое (append функций, тестов, импортов).
См. `references/ADR-forbidden-semantics.md`.

- `jest.config.mjs` — управляется spec-05 (Next.js Jest preset + `@/*` moduleNameMapper)
- `jest.setup.ts` — управляется spec-05 (глобальные моки и setup)
- `app/api/ai/parse-cargo/route.ts` — управляется spec о p-limit (ROADMAP §9) и/или spec об извлечении хелперов (ROADMAP §5); тесты должны компилироваться при обоих состояниях файла
- `lib/session.ts` — управляется spec-07 (SQLite migration facade)
- `lib/session-store.ts` — управляется spec-01 (SQLite store implementation)
- `lib/ai-utils.ts` — управляется spec об извлечении хелперов (ROADMAP §5); если файл существует, route импортирует `toConfidence` оттуда
- `package.json` — управляется spec-06 (security bumps) и spec-13 (Sentry dep)
- `package-lock.json` — управляется spec-06
- `next.config.mjs` — управляется spec-03 (ignoreBuildErrors) и spec-13 (withSentryConfig)
- `middleware.ts` — управляется spec-02 (CSRF)
- `lib/csrf.ts` — управляется spec-02
- `app/api/sample/route.ts` — управляется spec-02 (GET → POST conversion)
- `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation.ts` — управляются spec-13
- `.env.local.example` — управляется spec-13

> Note: `app/api/ai/__tests__/parse-cargo.test.ts` is also referenced in spec-05 Requirements §8 as part of a larger 30-test suite. spec-10 is the authoritative owner of this file. If spec-05 has already created an initial stub, spec-10 replaces it with the full implementation.

## Acceptance Criteria

- [ ] `npm test` exits 0 — all tests pass including pre-existing `lib/__tests__/currency.test.ts`.
- [ ] `app/api/ai/__tests__/parse-cargo.test.ts` exists and contains ≥8 test cases; all green.
- [ ] No real HTTP calls to OpenAI/ClipProxy — `callAiJson` is fully mocked via `jest.mock('@/lib/openai', ...)`.
- [ ] No real session reads — `getSession` and `updateSession` mocked via `jest.mock('@/lib/session', ...)`.
- [ ] Auth guard test (no cookie) → HTTP 401 with `{ error: 'No session' }`.
- [ ] Auth guard test (null session) → HTTP 401 with `{ error: 'Session expired' }`.
- [ ] Empty-classifications test → `callAiJson` not called; response `{ count: 0 }`.
- [ ] Full-mapping test: `originPort.sourceText` preserved; `commissionPercent` coerced to number `2.5`.
- [ ] Null-field test: absent or null AI fields → `null` in `ParsedCargo`.
- [ ] Primitive-value test: bare string `cargo_description` → `{ value: '...', confidence: 'confirmed' }`.
- [ ] Multi-item test: two items → `itemIndex` 0 and 1 on same `emailId`.
- [ ] Default-values test: missing `cargo_type` → `'OTHER'`; missing `missing_info` → `[]`.
- [ ] `npm run lint` passes without new errors.
- [ ] `npx tsc --noEmit` exits 0 on `app/api/ai/__tests__/parse-cargo.test.ts`.

## Compat Constraints

- **Jest 30.3.0** + **ts-jest 29.4.9** — already in `package.json` (do not add or change test deps).
- **Next.js 14.2.35** — `jest.config.mjs` (from spec-05) uses `next/jest` preset; test file must be compatible with SWC transform, not babel-jest.
- **TypeScript 5.9.3 strict mode** (`isolatedModules: true`, `moduleResolution: bundler`) — test file must pass `npx tsc --noEmit`; use `import type` where only types are needed.
- **`@/*` path alias** — all imports use `@/` prefix (e.g. `import { POST } from '@/app/api/ai/parse-cargo/route'`); resolved via `moduleNameMapper` in `jest.config.mjs` from spec-05.
- **NextRequest mock**: use `new Request('http://localhost/api/ai/parse-cargo', { method: 'POST' })` cast to `NextRequest`, or use `next/dist/server/web/spec-extension/request` stub. Cookie injection: set the `Cookie` header or use `jest.spyOn` on `request.cookies.get`. [ASSUMED: NextRequest can be constructed from standard `Request` in test environment per Next.js 14 test patterns]
- **Node.js ≥18** — `crypto.randomUUID()` available natively; no polyfill needed.

## Constraints

- Работать ТОЛЬКО с файлами из "Files in Scope".
- Branch первой командой: `git checkout -b spec/spec-10-app-api-ai-parse-cargo-5`.
- Коммиты мелкими логическими порциями.
- Тесты вместе с кодом (не выносить в отдельную спеку).
