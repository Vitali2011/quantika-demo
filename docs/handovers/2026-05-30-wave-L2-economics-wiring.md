# Handover: Волна L2-wiring — подключить экономику к матчу — quantika-demo

**Дата:** 2026-05-30
**Тип:** autonomous superpowers session (dev-VPS, ветка `fix/matching-economics-wiring`)
**Ветвить от:** ядра `bad9639`. Параллельно с волнами A (данные) и B (UI) — НЕ пересекается:
A=данные/порты, B=фронтенд (app/components), L2=бэкенд (lib/matching + lib/economics).
**Основание:** код-аудит 2026-05-30 — движок TCE на ~70% готов и работает, но `match.economics`
ВСЕГДА пустой. Экономика считается только в отдельном `/api/economics`, не в пайплайне матча.

## Зачем (high-ROI проводка, не стройка)

`lib/economics/voyage-calculator.ts` (TCE $/день) и `lib/economics/war-risk.ts` (надбавка JWC)
УЖЕ РАБОТАЮТ и покрыты тестами. Но `Match.economics?: EconomicsResult` (lib/types.ts) никогда
не заполняется в `lib/matching/pair-analyzer.ts`. Брокер не видит $/день на матче. Эта волна
СОЕДИНЯЕТ готовое: вызвать расчёт в пайплайне и положить результат в `match.economics`.

## Scope — ТОЛЬКО #5 + #6 (проводка)

- **#5** Подключить `match.economics`: в пайплайне матча для каждого подходящего матча вызвать
  существующий расчёт TCE и заполнить поле `Match.economics`.
- **#6** Война-риск (JWC) в выводе матча: уже считается в `lib/economics/war-risk.ts` —
  убедиться, что попадает в `match.economics` (часть EconomicsResult).

## ВНЕ scope (КРИТИЧНО — не расширять)

- **#7 источник ставки фрахта** — НЕ трогать. Сейчас freight rate = оценка (`estimateFreightRate`).
  Использовать существующую оценку как есть. Реальный парсинг/бенчмарк ставки — ОТДЕЛЬНАЯ
  дизайн-сессия с фаундером, НЕ эта волна.
- **#8 TCE в скоринг** — НЕ менять формулу score/ранжирование. Экономика только ОТОБРАЖАЕТСЯ
  (заполняет поле), не влияет на сортировку/фильтрацию матчей.
- UI экономики — НЕ трогать (это не B). Только заполнить данные в `match.economics`.
- Не трогать партиционирование корзин (ядро), данные (A), фронт (B).

## Ключевые файлы

- `lib/matching/pair-analyzer.ts` — главное: где заполнять `match.economics`
- `lib/matching/compute-matches.ts` — уже зовёт TCE для DB-персиста (`tce_usd_per_day`); свериться, переиспользовать
- `lib/matching/tce-calculator.ts` — `estimateFreightRate`, `computeEstimatedTce` (есть)
- `lib/economics/voyage-calculator.ts` — `calculateTCE` (работает)
- `lib/economics/war-risk.ts` — надбавка JWC (работает)
- `lib/economics/index.ts` — оркестрация расчёта
- `lib/types.ts` — `Match.economics`, `EconomicsResult` (УЖЕ есть). **Если правишь types.ts —
  ТОЛЬКО аддитивно** (новые опц. поля), не меняй существующие — параллельные волны A/B могут касаться этого файла.
- Тесты: `tests/economics/voyage-calculator.test.ts`, `lib/matching/__tests__/*`

## Процесс (superpowers)

1. **SCOPE MATCH** — подтверди scope (#5+#6 проводка, #7/#8 вне) одной строкой.
2. **writing-plans** — план (M tier). **Reality-check сначала:** grep где `calculateTCE`/
   `computeEstimatedTce` уже зовётся (compute-matches.ts) → переиспользуй, не дублируй.
3. **test-driven-development** — тест-первым: после `analyzePairs` на demo-данных у good/possible
   матчей `match.economics` populated (TCE число + war-risk если зона применима); матчи без
   достаточных данных — `economics` undefined (не падать).
4. **requesting-code-review** + **verification-before-completion**.
5. **finishing-a-development-branch** — PR в main (draft). НЕ мержить.

## Критерии приёмки

- После матчинга на demo (79×51) у матчей основного списка `match.economics` заполнен (TCE $/день).
- Война-риск попадает в economics для матчей через JWC-зоны.
- Score/ранжирование/число матчей НЕ изменились (экономика только отображается). Проверить
  `scripts/research/match-realism-funnel.ts` — число main-матчей то же, что без L2.
- Полный прогон: `NODE_OPTIONS='--max-old-space-size=8192' npm test` (известный чужой флак
  `scripts/progonq/score-classify` — не наш регресс).
- risk-override: тут затрагивается matching-пайплайн → после цепочки прогнать внимательно,
  убедиться что партиционирование корзин из ядра НЕ сломано.

## Жёсткие ограничения

- НЕ менять ожидания тестов под имплементацию.
- Surgical: только проводка экономики в матч. Без рефакторинга движка/скоринга/freight-rate.
- `lib/types.ts` — аддитивно only (параллельные волны).
- Фаундер НЕ у терминала: при неоднозначности — задокументируй допущение, продолжай.
- НЕ трогать worktree волн A (wave-a-data-freshness) и B (wave-b-bucket-ui).
- Прочитай `.claude/rules/ai-provider.md` если затронешь LLM-вызовы (вряд ли — расчёт детерминированный).
