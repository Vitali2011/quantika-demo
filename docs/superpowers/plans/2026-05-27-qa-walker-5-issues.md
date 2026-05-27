# QA Walker 2026-05-27 — 5-issue bundle

**Source:** QA Walker run 2026-05-27 на demo.quantika.org
**Tier:** M (bundle MAX) · creative=no · risk-override на #574 (hydration suspect)
**Ordering:** #574 first (блокирует Phase 2.6 design regression), затем по severity

## Issues

1. **#574 AIBar crash (critical)** — root-cause investigation (hydration / RSC / state). Voronka: error в browser console + server logs, найти trigger. Fix: stabilize hydration ИЛИ guard mount-state. Тест: render+interact без crash.
2. **#575 5 redirects (high)** — Phase 2 уходит 7 страниц в skip. Список редиректящих URL из QA report, проверить middleware/next.config. Fix: убрать лишние redirects ИЛИ (если намеренны) update QA Walker expectations.
3. **#576 KPIStrip dashboard (high)** — broken KPI tile. Что сломано: data fetch, layout, или компонент. Fix + test: KPIStrip renders с mock data.
4. **#577 market staleness (low)** — Phase 2.5 broker reality: market data старая. Проверить data source TTL, last-refresh surfaced в UI. Fix: refresh job ИЛИ surface "Updated X ago" badge.
5. **#578 breadcrumb (low)** — minor UX. Conform с design system, добавить missing breadcrumb ИЛИ поправить text.

## Out-of-scope

- Tailwind 4 migration (#472 closed)
- eslint 10 (#470 closed, upstream-blocked)
- Любые рефакторинги вне 5 issues
- Изменения в auth/middleware кроме #575 (если того требует)
- Изменения в parser/normalizer/regex/validator (PI3)

## QA gate

- jest + e2e green
- /test-skill cold-session adversarial QA на финальной branch
- Manual visual через playwright/preview на AIBar + KPIStrip + breadcrumb

## Branch strategy

Worktree fix/qa-walker-2026-05-27, sequential commits, 5 PRs или один bundle PR (на усмотрение subagent).
PR title: fix(#NNN): <topic> + tests.
