# Handover: Волна #7 — источник ставки фрахта (freight-rate waterfall) — quantika-demo

**Дата:** 2026-05-30
**Тип:** autonomous superpowers session (dev-VPS, ветка `fix/freight-rate-waterfall`)
**Дизайн:** согласован с фаундером в дизайн-сессии 2026-05-30 (см. решения ниже — НЕ переделывать).
**Основание:** roadmap-to-100 L2 #7. TCE стоит на ставке фрахта — самое шаткое звено.

## ⚠️ ОЧЕРЁДНОСТЬ (критично)

Эта волна трогает `lib/matching/tce-calculator.ts` + `compute-matches.ts` — ТЕ ЖЕ файлы, что
волна **L2-economics-wiring** (`fix/matching-economics-wiring`, #5+#6). **НЕ запускать параллельно.**
Запускать ПОСЛЕ закрытия L2-wiring; **ветвить от ветки L2-wiring** (или от main, если L2 смержена),
чтобы resolveFreightRate лёг на уже подключённый match.economics.

## Контекст: что уже есть (probe 2026-05-30)

- **Ступень 1 (parsed):** `ParsedCargo.freightRateUsd` (lib/types.ts:180) — поле есть, но **0% демо
  заполнено**, нет правил парсинга, единица неоднозначна (нет freight_basis как в FixtureRecap).
- **Ступень 2 (Baltic):** таблица `baltic_indices` + seed + `getLatestBalticIndex` + API — ЕСТЬ;
  но **НЕТ функции** индекс→$/mt; seed статичный (BHSI=650, 2026-05-09).
- **Ступень 3 (estimate):** `estimateFreightRate()` (lib/matching/tce-calculator.ts:67) — РАБОТАЕТ,
  base rates по типу груза + факторы дистанции/DWT, возвращает `{rate, source:'estimated', confidence:0.3–0.6}`.
- voyage-days доступны (`lib/economics/voyage-days.ts:estimateVoyageDays`).

## Дизайн (СОГЛАСОВАН — не менять)

**Единая функция `resolveFreightRate(cargo, vessel, distanceNm, manualRate?) → { value, source, confidence }`**
— водопад по приоритету (manual бьёт всё):

0. **manual** (ручной ввод брокера, если задан) → confidence максимальный → бейдж «✎ вручную».
   **Липкая** (решение фаундера): держится поверх всего, пересчёт/перепарсинг её НЕ трогают;
   сбрасывается только явным действием брокера (кнопка «сбросить к авто»). В БД уже `source='manual'`.
1. **parsed** (из письма, если есть) → confidence высокий → бейдж «✓ из письма»
2. **baltic** (НОВОЕ) → `$/mt = (индекс $/день по классу судна × дни рейса) ÷ тонны`
   через `baltic_indices` + `estimateVoyageDays`; маппинг класс судна (handysize→BHSI, supramax→BSI,
   panamax→BPI если есть, иначе BSI) → бейдж «~ рынок (Baltic <date>)»
3. **estimate** (существующий) → confidence низкий → бейдж «≈ оценка»

**Ручной ввод — что уже есть (probe):** `EconomicsTab.tsx` имеет поле ввода ставки;
`PATCH /api/matches/[id]` принимает `freight_rate_usd_per_mt` + пишет `source='manual'` +
пересчитывает TCE; `updateFreightRate(id, rate, source, tce)` в matches-repository. Эта волна
ВСТРАИВАЕТ существующий ручной ввод в водопад как ступень 0 + «липкость» + кнопку сброса +
бейдж «✎ вручную». НЕ строить ручной ввод с нуля — он есть, нужно поднять его приоритет и
гарантировать, что resolveFreightRate уважает manual поверх parsed/baltic/estimate.

**Показ TCE (решение фаундера):** TCE показываем **ВСЕГДА**, но источник+доверие видны бейджем.
При ступени 3 (estimate) — **яркая пометка «≈ оценка, ставка не подтверждена»** + приглушённый
цвет числа. Это ОСНОВНОЙ режим (в демо parsed≈0, Baltic статичный) — честность важнее точности.

**Ступень 1 парсинг (решение фаундера: ВКЛЮЧИТЬ):** добавить извлечение ставки/«freight idea»/
«last done»/«$X pmt»/lumpsum в промпт+схему parse-cargo. ⚠️ Это трогает ПАРСЕР → **risk-override:
обязательный adversarial QA (/test-skill) после цепочки** (parser имеет историю регрессий).

## Scope

- `resolveFreightRate()` — новая функция-водопад (manual→parsed→baltic→estimate), ЕДИНАЯ точка получения ставки.
- Ручной ввод как ступень 0: «липкая» ставка (не сбрасывается пересчётом), кнопка «сбросить к авто»,
  бейдж «✎ вручную». Переиспользовать существующий EconomicsTab-ввод + PATCH /api/matches/[id] + source='manual'.
- Ступень 2 Baltic→$/mt — новая логика (индекс × дни ÷ тонны), маппинг класса судна.
- Ступень 1 — расширить промпт+схему parse-cargo (извлечение ставки) + нормализация в $/mt.
- Заменить прямые вызовы `estimateFreightRate()` на `resolveFreightRate()` во ВСЕХ call-sites
  (compute-matches.ts, persist-session-matches.ts, matches/[id]/route.ts, EconomicsTab, voyage APIs).
- Source+confidence доходят до UI (бейдж). EconomicsTab показывает бейдж источника.

## ВНЕ scope

- Live Baltic (платный feed, L4) — используем статичный seed, помечаем дату.
- Изменение формулы TCE / скоринга матча (это L2-wiring + ядро).
- Партиционирование корзин (ядро), данные/порты (волна A), UI вкладок (волна B).

## Процесс (superpowers)

1. **SCOPE MATCH** — подтверди дизайн (3-ступенчатый водопад + parser-расширение) одной строкой.
2. **writing-plans** — план (M/L tier — parser + matching + UI). Reality-check: переиспользуй
   `estimateFreightRate` как ступень 3, `baltic-repository` для ступени 2.
3. **test-driven-development** — тесты: водопад выбирает правильную ступень; Baltic-конверсия
   считает $/mt; parsed имеет приоритет; source/confidence корректны; TCE с estimate помечен.
4. **/test-skill** (ОБЯЗАТЕЛЬНО — risk-override на parser) — adversarial QA на извлечение ставки.
5. **requesting-code-review** + **verification-before-completion**.
6. **finishing-a-development-branch** — PR в main (draft). НЕ мержить. UI PR → отметить visual-preview.

## Критерии приёмки

- `resolveFreightRate` возвращает корректную ступень по приоритету с source+confidence.
- Baltic-ступень даёт осмысленный $/mt (проверить на 2-3 маршрутах вручную в тесте).
- parse-cargo извлекает ставку, где она ЕСТЬ в письме (добавить fixture с явной ставкой).
- Каждый TCE на /matches имеет видимый бейдж источника; estimate — яркая пометка «оценка».
- Число main-матчей и ранжирование НЕ изменились (ставка влияет на TCE-показ, не на матч).
- Полный прогон зелёный + /test-skill PASS. Известный чужой флак progonq/score-classify — не наш.

## Жёсткие ограничения

- НЕ менять ожидания тестов под имплементацию.
- Surgical: ставка фрахта + её показ. Без рефакторинга движка матчинга/скоринга.
- Прочитать `.claude/rules/ai-provider.md` — parse-cargo идёт через LLM (промпт-изменение).
- Фаундер НЕ у терминала: неоднозначность → задокументируй допущение, продолжай.
- НЕ трогать worktree других волн.
