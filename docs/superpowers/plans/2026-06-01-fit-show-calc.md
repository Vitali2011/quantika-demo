# Plan: match Fit Score — раскрывающийся «Показать расчёт» (2026-06-01)

## Goal
Под карточкой Fit Score на /match/[id] добавить свёрнутый-по-умолчанию toggle «Показать расчёт», раскрывающий полную арифметику из УЖЕ распарсенного fitBreakdown JSON: по каждому фактору вес+очки+%, и итоговую реконсиляцию. Рендер существующих данных, БЕЗ изменения движка/формул/чисел.

## Точная форма fbData (fitBreakdown JSON, уже JSON.parse в MatchDetailPanel ~стр.150)
- `components: [{ factor, label, weight, score, rationale }]` — 9 факторов; score ∈ [0, weight] (напр. {label:'Size / utilisation', weight:18, score:11.9})
- `totalWeight` (=100), `fitPercent` (headline, число), `partCargo`, `vesselClass`
- `sanctionsPenalty: number` (0 или 8)
- `appliedCap: { reason: string, ceiling: number } | null`
- `inputs: {...}` (для этой задачи НЕ нужно)

Арифметика строки ИТОГ — это СУММИРОВАНИЕ уже готовых чисел (не новый расчёт):
- rawSum = Σ components[].score
- fit = rawSum − sanctionsPenalty
- если appliedCap и fit > appliedCap.ceiling → fit = appliedCap.ceiling
- финал = fitPercent (headline, УЖЕ в fbData — использовать его как итог, не пересчитывать клемпинг)

## ФАЙЛ
`components/match/MatchDetailPanel.tsx` — секция «Fit Breakdown» (~148-190). fbData/components уже распарсены. Компонент 'use client', useState уже импортирован.

## Changes
1. Локальный state `const [showCalc, setShowCalc] = useState(false)` в PanelContent.
2. Под списком факторов ВНУТРИ Fit Score Card — toggle-кнопка «Показать расчёт»/«Скрыть расчёт» (button-ссылка, стиль text-ds-text-muted, aria-expanded={showCalc}).
3. При showCalc — компактная таблица/строки по КАЖДОМУ фактору: label · вес (weight) · очки (формат «{score} / {weight}») · {Math.round(score/weight*100)}%.
4. Строки реконсиляции ИТОГ внизу:
   - «Сумма факторов: {rawSum1dp} / {totalWeight}»
   - если sanctionsPenalty > 0 → «Штраф за санкции: −{sanctionsPenalty}»
   - если appliedCap → «Применён потолок: {appliedCap.reason} → {appliedCap.ceiling}»
   - «Итог (Fit): {Math.round(fitPercent)}%» — обязан совпасть с headline в шапке карточки.
   rawSum округлять до 1 знака (Math.round(x*10)/10), как score.

## Tests (TDD, RED->GREEN) — добавить в __tests__/components/match/MatchDetailPanel*.test.*
- default: расчёт СВЁРНУТ (per-factor weight/score-строки скрыты до клика).
- sanctionsPenalty=0 + appliedCap=null: после показа видны weight+score per factor, «Сумма факторов», «Итог» = fitPercent; НЕТ строк штрафа/потолка.
- sanctionsPenalty=8 → строка «Штраф за санкции: −8» видна.
- appliedCap={reason,ceiling} → строка потолка видна.
- fitPercent==null → секция (и toggle) не рендерится (всё под `fitPercent != null`).
- per-factor % в развёрнутом виде совпадают с уже показанными (нет регрессии чисел).

## Out-of-scope (orchestrator)
- НЕ показывать 5 под-сигналов ветинга (флаг/класс/возраст/P&I/CII) — их НЕТ в fitBreakdown; отдельный follow-up (правка lib/sailing/fit-breakdown.ts + пересев demo-seed).
- НЕ менять движок/формулы/веса/числа; НЕ трогать lib/sailing/*.
- НЕ трогать app/matches/MatchesClient.tsx (свой рендер) — переиспользование общего под-компонента опционально/минимально, по умолчанию НЕ трогать.
- Только Fit Score карточка в MatchDetailPanel.tsx.

## Verify
- npx jest по затронутым тестам — зелёное; tsc clean.
- Открой PR в main: "feat(match): collapsible 'Показать расчёт' under Fit Score (render existing fitBreakdown)". (Gate 3 visual + Gate 5 — на стороне оркестратора.)
