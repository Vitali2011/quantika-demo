# Структурный шаг: рейтинг → `fitPercent`

**Дата:** 2026-06-07
**Статус:** дизайн утверждён фаундером (brainstorm), ждёт плана
**Роадмап:** `docs/ROADMAP-CURRENT-STATE.md` §0 строки 10-21, 46, 69 (маршрут шаг #3)
**Уровни:** разом включает L2 (деньги) + L3 (ветинг) в подбор

---

## 1. Проблема

Движок считает **два несвязанных числа на матч**:

- **`m.score`** (`lib/sailing/match-scoring.ts:459-653`): гео 20 / тип 20 / краны 15 / объём 15 / laycan 20 / dwt 10. **Рулит сортировкой главного списка (`pair-analyzer.ts:711`), раскладкой по корзинам и `matchLevel` (`match-scoring.ts:157-161`).** Ноль экономики, ноль ветинга.
- **`fitPercent`** (`lib/sailing/fit-breakdown.ts:50-60`): util 23 / timing 18 / ballast 18 / classFit 11 / cargoType 7 / cranes 7 / volume 4 / draft 3 / **vetting 9** = 100. **Только отображение** — код закрепляет дословно: *«can never affect score, ranking, or bucketing»* (`pair-analyzer.ts:741`).

В сиде **0/425** матчей имеют `score == fit_percent`. Реальный пример: `score=90` (топ списка, в шортлисте), `fit=54`, `TCE=−$1260/день`. Наверху стоит «идеально по железу», коммерчески — убыток.

TCE (#841) влияет **только** на корзинный floor (`pair-analyzer.ts:819-848`: ниже class-breakeven → review), но **не ранжирует** внутри main и **не входит** в score. Ветинг — то же (только в fit-%).

**Вторая болячка:** даже fit-cap по TCE кормится **черновым** `preFitTce` — legacy 6-арг `computeEstimatedTce` **без балласта/канала** (`pair-analyzer.ts:688-691`), не настоящим true-voyage TCE из `buildMatchEconomics`.

## 2. Цель

`fitPercent` — единственный носитель знания о деньгах и надёжности. Сделать его **движком ранжирования и раскладки по корзинам**; старый 6-факторный `score` перестать гонять как параллельный ранкер. Заодно — свернуть **настоящий** true-voyage TCE в `fitPercent` плавным градиентом.

## 3. Решения (утверждены фаундером)

### 3.1 Деньги входят в `fitPercent` градиентом, вес ~18 из 100
- Добавить **10-й фактор — экономика ~18 пунктов** в бюджет `computeFitBreakdown`, ужав остальные 9 факторов пропорционально (совместимость+ветинг ≈82 — ведут).
- **Двусторонний:** прибыль → плюс пункты, убыток → минус, **плавно** (не бинарный рубильник).
- Кормить **настоящим** true-voyage TCE (с балластом+каналом из `buildMatchEconomics`), не `preFitTce`.
- **Маппинг $/день → пункты** (механика, к уточнению в плане): якорь — class-breakeven. На breakeven ≈ 0 пунктов от экономики (нейтрально); заметная прибыль → к +максимуму; убыток ниже breakeven → к −максимуму. Нормировать по классу судна (breakeven зависит от DWT, см. `pair-analyzer.ts:835-838`), а не абсолютным $.

### 3.2 Ранжирование + бакетинг + matchLevel — по `fitPercent`
- `pair-analyzer.ts:711` сортирует по `fitPercent`, не `score`.
- `matchLevel` (good/possible/weak) выводится из `fitPercent`, не score (`match-scoring.ts:157-161` или новый дериватор).
- Раскладка main/review/insufficient (`pair-analyzer.ts:724-739`) — по fit-производному matchLevel + verdict.
- **`score` остаётся вычисляемым** (нужен для панели-разбивки `reason_structured`/UI), но **больше ничего не ранжирует**. Физический снос `computeScoreBreakdown` — отдельный хвост-уборка, НЕ в этой задаче.
- *Замечание:* теряем гео-дистанцию score'а как сигнал, но fit'овский `ballast` (open-position → load port) — более правильная «близость» для брокера. Это улучшение.

### 3.3 Жёсткий пол убыточности — оставить как страховку
- `pair-analyzer.ts:819-848` (TCE < class-breakeven → review) **сохраняется**: «никогда не показывай явный убыток в main», даже при высоком fit.
- Не двойной счёт: floor = бинарная защита снизу; градиент (3.1) = плавный рейтинг сверху. Разные роли. (После калибровки floor может срабатывать реже — это ок.)

### 3.4 Пороги корзин (калибровка — фаундер утвердил как старт)
- main = `fit ≥ 60` (сохраняет render-floor #789, `MatchesClient.tsx:~322`).
- `good ≥ 70`, `possible 60-69`, `< 60` → review/weak.
- Число матчей в main изменится (сейчас 69) — **точное число показать в before/after до прод-применения**.

### 3.5 Единое ранжирование везде + прод-реген
Чтобы движок и витрины не разъезжались, выровнять три места, ещё держащиеся за `score`:
- **Дефолт сорта судовладельца** — сейчас `'tce'` (`MatchesClient.tsx:124` `isOwner ? 'tce' : 'fit'`). Фрахтователь уже `'fit'` — для него новый fit отразится сразу.
- **DB `ORDER BY`** — сейчас `score DESC` (`lib/matching/matches-repository.ts:485, 508-515`).
- **top-3 Chrome-расширения** — сейчас `b.score - a.score` (`app/api/extension/context/route.ts:34`).
- **Прод-реген** пересоберёт `demo-seed.db` с новой раскладкой по корзинам (Rule#22: бэкап → preview на /tmp → founder «применяй» → checkpoint → restart → verify — как #842/#843). Реген обязателен, т.к. раскладка по корзинам запечена в сид (sentinel `user_id`: NULL/`__demo_review__`/`__demo_insufficient__`).

## 4. Ключевой архитектурный узел (для плана)

`fitPercent` считается **до** сортировки (`pair-analyzer.ts:693-703`) с черновым `preFitTce`. Настоящий true-voyage TCE (`buildMatchEconomics`, с балластом+каналом) считается **после** сортировки и только для mainMatches (`pair-analyzer.ts:749-808`).

**Чтобы свернуть настоящий TCE в fit, надо посчитать true-voyage TCE ДО `computeFitBreakdown`** — для каждой пары. Это центральный рефактор: вынести/продублировать расчёт `buildMatchEconomics` (или хотя бы его `tceUsdPerDay`) в pre-fit фазу и прокинуть в `computeFitBreakdown` как `tceUsdPerDay` + в новый экономический фактор. Канонический путь TCE — `analyzePairs`→`buildMatchEconomics` (НЕ 6-арг `computeEstimatedTce`, deprecated для регена).

## 5. Объём (scope)

**В этой задаче:**
1. Экономический фактор (~18) в `computeFitBreakdown` + двусторонний градиент по true-voyage TCE.
2. Pre-fit вычисление true-voyage TCE (архитектурный узел §4).
3. Ранжирование + matchLevel + бакетинг по `fitPercent` (`pair-analyzer.ts`).
4. Сохранение жёсткого floor (§3.3).
5. Выравнивание 3 downstream-мест (§3.5) + прод-реген.

**НЕ в этой задаче (отдельные хвосты роадмапа §0 «Проводка готового»):**
- Физический снос `computeScoreBreakdown` / мёртвого `getVesselPassport`.
- PSC→ветинг (6-й суб-фактор), port-DA→TCE, CII-в-сид, carbon→TCE, war→per-day TCE.
- Снос/карантин `real-matches.ts` + `build.ts`.
- Сужение golden-полос.

## 6. Валидация и тесты

- **golden-set** (`lib/matching/__tests__/golden-set/golden-set.test.ts`, 15 пар): проверяет per-pair значения + bucket-membership, **НЕ порядок** → структурно не ломается от смены ранкера. Прогнать `npm run golden`.
- **Точечные тесты** (по разведке риск ~0): `pair-analyzer`, `match-realism-stability`, `matches-buckets`, `__tests__/api/matches*`, `compute-matches*`. `matches-sort.test.tsx:64` — regex на `MatchesClient.tsx` (UI-сорт); править осознанно при §3.5.
- **Новый тест:** экономический градиент в fit монотонен по TCE; matchLevel выводится из fit; высокий-TCE+совместимый матч ранжируется выше низкого-TCE при равной совместимости.
- **before/after на реальных demo-матчах** (числа уже в сиде) — собрать таблицу «старый топ vs новый топ» + новые счётчики корзин **ДО** прод-применения. Фаундер смотрит глазами, подтверждает вес ~18 и пороги.
- **VALUE_CHECK** перед DONE (value-bearing, source=golden): новый main all-positive-or-floored TCE, без $100k-миражей, счётчики разумны.

## 7. Риски

- **Маппинг TCE→пункты** — главный источник «кривого» рейтинга; калибровать на before/after, не абстрактно.
- **Раскладка по корзинам поедет** — число main изменится; это ожидаемо, но показать фаундеру до прод.
- **Downstream-рассинхрон** — если выровнять не все 3 места §3.5, движок ранжирует по fit, а витрина по старому. Все три — в одном PR.
- **Прод-реген** — Rule#22 строго (бэкап, preview, founder-gate, матчи/сессии не трогать).

## 8. Конвейер исполнения

recon (✅ сделано, 3 read-only агента — факты в этом доке) → **план** (`writing-plans`) → исполнение (`subagent-driven-development`, Sonnet) → before/after → founder go → прод-реген (Rule#22) → Gate5 + VALUE_CHECK.
