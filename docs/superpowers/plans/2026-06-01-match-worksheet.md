# Plan: «Сводка матча» (Match Worksheet) — persist readiness/hardFilters + top-of-page block (2026-06-01)

## Goal
На /match/[id] добавить СВЕРХУ (над вкладками) широкий блок «Сводка матча»: 4 колонки (Параметр | 🚢 Корабль | 📦 Груз/порт | Вердикт), 8 строк, все видны сразу. Главное — показать ИСХОДНИКИ (где корабль стоит, когда свободен, цепочка миль→суток→дата прихода), не только результат. Данные (MatchReadiness + сырые атрибуты судна + hardFilters) СЧИТАЮТСЯ движком, но сейчас ВЫБРАСЫВАЮТСЯ при persist — сначала перестать их терять.

## ⚠️ Orchestrator override (КОНФЛИКТ-АВОИДАНС — обязательно)
Параллельно идёт задача fit-rationale-plain, которая правит `components/match/MatchDetailPanel.tsx` + `lib/sailing/fit-breakdown.ts`. ЧТОБЫ НЕ БЫЛО КОНФЛИКТА: блок «Сводка матча» рендерить как НОВЫЙ компонент `components/match/MatchWorksheet.tsx`, подключённый в `app/match/[id]/page.tsx` СВЕРХУ. **НЕ трогать `components/match/MatchDetailPanel.tsx` ВООБЩЕ. НЕ трогать `lib/sailing/fit-breakdown.ts`.** (Спек упоминал расширить MatchDetailPanelProps — игнорируй, данные идут через page.tsx → MatchWorksheet напрямую.)

## Образец плумбинга — зеркалить fit_breakdown (точные места)
- Migration: как `lib/migrations/044-matches-item-index.ts`. Новая версия (проверь max в `lib/migrations/index.ts`, вероятно 045): `ALTER TABLE matches ADD COLUMN worksheet_json TEXT` (nullable, guard через PRAGMA table_info как в 044). Зарегистрировать в index.ts.
- `lib/matching/matches-repository.ts`: добавить `worksheet_json?: string | null` в StoredMatch (рядом стр.29-30) и CreateMatchInput (рядом стр.55-56); helper `hasWorksheetColumn(db)` (как hasFitColumns стр.104); в createMatch писать worksheet_json условно (как fit_breakdown стр.135-175). NULL-safe для немигрированных БД.
- `lib/matching/persist-session-matches.ts`: в объект createMatch (стр.63-85) добавить `worksheet_json: m.worksheet ? JSON.stringify(m.worksheet) : null` (зеркало стр.84 fit_breakdown).
- `lib/demo-mode/hydrate-demo-session.ts`: где читается fit_breakdown в rowsToMatches — читать worksheet_json (parse) → attach `worksheet` к session-матчу (NULL-safe fallback).
- `scripts/demo-seed/regenerate-matches.ts`: после analyzePairs (стр.113 result содержит readiness + hardFilters per match) собрать `m.worksheet` (см. форму ниже) и записать worksheet_json рядом с fitBreakdown (стр.~250). Тип Match расширить опц. полем `worksheet?`.

## Форма worksheet (JSON, что сохраняем)
```
{
  readiness: { openPosition, openDate, laycanStart, laycanEnd, distanceNm, distanceExact, speedKn, sailingDays, arrivalDate, gapDays, verdict, explanation },
  vessel: { draftMax, grainCapacity, grainCapacityUnit, geared, vesselType, flag, built, pandi, classSociety, lastCargoes, dwtSummer, dwcc },
  cargo: { weightMt, cargoType, loadPort, dischargePort },
  hardFilters: { draft:{pass,reason}, crane:{pass,reason}, volume:{pass,reason} }   // что доступно из analyzePairs result
}
```
Брать значения ИЗ результата analyzePairs (readiness, hardFilters) + из parsed vessel/cargo (cfValue для ConfidenceField). Если поле недоступно — null (UI покажет «—»). readiness.explanation и hardFilters.*.reason — уже человеческие строки, переиспользовать в вердиктах.

## Part 3 — UI `components/match/MatchWorksheet.tsx` (новый) + page.tsx
Широкая секция СВЕРХУ page.tsx (над вкладками Vessels/Economics), все строки видны. 4 колонки: Параметр | 🚢 Корабль | 📦 Груз/порт | Вердикт (✅/⚠️ + коммент). 8 строк:
- ⏱ Время: «свободен {openDate} ({openPosition})» | «грузить {laycanStart}–{laycanEnd}» | вердикт по verdict (ideal/tight/idle/late) + запас {gapDays}д
- 📍 Где/переход: «{openPosition}» | «{loadPort}» | ЦЕПОЧКА «{distanceNm} nm пустым → ≈{sailingDays} сут @ {speedKn} уз → {arrivalDate}»
- ⚖️ Вес: «{dwtSummer/dwcc} dwt» | «{weightMt} mt» | util% + ratio
- 📦 Объём: «{grainCapacity} {unit}» | объём груза | fit
- 🚢 Тип: «{vesselType}» | «{cargoType}» | подходит/нет
- 🏗 Краны: «geared? {geared}» | «{hardFilters.crane.reason}» | вердикт
- 🌊 Осадка: «{draftMax} m» | «{hardFilters.draft.reason}» | проходит/нет
- 🛡 Качество: «built {built} · flag {flag} · P&I {pandi}» | — | итог ветинга
Если worksheet null/частичный (старые/немигрированные матчи) — рендерить gracefully («—» в ячейках), НЕ падать. page.tsx: select worksheet_json из storedMatch → JSON.parse (try/catch) → проп в MatchWorksheet. EN-подписи по стилю остальной страницы.

## Tests (TDD) + /test-skill (risk-override: migration + data layer)
- migration 045: применяется идемпотентно; существующие строки → worksheet_json NULL.
- repository: createMatch пишет worksheet_json при наличии колонки; NULL-safe без неё.
- MatchWorksheet: с полным worksheet — 8 строк заполнены, цепочка миль→суток→дата видна; с null worksheet — «—», не падает.
- ИНВАРИАНТ: старые матчи (worksheet_json NULL) рендерят страницу без 500; fit_percent/счёт/прочее НЕ изменились.
- npx jest зелёное, tsc clean.

## Out-of-scope
- НЕ трогать MatchDetailPanel.tsx, fit-breakdown.ts (параллельная задача), Economics-вкладку, Fit Score, движок/веса/проценты.
- НЕ показывать 5 vetting-подсигналов детально (отдельный follow-up — нужно сохранять vetting.factors).
- НЕ запускать пересев demo-seed — ОРКЕСТРАТОР сделает ОДИН пересев после merge ОБЕИХ задач (worksheet + fit-rationale), т.к. regen перезапишет весь seed.

## Verify
- npx jest + tsc. PR в main: "feat(match): Match Worksheet — persist readiness/hardFilters + top-of-page vessel×cargo summary".
- Migration → проверить схему после деплоя. /test-skill обязателен. Gate3 (preview /match) — на стороне оркестратора (delegated prod Gate5).
