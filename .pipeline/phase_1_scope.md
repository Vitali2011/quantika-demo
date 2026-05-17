# Phase 1 Scope — week-B-ui-fixes (3 UI fixes)

## Assumptions (Rule A)

Понимаю задачу как: 3 хирургических UI-фикса в одном PR (3 отдельных коммита).
Альтернатива: 3 отдельных PR.
Иду по одному PR, потому что: фиксы малые, все UI-layer, файлы не пересекаются.

---

## Fix 1 — EXPLAIN_DEAL_ENABLED NEXT_PUBLIC pair

**Problem:** `ExplainDealModal` не имеет client-side guard. Серверная проверка в `app/match/[id]/page.tsx:71` гарантирует SSR-защиту, но ExplainDealModal при прямом импорте всегда рендерит кнопку.

**Fix:**
- `components/match/ExplainDealModal.tsx` — guard `if (process.env.NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED !== 'true') return null;` — ПОСЛЕ хуков (hooks discipline)
- `.env.local.example` — добавить `NEXT_PUBLIC_EXPLAIN_DEAL_ENABLED=false`

**Must Not Break:** 22 существующих теста ExplainDealModal (все рендерятся без флага → тесты нужно адаптировать: задать env var до рендера)

---

## Fix 2 — SubsCountdownWidget live interval

**Problem:** `remaining` вычисляется при монтировании, не обновляется. Countdown заморожен.

**Fix:**
- `components/deals/SubsCountdownWidget.tsx` — рефакторинг:
  1. `computeRemaining(subsDeadline): number` — pure helper
  2. `useState(() => computeRemaining(subsDeadline))` — ПЕРЕД feature flag check (rules of hooks)
  3. `useEffect` с `setInterval(fn, 60_000)` + cleanup
  4. Feature flag check — ПОСЛЕ хуков

**Critical:** текущий ранний return перед хуками станет нарушением после добавления хуков. Перенести после хуков.

---

## Fix 3 — Touch target min-h-44px enforcement

**Fix:**
1. `app/globals.css` — `.touch-target { min-height: 44px; min-width: 44px; }` в `@layer utilities`
2. `app/laytime/page.tsx` — class `touch-target` на primary buttons (Parse SOF, Add, Calculate) + key inputs
3. `components/psc/PscSearchForm.tsx` — class на search button + IMO input
4. `app/market/page.tsx` — НЕТ кнопок/inputs → skip

---

## Affected Files

| File | Change |
|------|--------|
| `components/match/ExplainDealModal.tsx` | +1 guard строка |
| `.env.local.example` | +1 env var |
| `components/deals/SubsCountdownWidget.tsx` | рефакторинг (useState/useEffect) |
| `app/globals.css` | +.touch-target utility |
| `app/laytime/page.tsx` | +touch-target class на ~5 elements |
| `components/psc/PscSearchForm.tsx` | +touch-target class на 2 elements |
| `components/match/__tests__/ExplainDealModal.test.tsx` | +1 тест (flag-off → null) |
| `components/deals/__tests__/SubsCountdownWidget.test.tsx` | +1 тест (60s tick) |
| `app/laytime/__tests__/touch-targets.test.tsx` | новый файл (class presence test) |

## Scope: 9 files | Rule G: YES (≥3 production files)

## Boundaries

- Can Change: перечисленные файлы
- Cannot Change: API routes, middleware, bottom nav, auth, session
- Must Not Break: все существующие тесты

## Open Questions: нет
