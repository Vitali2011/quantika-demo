# Fix #606 — /cargo table colonнки скрываются при больших datasets

## Контекст
- PR #596 (merged 26522f9) добавил commodity + laycan фильтры в /cargo
- Visual verify 2026-05-27 ~21:00 UTC обнаружил regression: при `Commodity: All` (80 rows) видна ТОЛЬКО колонка CARGO; при BK (39 rows) — половина колонок; при CK (8 rows) и SG (1 row) — все 7 колонок ✅
- Pattern: больше строк → меньше колонок visible

## Hypothesis tree
- **H1 Tailwind responsive collapse**: `md:table-cell hidden` или `lg:table-cell hidden` на колонках, breakpoint срабатывает при wide content (browser-computed)
- **H2 table-layout auto + long cargo names**: первая колонка забирает всю ширину когда длинные cargo names + много строк, остальные не помещаются
- **H3 conditional rendering**: filtered vs unfiltered разные HTML structures (например, при All — `<ul>`, при filter — `<table>`)
- **H4 overflow-x-auto без min-width**: parent overflow-x-auto, но table без `min-w-[1200px]` — на широком viewport scroll не активируется, колонки сжимаются и обрезаются
- **H5 virtual list breaking layout**: react-virtuoso/tanstack-virtual при N > threshold breaks thead/tbody alignment

## Approach
1. Read `app/cargo/CargoClient.tsx` + любой импорт table component (`components/ui/table.tsx`)
2. Eliminate hypothesis-by-hypothesis:
   - H3 check: grep `if (filter` или `commodity ===` — есть conditional render?
   - H1 check: grep `md:table-cell` / `lg:table-cell` / `hidden md:` в Client.tsx и table.tsx
   - H4 check: grep `min-w-` на `<table>` + `overflow-x-auto` на parent
   - H2 check: read `<colgroup>` / `<col>` или Tailwind `w-` classes
3. Pick winning hypothesis → minimal fix
4. Regression test: render `/cargo` page с 80 mocked items → assert 7 `<th>` elements visible in DOM (or `data-testid`)
5. PR + /test-skill cold QA

## Out-of-scope
- Refactor side-panel / detail page / filter UI logic (только table layout)
- Adding new filters
- Changing cargo data shape

## Files predicted (1-3)
- `app/cargo/CargoClient.tsx` (main fix)
- `app/cargo/__tests__/cargo-client.test.tsx` (+1 regression test)
- Optionally `components/ui/table.tsx` if shared component bug

## Acceptance
- Все 7 колонок (CARGO/QTY/LOAD/DISCHARGE/LAYCAN/STATUS/SOURCE) visible при All / CK / BK / SG / любой combo
- Horizontal scroll OK если viewport узкий, колонки в DOM всегда
- Regression test catches re-introduce
- Visual: open /cargo на проде анон-логин → screenshot в evidence

## If stuck
- 2 round'а без fix → QUESTIONS.md + завершайся (Rule #19)
- НЕ Q1-chain (Rule #11)

## First step (Phase 0)
1. `cp /tmp/orchestrator-plans/2026-05-27-606-cargo-table-regression.md <worktree>/docs/superpowers/plans/`
2. `git commit` — план в feature branch
3. `Skill('superpowers:subagent-driven-development', '#606 — see plan')` или прямо в `superpowers:test-driven-development` для simple cases
