# Plan: Economics #2 — distance→FuelEU + Compare Suez/Cape fix (2026-06-01)

## Goal
Вкладка Economics (/match/[id]) — 3 связанных дефекта в components/match/EconomicsTab.tsx (+ app/match/[id]/page.tsx). Провести реальную дистанцию рейса → чинит FuelEU; убрать хардкод в Compare Suez/Cape; объяснить, почему кнопка Compare серая, + дозасеять суда.

## Probe-факты (origin/main)
- EconomicsTab Props: `routeDistanceNm?: number|null` (стр.20), `storedFreightRate?: number|null` (22), `freightRateSource` (23). `currentRate` state = storedFreightRate (66) — РЕАЛЬНАЯ ставка.
- compareInputs (154-180): хардкод `valueUsd: 22_000_000` (176), `freightRateUsdPerMt: 28` (180). `ready` (162-168) требует speedLaden>0 && consumption>0 (+origin,destination,dwt,weightMt).
- estimateVoyageDays(routeDistanceNm, speedKnots) (202,219).
- page.tsx: <EconomicsTab> рендерится (найти точное место), routeDistanceNm НЕ передаётся сейчас (=null). storedMatch.distance_nm — колонка УЖЕ есть (StoredMatch), миграции НЕ надо.

## ЧАСТЬ 1 — distance → FuelEU
- `app/match/[id]/page.tsx`: в месте рендера <EconomicsTab ...> добавить `routeDistanceNm={storedMatch.distance_nm ?? null}`. (Проверить, что storedFreightRate/freightRateSource тоже прокинуты — если нет, прокинуть из storedMatch.)
- Приёмка: на матче с distance_nm FuelEU показывает оценку штрафа, не «Voyage distance n/a».

## ЧАСТЬ 2 — Compare хардкод
- `compareInputs` (EconomicsTab ~176/180): `freightRateUsdPerMt: 28` → `currentRate ?? storedFreightRate ?? <fallback>` (реальная ставка ~$42.28). `valueUsd: 22_000_000` → оценка из DWT/класса: добавить helper `estimateVesselValueUsd(dwt, vesselType)` с ЯВНЫМ комментарием-допущением (документировать формулу, напр. $/dwt по классу handysize/supramax/panamax) — НЕ слепой $22M. Если dwt нет → null + честная пометка.
- Приёмка: модалка считает по реальной ставке, не 28; vessel value выведен из DWT с видимым допущением.

## ЧАСТЬ 3 — кнопка Compare
- (a) Когда `!compareInputs.ready` — рядом с кнопкой показать ПОЧЕМУ (текст: каких полей нет — «нет скорости/расхода судна»), не молча серую. Список недостающих из ready-условия.
- (b) Дозасеять демо-суда полями `speedLaden` + `consumption` (реалистичные по классу: handysize ~12.5kn/22mt, supramax ~13kn/26mt, panamax ~13.5kn/30mt — уточнить) в данных парсинга демо-судов (parsed_results vessels, откуда читает regenerate-matches.ts). Найти, где демо-суда получают атрибуты, добавить туда. ПРОГОН РЕГЕНЕРАЦИИ seed делает ОРКЕСТРАТОР (не субагент).
- Приёмка: полное судно → кнопка кликается; неполное → видно текстом, чего не хватает.

## Tests (TDD) + /test-skill (risk-override economics)
- page передаёт routeDistanceNm=distance_nm; FuelEU считает при наличии дистанции+speed+consumption.
- compareInputs использует currentRate (не 28); estimateVesselValueUsd детерминирован + документирован; null-safe.
- disabled-reason: при отсутствии speed/consumption видно сообщение; ready=true при полном судне.
- ИНВАРИАНТ: формула TCE НЕ изменена; war-risk/Fit Score/bunker-выбор не тронуты.

## Out-of-scope
- НЕ менять формулу TCE; НЕ трогать выбор бункер-порта (Economics №1 — отдельно, идёт ПОСЛЕ); НЕ трогать Fit Score/war-risk; НЕ трогать MatchWorksheet/MatchDetailPanel.
- Регенерацию demo-seed НЕ запускать — оркестратор сделает (Часть 3b добавляет seed-поля).

## Verify
- npx jest + tsc. PR в main: "fix(economics): wire route distance to Economics (FuelEU) + real-rate Compare + seed speed/consumption". /test-skill обязателен. Gate3/Gate5 — оркестратор. Migration НЕ нужна.
