# Plan: Fit Score «Show calculation» — plain-English per-factor rationale + EN (2026-06-01)

## Goal
Founder: расчёт под Fit Score должен по КАЖДОМУ фактору простыми словами объяснять «как получилось X/Y», и вся карточка — на английском. Сейчас «Показать расчёт» (#730) показывает только числа; rationale-тексты движка терсные/тех-жаргон. Переписать 9 факторов (все ветки) полными простыми англ-предложениями (что и почему), показать их под каждым фактором в «Show calculation», перевести подписи карточки на EN.

## КРИТИЧЕСКИЙ инвариант (risk-override: fit-breakdown.ts = scoring engine)
Меняем ТОЛЬКО строки `rationale`/`why` (и подписи UI). НИ ОДНО из: weight, share, score-математика, пороги (ratio/util/distance thresholds), FIT_WEIGHTS, caps, sanctionsPenalty — НЕ трогать. fitPercent и score каждого фактора обязаны остаться ПОБИТОВО теми же. /test-skill проверит, что числа не изменились.

## Эталон стиля (gold standard — happy-path формулировки, утверждены founder'ом)
Переписать в этом тоне ВСЕ ветки каждого scorer'а (полное предложение: что + почему; СОХРАНИТЬ интерполируемые числа ${...}):
1. Size / utilisation: `Cargo fills ~${pct}% of the ship — a near-full load, almost no wasted space.` (для низкой util — `…— under-utilised, some deadfreight risk.`; part-cargo — `…— part cargo, deadfreight not charged.`)
2. Laycan timing: clean→`Ship is free and arrives comfortably inside the loading window.`; tight→`Arrives just in time — cuts it fine but feasible.`; idle→`Ship would sit idle ~${d} days before laycan — owner carrying-cost risk.`; late→`Ship arrives after the laycan ends — would miss the window.`
3. Ballast distance: `~${Math.round(distanceNm)} nm to reposition to load port — within a ${cls}'s range (~${radius} nm) but not on the doorstep.` (если очень близко — `…— practically on the doorstep.`)
4. Class fit: `Ship ${vesselDwt} dwt vs cargo ${cargoWtMax} mt (ratio ${ratio.toFixed(2)}) — the right size class for this parcel.` (oversize/undersize — соответствующая концовка)
5. Cargo type quality: MPP+breakbulk→`MPP ship suits breakbulk steel coils — small deduction (not a purpose-built carrier).`; bulk→`Bulk-class ship matched to bulk cargo.`; и т.д. по веткам.
6. Cranes: gearless+shore→`Ship is gearless, but the port has shore cranes — workable.`; geared→`Ship is geared — no dependence on shore cranes.`; gearless+none→`Ship is gearless and the port has no cranes — not workable.`; unverified→`Ship is gearless; port crane availability not yet confirmed.`
7. Volume / hold fit: `Cargo takes ~${pct}% of the ship's grain capacity — a tight but workable fit.` (comfortable/ideal/overflows — концовка по ветке)
8. Draft / port headroom: ok→`Loaded ship sits within the port's draft limit.`; fail→`Ship draws too much for the port — ${reason}.`
9. Vessel vetting: `Items to confirm before fixing: ${concerns}.` (если чисто — `Vetting clean — no open items.`) — сохранить перечень concerns.

## ФАЙЛЫ
1. `lib/sailing/fit-breakdown.ts` — переписать все `rationale:`/`why` строки в 9 scorer'ах по стилю выше. ТОЛЬКО строки. Обнови `unknown()` why-тексты тоже (в стиле «… not stated, scored conservatively.»).
2. `components/match/MatchDetailPanel.tsx` — «Show calculation» (toggle #730): (а) перевести подписи на EN: «Показать расчёт»→`Show calculation`, «Скрыть расчёт»→`Hide calculation`, «Сумма факторов»→`Subtotal`, «Итог (Fit)»→`Fit score`, «Штраф за санкции»→`Sanctions penalty`, «Применён потолок»→`Capped`; (б) под каждым фактором в развёрнутом расчёте показать `c.rationale` (мелким текстом, как в правой панели). Формат строки: `<label>   <score> / <weight> · <pct>%` + строка rationale ниже.

## Tests (TDD)
- Обнови существующие тесты, которые ассертят старый rationale-текст (под новый).
- ДОБАВЬ тест-инвариант: для фикстуры пары fitPercent и каждый component.score ОСТАЮТСЯ те же, что до правки (т.е. правка не сдвинула числа) — например снапшот числовых полей до/после, или явные ожидаемые значения.
- MatchDetailPanel: в развёрнутом «Show calculation» под фактором виден его rationale; подписи на английском.
- npx jest по затронутым + tsc clean.

## Out-of-scope (orchestrator)
- НЕ менять scoring-логику/веса/пороги/caps/sanctions — только тексты + UI EN.
- НЕ запускать пересев demo-seed — это сделает ОРКЕСТРАТОР после merge+deploy (rationale запечён в seed JSON; прод-операция).
- НЕ трогать app/matches/MatchesClient.tsx, dashboard, другие страницы.
- НЕ менять структуру fitBreakdown (поля те же).

## Verify
- npx jest зелёное, tsc clean. PR в main: "feat(match): plain-English per-factor rationale in Fit Score calc + EN labels".
- Risk-override → ОБЯЗАТЕЛЕН /test-skill: подтвердить, что fitPercent/score НЕ изменились (только текст).
- Orchestrator post-merge: regenerate-matches.ts на проде (новый rationale в seed) + checkpoint + restart + Gate5.
