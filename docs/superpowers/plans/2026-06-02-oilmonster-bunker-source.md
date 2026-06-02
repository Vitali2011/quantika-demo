# Plan: OilMonster bunker-price source adapter (Delta-Step 1)

## Goal (one line)
Добавить OilMonster (oilmonster.com/bunker-price) как источник цен бункера в существующую таблицу `bunker_prices`, покрыв все 5 хабов BUNKER_CANDIDATES (NLRTM/SGSIN/AEFJR/USHOU/GIGIB) — особенно **Gibraltar + Houston**, которых нет у текущего bunkerindex (3 порта). Образец — `lib/market/handybulk-scraper.ts`.

## Context (УЖЕ существует — переиспользовать, НЕ строить заново)
- `bunker_prices` table + `lib/market/bunker-repository.ts` (`getLatestBunkerPrice`, upsert: port_unlocode, fuel_grade, price_usd_per_mt, price_date, source, fetched_at).
- `scripts/knowledge/cron/refresh-bunker.ts` (BP-01) — оркестрирует USDA(primary) + Ship&Bunker(fallback) + BunkerIndex. Live-проверка: **Ship&Bunker=403 (мёртв)**, USDA US-центричный, BunkerIndex только 3 хаба.
- `lib/knowledge/bunker/{usda,shipandbunker,bunkerindex}-adapter.ts` — паттерн адаптера (refreshX(db) → {rowsChanged}).
- `lib/market/handybulk-scraper.ts` — образец HTML-скрейпера (Baltic).

## Scope (~3-4 файла)
1. **NEW** `lib/knowledge/bunker/oilmonster-adapter.ts` — `refreshOilMonster(db)`: fetch oilmonster.com/bunker-price → распарсить статичную HTML-таблицу → per-port {port_unlocode, fuel_grade (VLSFO/MGO/HSFO), price_usd_per_mt, price_date} → **range-валидация** (200–2000 $/mt, иначе skip) → маппинг имён портов → UNLOCODE минимум для 5 хабов (Rotterdam→NLRTM, Singapore→SGSIN, Fujairah→AEFJR, Houston→USHOU, Gibraltar→GIGIB; можно больше) → upsert через bunker-repository. Возвращает {rowsChanged}.
2. `scripts/knowledge/cron/refresh-bunker.ts` — добавить `refreshOilMonster` как источник (высокий приоритет/primary), остальные оставить fallback. Контракт BP-01: exit 0 если ≥1 источник успешен.
3. **NEW** `lib/knowledge/bunker/__tests__/oilmonster-adapter.test.ts` — парсинг сохранённого HTML-фикстура (НЕ живая сеть в тестах): ассерт 5 хабов с грейдами/ценами, range-валидация режет мусор, маппинг имён портов верный, fail-gracefully на битом HTML.
4. (опц.) `knowledge_sync_log` запись для нового источника `bunker-oilmonster`.

## Acceptance
- `refreshOilMonster` наполняет `bunker_prices` для ≥5 хабов × ≥2 грейда (VLSFO+MGO); **Gibraltar (GIGIB) + Houston (USHOU) присутствуют**.
- Range-валидация режет цены вне 200–2000 (анти-мусор).
- Unit-тесты зелёные (детерминированный фикстур, НЕ живая сеть в CI).
- Существующие источники (USDA/BunkerIndex) НЕ сломаны.
- **/test-skill** cold adversarial QA (parser risk-override): битый HTML, пропавшие колонки, нечисловые цены, варианты имён портов.

## Out of scope (orchestrator)
- НЕ трогать `EconomicsTab.tsx` / `bunker-recommendation/route.ts` / `port-master.json` (это Delta-Steps 2/3).
- НЕ менять UI. НЕ менять другие market-скрейперы (handybulk/indices).
- НЕ запускать живой скрап против прод-БД / НЕ коммитить живые данные.
- Если нет egress на dev-VPS для фикстура — сохранить фикстур из доступного источника или записать QUESTIONS.md (НЕ выдумывать HTML).

## Risk
- Parser (HTML-скрап) → **/test-skill обязателен**. Тесты детерминированные (фикстур, без сети).
- Структура HTML OilMonster может отличаться — адаптер fail-gracefully (log + skip источника, НЕ ронять refresh-bunker; exit 0 если другой источник жив).
- Branch-first invariant (v3.10.0): первая команда в worktree — branch echo.
