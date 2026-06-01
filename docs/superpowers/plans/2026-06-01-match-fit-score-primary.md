# Plan: match detail — FIT% как единственный балл (2026-06-01)

## Goal
На матч-детали старый непрозрачный AI-балл (напр. 92) показан в 4 местах. Заменить его на прозрачный FIT% (89%) ВЕЗДЕ в шапке/левой колонке. FIT SCORE-панель справа (9 факторов) уже есть — её разметку/формулу НЕ трогать. Founder выбрал "Заменить на FIT% везде".

## Context (важно)
- `app/match/[id]/page.tsx` уже имеет `storedMatch.fit_percent` (прокидывает в panel, ~стр.102) и `storedMatch.score`.
- 4 места старого балла:
  - hero-кружок ~стр.123-133 (`{storedMatch.score}` + подпись "score", data-testid="score-pill")
  - бейдж "Good Match" ~стр.141 (matchLevel-label — ОСТАВИТЬ как есть)
  - Score-строка в Vessel-карточке ~стр.189-194
  - текст "Score NN reflects…" в AI Summary — `components/match/MatchDetailPanel.tsx` ~стр.78-83
- FIT SCORE-карточка с разбивкой — `MatchDetailPanel.tsx` ~стр.149-190 — НЕ трогать.

## Changes (2 файла + тесты)
1. `app/match/[id]/page.tsx`
   - Hero-кружок: когда `fit_percent != null` → показывать `Math.round(fit_percent)` + подпись "fit", цвет по fit-tier (>=85 emerald / >=60 amber / иначе slate). Когда `fit_percent == null` → fallback на `storedMatch.score` + подпись "score" (старое поведение). Обновить aria-label ("Fit score: NN%" либо "Match score: NN"). data-testid="score-pill" СОХРАНИТЬ.
   - Vessel-карточка Score-строка (189-194): когда fit_percent != null → dt "Fit" / dd "${Math.round(fit_percent)}%"; иначе оставить "Score"/score.
   - Бейдж "Good Match" (141) — НЕ трогать.
2. `components/match/MatchDetailPanel.tsx`
   - AI Summary (78-83): убрать непрозрачный "Score ${score} reflects…". Когда `fitPercent != null` → текст вида "Fit ${Math.round(fitPercent)}% — взвешено по факторам ниже (сумма весов = 100)." Иначе сохранить текущий fallback (`!hasSessionMatch` → "…Reload to refresh match data."). Старый score-текст НЕ показывать.

## Tests (TDD, RED->GREEN)
- При заданном fit_percent: hero показывает "fit" + округлённый %, НЕ старый score; Vessel-карточка показывает "Fit"; AI Summary без слова "reflects". При fit_percent=null: fallback на score + "score" сохраняется.
- Существующие data-testid (score-pill, match-detail-panel) не ломать.

## Out-of-scope (orchestrator)
- НЕ трогать бейдж "Good Match" / matchLevel (founder: бейдж остаётся).
- НЕ трогать FIT SCORE-панель разбивки (149-190) и её формулу.
- НЕ менять источник данных score/fit_percent, sorting, matches-repository, движок матчинга.
- НЕ трогать /matches list и dashboard.
- Только display-замена на странице матч-детали.

## Verify
- `npx jest` по затронутым тестам — зелёное.
- UI PR → Gate 3 preview /match/[id]: кружок = FIT%, нет "Score … reflects", Vessel показывает "Fit". PR title: "fix(match): show FIT% as primary score (retire opaque AI score)".
