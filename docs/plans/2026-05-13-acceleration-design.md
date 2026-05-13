# Quantika Demo — Acceleration to Prod-Ready (Design)

**Date:** 2026-05-13
**Status:** Approved (brainstorming complete)
**Next:** writing-plans → handover prompts
**Owner:** Vitali (orchestrator session)

---

## Цель

Довести `demo.quantika.org` до состояния «рабочее приложение, где все функции реально работают»:

- Все парсеры на Gemini дают стабильно ≥94/95
- Все 5 скрытых страниц включены и доступны через навигацию
- 0 битых ссылок и заглушек на основном флоу
- E2E (Playwright) suite покрывает core flow + 5 ранее скрытых страниц
- Финальная волна δ закрывает остатки

## Контекст

**Что уже сделано:**

- Wave γ (Vertex AI / Gemini migration) — 13/13 items merged
- Knowledge Layer Phase 1 + Phase 2 RAG — активны в проде
- Gmail-импорт (Private corpus + auth) — все 6 веток смерджены, 154 ETMS-письма
- Parse-cargo R15+R16 (multi-port + extract-all-offers) — код в main, но eval после Gemini drift (11→12 мая) не прогонялся
- Dashboard F-01..F-04, ETS auto-derive, JWC UNLOCODE, Port DA brackets — в проде

**Что блокирует prod-готовность:**

| Область       | Проблема                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Парсеры       | Реальный score parse-cargo после R15+R16 не измерен. Последняя цифра — 82/95 (R14, до фиксов). parse-vessel + classify вообще не имеют eval-корпусов |
| UI            | 5 страниц скрыты feature flags: `/laytime`, `/clauses`, `/market`, `/charterers/[id]`, `/vessels/[imo]/psc-history`                                  |
| UI            | Битая ссылка: `/upgrade` (404) в TrialBanner                                                                                                         |
| UI            | 2 dashboard widgets отключены: ROI Summary, Subs Countdown                                                                                           |
| Backend stubs | Equasis работает на хардкод-реестре; FuelEU использует `15 days` константу; crew war bonus не учитывается; email channel alerts = stub               |
| E2E           | Playwright-тесты не покрывают core flow, нет систематического browser walkthrough                                                                    |

## Принятые решения (брейнсторм)

| #   | Решение                                                                                         | Альтернативы                                          |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Все 5 скрытых страниц доводим до working state                                                  | Только core flow без второстепенных страниц           |
| 2   | Browser testing = manual walkthrough (Claude in Chrome) + Playwright E2E suite (растёт по ходу) | Только Playwright / только manual                     |
| 3   | **Подход B — 3 параллельных потока**                                                            | A: последовательно по темам / C: сначала полный аудит |
| 4   | Эта сессия = orchestrator-only (не исполняет, готовит handover-промпты + принимает приёмку)     | Эта сессия исполняет инкрементально                   |
| 5   | Финальная волна δ закрывает остатки после сходимости 3 потоков                                  | Без финальной волны, всё «по ходу»                    |

## Архитектура — 3 параллельных потока + волна δ

```
Сегодня ────────────────────────────────────────── Релиз
   │
   ├─ Поток 1: Парсеры (1-2 дня → 4-7 дней с parse-vessel/classify)
   │     ├─ 1.1 Прогнать parse-cargo eval R-current на VPS (4 прогона)
   │     ├─ 1.2 Decision gate: ≥94/95 закрыть / 90-93 раунд / <90 ретро
   │     ├─ 1.3 Pin Gemini version в lib/ai-provider.ts
   │     ├─ 1.4 Eval-корпус parse-vessel (2-3 спеки)
   │     ├─ 1.5 Eval-корпус classify (2-3 спеки)
   │     └─ 1.6 VPS eval parse-vessel + classify
   │
   ├─ Поток 2: Скрытые страницы + UX (1-2 недели)
   │     ├─ A Quick-win bundle: /laytime + /clauses + /market (XS+S+S)
   │     ├─ B Charterers listing + enable (S→M)
   │     ├─ C PSC fixture seed + enable (M)
   │     ├─ D UX cleanup: /upgrade, widgets, FuelEU hardcode (S)
   │     └─ E Backend completion (Equasis, crew war bonus, …) — решается после Потока 3
   │
   └─ Поток 3: E2E (постоянно)
         ├─ 3.1 Browser walkthrough через Claude in Chrome → docs/audits/browser-walkthrough-*.md
         ├─ 3.2 Триаж находок (severity, разнесение в Поток 1/2)
         └─ 3.3 Playwright suite растёт по мере зеленения Потока 2
                     │
                     ▼
              Финальная волна δ
            (всё что осталось — через wave-pipeline-deep)
```

**Зависимости:**

- Поток 1 не блокирует ничего
- Поток 2 не блокирует Поток 3 (walkthrough идёт по тому что есть сейчас)
- Поток 3 (этап 3.2 триаж) кормит обратно в Поток 1 и 2 новые задачи
- Волна δ запускается когда все 3 потока сошлись

## Детализация — Поток 1 (Парсеры)

**Definition of Done:** parse-cargo + parse-vessel + classify дают median ≥94/95 на 4 прогонах каждый, Gemini версия pinned.

| #   | Артефакт                                                            | Effort    | Исполнитель               |
| --- | ------------------------------------------------------------------- | --------- | ------------------------- |
| 1.1 | Прогнать parse-cargo eval R-current на VPS (4 прогона для variance) | 30 мин    | новая сессия через `/vps` |
| 1.2 | Decision gate (я в этой сессии)                                     | —         | —                         |
| 1.3 | Pin Gemini version в `lib/ai-provider.ts`                           | 1 спека   | `dev-pipeline-deep`       |
| 1.4 | Eval-корпус parse-vessel (по аналогии с parse-cargo)                | 2-3 спеки | `dev-pipeline-deep`       |
| 1.5 | Eval-корпус classify                                                | 2-3 спеки | `dev-pipeline-deep`       |
| 1.6 | VPS eval parse-vessel + classify                                    | 1 день    | `/vps`                    |

**Что НЕ делаем сейчас:** recap, draft-quote, draft-reply, Phase 2b matcher — это генеративные эндпоинты, проверим вручную в Потоке 3 walkthrough.

**Риск:** Gemini может ещё раз дрейфануть. Защита — pin version (1.3).

## Детализация — Поток 2 (Скрытые страницы + UX)

**Definition of Done:** 5/5 страниц рендерят данные, 0 битых ссылок, каждая страница достижима через nav/dashboard.

### Группа A — Quick wins (1 день)

**Handover-промпт «Quick-win bundle»** через `dev-pipeline-deep`:

- (a) флаги `LAYTIME_ENGINE_ENABLED`, `BIMCO_RAG_ENABLED`, `MARKET_BENCHMARK_FULL_ENABLED` ON на VPS
- (b) добавить `drewry-bb` блок в `scripts/knowledge/seeds/seed-market-indices.ts`
- (c) запустить `seed-bimco-clauses` + `seed-market-indices` на VPS
- (d) smoke `/laytime`, `/clauses`, `/market`

### Группа B — Charterers (1-2 дня)

**Handover-промпт «Charterers listing + enable»** через `dev-pipeline-deep`:

- (a) новая страница `app/charterers/page.tsx` со списком + поиском + ссылками на detail
- (b) link из dashboard или nav
- (c) флаг `CHARTERER_CREDIT_ENABLED` ON
- (d) `seed-charterers` на VPS (20 blue-chip)
- (e) smoke

### Группа C — PSC history (3-5 дней)

**Handover-промпт «PSC fixture seed + enable»** через `dev-pipeline-deep`:

- (a) создать `lib/knowledge/sources/psc/fixture.ts` с 15-20 записями (3-5 IMO × Paris/Tokyo MoU)
- (b) `scripts/seed-psc-history.ts`
- (c) link из `/vessel/[id]` на `/vessels/[imo]/psc-history`
- (d) флаг ON
- (e) seed на VPS
- (f) smoke

### Группа D — UX fixes (полдня)

**Handover-промпт «UX cleanup bundle»** через `dev-pipeline-deep`:

- (a) `/upgrade` 404 — построить минимальную страницу-плейсхолдер ИЛИ убрать кнопку (decision: Виталий выбирает на момент handover)
- (b) включить hidden dashboard widgets ROI Summary + Subs Countdown если backend готов
- (c) исправить EconomicsTab FuelEU hardcode `15 days` → derive from route distance

### Группа E — Backend completion (после Потока 3)

Кандидаты (решается по результатам walkthrough):

- Equasis stub → real scraper
- MarketIntelligence cards (BHSI / EUA / Bunker Rotterdam) если /market не покрывает
- Crew war bonus в war-risk calc
- Email channel alerts

**Порядок запуска:** A → (B и C параллельно) → D. E решается после Потока 3.2.

## Детализация — Поток 3 (E2E)

**Definition of Done:** 1× walkthrough report, все CRITICAL → fix-prompts в Потоке 2, Playwright suite покрывает 5 ранее скрытых страниц + core flow, E2E job в CI зелёный.

### 3.1 Browser walkthrough (день 1, новая сессия)

**Handover-промпт «Browser walkthrough demo.quantika.org»**:

- Доступ: креды из `.env.local`
- Инструмент: `mcp__Claude_in_Chrome__*` (DOM-aware)
- Чек-лист маршрутов (исчерпывающий):
  - `/login` → `/dashboard`
  - `/processing` → `/email/[id]` → `/cargo/[id]` → `/match/[id]`
  - `/match/[id]` → EconomicsTab, FuelEU, draft-quote, explain-deal, route map
  - `/vessel/[id]`, `/recap/[id]`, `/fixture/[id]`, `/commission`, `/summary`
  - 5 новых: `/laytime`, `/clauses`, `/market`, `/charterers`, `/vessels/[imo]/psc-history`
  - `/upgrade` — проверка что починено
- Отметки: ✅ работает / 🟡 с замечанием / 🔴 сломано / ⚪ заглушка
- Output: `docs/audits/browser-walkthrough-2026-05-13.md` — таблица `route | status | screenshot | notes | severity`

### 3.2 Триаж находок (я в этой сессии)

- Severity: CRITICAL (блокирует базовый флоу) → MAJOR (фича не работает) → MINOR (косметика)
- Разнесу по Потоку 1 (parser bug) или Потоку 2 (UI fix)
- Обновлю план + сегодняшний список handover-промптов

### 3.3 Playwright E2E suite (постоянно)

Серия **handover-промптов «Playwright test для [route]»** через `dev-pipeline-deep`. На каждую зелёную фичу — 1-2 теста:

- `login flow`
- `email → cargo → match happy path`
- `laytime calculator`
- `clauses search`
- `market charts render`
- `charterers profile`
- `psc history table`
- `match: economics + draft-quote + explain-deal`

Структура: `__tests__/e2e/playwright/<feature>.spec.ts`. Раннер уже настроен.
Запуск: `npm run test:e2e` + CI job.

## Финальная волна δ

После сходимости трёх потоков — одна финальная волна через `wave-pipeline-deep`:

1. Собрать оставшиеся issues в `docs/waves/ROADMAP-wave-delta.md`
2. `pipeline decompose --plan-id wave-delta`
3. После approval — `pipeline execute`
4. Finalize → verify → deploy

В неё попадают:

- CRITICAL/MAJOR не закрытые по ходу
- Группа E из Потока 2 (если Виталий решит делать)
- Регрессии найденные Playwright

## Роль оркестратора (эта сессия)

- Готовить handover-промпты — самодостаточные, с целью + командами + DoD + форматом отчёта
- Принимать отчёты исполнителей (новые сессии докладывают сюда)
- Обновлять live-статус в `docs/plans/2026-05-13-acceleration-status.md`
- Решать decision gates (eval-результаты, choice Виталия по deferred items)
- Триггерить следующие задачи по мере освобождения параллельных слотов
- Финализировать волну δ

В любой момент `«что сейчас в работе?»` → snapshot по 3 потокам.

## Timeline (грубо)

```
День 1     параллельно: 1.1 eval + 2.A quick-wins + 3.1 walkthrough
День 2-3   параллельно: 1.3 pin + 1.4 corpus + 2.B charterers + 2.D UX + 3.3 первые Playwright
День 4-7   параллельно: 1.5/1.6 eval parse-vessel/classify + 2.C PSC + 3.3 Playwright растёт
День 8+    последовательно: волна δ → финальный deploy → релиз
```

**Реалистичный диапазон:** 7-14 рабочих дней. Зависит от:

- сколько CRITICAL найдётся в walkthrough
- реального score parse-cargo (возможно ещё раунд)
- решения Виталия по deferred Группы E

## Артефакты на выходе

1. `docs/plans/2026-05-13-acceleration-design.md` — этот файл
2. `docs/plans/2026-05-13-acceleration-plan.md` — детальный implementation plan (writing-plans next)
3. `docs/plans/2026-05-13-acceleration-status.md` — live статус по потокам
4. `docs/audits/browser-walkthrough-2026-05-13.md` — отчёт walkthrough
5. `docs/waves/ROADMAP-wave-delta.md` — input для финальной волны
6. ≈12-15 handover-промптов (выдаются по мере необходимости)
7. Playwright suite `__tests__/e2e/playwright/*.spec.ts`
8. Финальный отчёт «всё готово к prod»

## Open Questions (для решения по ходу)

- Группа E backend completion — какие из stubs реально надо превратить в prod для релиза, а какие можно оставить? Решается после Потока 3.2.
- `/upgrade` страница — построить плейсхолдер или убрать кнопку? Решается на момент handover Группы D.
- Расширение BIMCO fixture (7 → 30-50 клауз) — для prod-демо желательно, но не блокер MVP.
