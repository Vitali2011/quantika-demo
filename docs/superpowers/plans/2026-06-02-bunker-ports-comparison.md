# Plan: Multi-port bunker comparison API + port-pool 5→23 (Delta-Step 2)

## Goal
(1) Расширить пул портов-кандидатов бункеровки с 5 до ~23 кураторских хабов. (2) Изменить `/api/voyage/bunker-recommendation` чтобы возвращать СПИСОК on-route портов с per-port математикой (движок для таблицы-сравнения Step 3), а не ОДИН порт.

## Context (УЖЕ существует — переиспользовать)
- `app/api/voyage/bunker-recommendation/route.ts` — сейчас: `BUNKER_CANDIDATES = [NLRTM,SGSIN,AEFJR,USHOU,GIGIB]` (5), detour on-route если ≤15% дистанции ИЛИ <200 NM, возвращает ОДИН cheapest порт + `savingsUsd` + `recommendation` строку.
- `lib/sailing/port-distances.ts` (`getPortDistance`, ручная матрица + haversine fallback), `data/ports/port-master.json` (471 порт lat/lon).
- `lib/economics/split-bunker.ts` (`optimizeSplitBunker`).
- `bunker_prices` + `getLatestBunkerPrice` — теперь с OilMonster (#756 merged): больше портов вкл Gibraltar/Houston.
- `market_indices` — Baltic дневная ставка по классу судна (для time-cost). Vessel speed/consumption — seeded #736.

## Scope (~4-6 файлов)
1. `app/api/voyage/bunker-recommendation/route.ts` — `BUNKER_CANDIDATES` → 23 хаба (см. список ниже). Ответ: добавить `candidates: [{port, grade, priceUsdPerMt, deviationNm, deviationHours, deviationFuelUsd, timeCostUsd, effectiveUsdPerMt, onRoute}]` отсортировано по `effectiveUsdPerMt` ASC. СОХРАНИТЬ backward-compat: существующие поля `port/priceUsdPerMt/recommendation/savingsUsd/fallback` (= лучший кандидат), чтобы live-рендер #742 не упал.
2. **NEW** `lib/economics/bunker-comparison.ts` — чистая функция per-port математики: `effectiveUsdPerMt = (price*liftTonnes + devFuelUsd + devTimeUsd)/liftTonnes`; `devFuelUsd = deviationNm * (dailyConsT/(speedKn*24)) * price`; `devTimeUsd = (deviationNm/speedKn/24) * vesselDayRateUsd`. Вход: vessel(speedKn,dailyConsT), liftTonnes, vesselDayRateUsd, кандидаты(price+deviationNm). Чистая, date-independent.
3. `data/ports/port-master.json` — добавить **Malta `MTMLA`** (lat 35.89, lon 14.51, country MT, maxDraftM ~11, berthType deep-sea).
4. Если меняется тип ответа API → минимально адаптировать единственного консьюмера в `EconomicsTab.tsx` чтобы НЕ падал (показывает лучший порт как раньше; полная таблица — Step 3). НЕ строить UI-таблицу здесь.
5. Tests: `bunker-comparison.test.ts` (математика с известными числами: deviation fuel, time cost, eff $/т, сортировка) + route test (list shape, 23 пула, on-route фильтр, backward-compat поля).

## 23 хаба (LOCODE — все verified в port-master кроме Malta)
SGSIN CNZOS HKHKG KRPUS CNSHA TWKHH LKCMB AEFJR SAJED NLRTM BEANR GIGIB ESALG ESLPA GRPIR TRIST USHOU USNYC PABLB BRSSZ USLAX ZADUR + MTMLA(добавить).

## Acceptance
- API возвращает `candidates[]` on-route (для тест-рейса ≥2-3 порта) с полной per-port математикой, sort по eff $/т.
- Пул = 23 хаба; Malta в port-master.
- Математика eff $/т верна (unit-тесты, известные числа).
- Backward-compat: live-рендер EconomicsTab НЕ падает (показывает ≥ лучший порт).
- CI green. Tests детерминированные.

## Out of scope (orchestrator)
- UI таблица-сравнение, ECA grade-basket, scrubber toggle, carbon-in-price — это **Step 3**. Тут только API + данные + математика-движок.
- OilMonster scraper — Step 1 (#756 merged).
- НЕ трогать EconomicsTab сверх минимальной адаптации типа (чтоб не падало).
- prod-БД не трогать.

## Risk / notes
- Финансовая математика → тщательные TDD unit-тесты с известными числами (НЕ просто smoke).
- API contract change → backward-compat обязателен (live #742 рендер не сломать).
- vesselDayRate: взять из market_indices по классу (DWT→Supramax/Panamax/Handy). Если нет данных — разумный дефолт + флаг.
- haversine неточность для не-матричных портов — допустимо для демо.
- Branch-first invariant: первая команда — branch echo.
