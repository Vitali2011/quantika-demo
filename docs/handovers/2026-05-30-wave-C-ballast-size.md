# Handover: Волна C — балласт + соразмерность (рычаги 3+4) — quantika-demo

**Дата:** 2026-05-30
**Тип:** autonomous superpowers session (dev-VPS, ветка `fix/matching-ballast-size`)
**Ветвить от:** СВЕЖЕГО origin/main ПОСЛЕ merge #694+#696+#698 (содержит ядро+данные+экономику).
**НЕ запускать пока #698 не в main** — C трогает scoring/matching, общий с #696/#698.
**Основание:** roadmap-to-100 L1 рычаги 3+4 + broker-view находки 2026-05-30 (ложные «good»).

## Зачем (broker-view доказал)

Оценка качества «глазами брокера» (scripts/research/top-matches-broker-view.ts) нашла 3 пары
со score 81 «good», на которые брокер НЕ позвонит:

- **util 34%** (PC-strand 2500т на судно 8100 DWT) — диспропорция, deadfreight. → рычаг #4.
- **1580nm балласт** за мелкой партией (судно открыто Ходейда→Искендерун) — неэкономично. → рычаг #3.
  Сейчас балласт и размер ТОЛЬКО штрафуют балл, не отсекают и не кепуют «good».

## Scope — рычаги 3 + 4

### Рычаг 3 — балласт как жёсткий критерий (с поправкой на класс судна)

- Далёкий порожний переход → НЕ «good». Для мелкого near-sea флота (наш сегмент, медиана ~7000 DWT)
  балластный радиус КОРОТКИЙ. Порог зависит от класса: handysize/small ≪ capesize.
- Реализация: либо hard-cap score (балласт > порог по классу → max 'possible', не 'good'), либо
  вынос в lowConfidence-корзину при экстремальном балласте. НЕ резать полностью — показать с пометкой.
- Опора: lib/sailing/readiness-gap.ts (distanceNm уже считается), classifyVesselByDwt (есть).

### Рычаг 4 — соразмерность (с поправкой на part-cargo)

- util = cargo / DWCC. Низкий util → диспропорция → НЕ «good».
- ⚠️ ВАЖНО part-cargo: в handysize/breakbulk частичная загрузка НОРМАЛЬНА (одно судно — несколько
  партий). НЕ штрафовать жёстко, если cargo помечен part-cargo / «part cargo» в описании или явно
  мелкий относительно типичных партий. Иначе зарежем законные частичные грузы (broker-view #536
  «Mobile machinery, part cargo» — util 5% это ОК для part-cargo).
- Реализация: util < порог И не part-cargo → cap score до 'possible'. Порог ~50% (из research,
  показать чувствительность в тесте).

## ВНЕ scope

- Военный риск/ветинг (это L3, отдельно). Хотя broker-view нашёл Ходейду — война-риск НЕ здесь.
- Изменение партиционирования корзин (ядро), данных (A), экономики (L2), UI (B), ставки (#7/#699).
- Live Baltic, внешние API.

## Ключевые файлы

- `lib/sailing/match-scoring.ts` — scoring компоненты (geographic proximity = балласт, DWT class fit
  = размер). Сейчас баллы, нужно добавить hard-cap/bucket логику.
- `lib/sailing/readiness-gap.ts` — distanceNm (балласт), classifyVesselByDwt.
- `lib/matching/pair-analyzer.ts` — партиционирование (куда добавить cap/bucket для балласт/размер).
- `lib/types.ts` — аддитивно если нужны поля.
- Тесты: lib/sailing/**tests**/match-scoring.test.ts, lib/**tests**/matching/

## Процесс (superpowers)

1. **SCOPE MATCH** — подтверди рычаги 3+4 + part-cargo-поправку одной строкой.
2. **writing-plans** — план (M tier). Reality-check: distanceNm/classifyVesselByDwt уже есть; util
   формула в broker-view скрипте есть как образец.
3. **test-driven-development** — тесты: дальний балласт мелкого судна → НЕ good; util 34% → НЕ good;
   part-cargo util 5% → остаётся (не зарезан); порог чувствительности.
4. **/test-skill** (risk-override — трогаешь scoring/matching, история регрессий).
5. **requesting-code-review** + **verification-before-completion**.
6. **finishing-a-development-branch** — PR в main (draft). НЕ мержить.

## Критерии приёмки

- broker-view re-run: ложные «good» #4 (util 34%), #6/#10 (1580nm) опускаются ниже good ИЛИ в корзину.
- Легитимные топ-матчи (#1 слябы 99%/205nm, #5 пшеница 75%/580nm) ОСТАЮТСЯ good.
- part-cargo с низким util НЕ зарезан жёстко.
- Число «good» сокращается (сейчас 61) до меньшего, более честного множества.
- Полный прогон зелёный + /test-skill PASS. Чужой флак progonq/score-classify — не наш регресс.

## Жёсткие ограничения

- НЕ менять ожидания тестов под имплементацию.
- Surgical: только балласт+размер cap/bucket. Без рефакторинга движка/корзин/экономики.
- part-cargo поправка ОБЯЗАТЕЛЬНА — иначе зарежем законные частичные грузы.
- Фаундер НЕ у терминала: неоднозначность → задокументируй допущение, продолжай.
- НЕ трогать worktree других волн (freight, merge-prs).
