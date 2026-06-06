# FIX PROGRAM — план починки находок аудита (2026-06-05)

> Источник: docs/SYSTEM-AUDIT-0-SUMMARY.md (18 находок, 5 слоёв). Это ПРОГРАММНЫЙ план (волны+порядок+зависимости).
> Per-волна: детальный impl-план пишется Opus-планировщиком при dispatch (recon уже сделан 25 агентами).

## ПРИНЦИПЫ ПОРЯДКА

1. **Один surface — одна волна за раз.** Движок/экономику/seed трогают многие находки → параллель = конфликты. Параллелить только РАЗНЫЕ surface.
2. **#829 первым** (в работе). Он на economics/seed surface → волны 2/3/4 туда же. Мерж+прод-реген ДО них.
3. **Дёшево+демо-ломающее → раньше.** Тяжёлое продуктовое (деньги-в-скоринг, извлечение судна) → в конце, с brainstorm.
4. **Механика per волна:** superpowers (recon→Opus-план→Sonnet-exec+TDD); risk-override→/test-skill (реальные shapes); data-apply→Rule#22 (--dry); user-visible→Gate5.

---

## ВОЛНЫ

### W0 — #829 (В РАБОТЕ) — разблокировка economics surface

Мерж по зелёному CI → прод-реген (Rule#22) → Gate5. Watch: остаточный distance-вектор в EconomicsTab (#5). **Блокирует W2/W3/W4.**

### W1 — DEMO-UNBLOCK (P0) — параллельно с #829 (разные файлы, conflict-free)

| Под | Что                                                                                                                                                                      | Surface             | Tier                       | Заметки                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| 1a  | **Auth-bypass: +5 путей** в AUTH_BYPASS_PATHS (`/api/sample`,`/api/auth/google`,`/api/market/{eua-kpi,tmi,indices}`) + bypassPaths в `__tests__/middleware-auth.test.ts` | middleware.ts       | **M** (auth risk-override) | по `.claude/rules/admin-api.md`: путь+тест ОБА; проверить каждый сохранил свою auth |
| 1b  | **Кнопки-обманки** Send Quote/Counter/Save Draft                                                                                                                         | components/match/\* | S                          | РЕШЕНИЕ founder: disable+label «demo» ИЛИ wire (email-инфра — большой)              |

Surface: middleware + match-UI — НЕ пересекается с economics(#829). Параллель ок.

### W2 — QUICK-TRUST (после #829+rebase) — matching/parse surface

| Под | Что                                                                                                                   | Surface           | Tier                        | Заметки                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------- | -------------------------------------------------------- |
| 2a  | **Вес-диапазон → null при min≠max** (RANGE RULE постфактум)                                                           | parse-cargo-ai.ts | **M** (parser risk)         | /test-skill реальные shapes (null/число/диапазон/объект) |
| 2b  | **detectSpot объект-openDate** — нормализовать в строку до detectSpot, **3 места** (pair-analyzer/persist/regenerate) | sailing+matching  | **M** (cross-cutting sweep) | grep символ → починить ПАЧКОЙ; +seed-реген после         |
| 2c  | **frozen-clock UI-протечки** formatAge+PriceSourceBadge→useDemoNow                                                    | components        | S                           | UI, параллель-safe с 2a/2b                               |

2a/2b на одном движок-surface → последовательно. 2c отдельно (UI) → параллельно.

### W3 — BLACK SEA (цель ветки) — после rebase feat/bunker на main

| Под | Что                                                                                                                                      | Tier              | Заметки                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- |
| 3a  | **OilMonster адаптер** (смержить из worktree `claude/friendly-stonebraker-0d5d2e`) + bunker-cron расписание + graceful-фолбэк вместо 422 | M-L               | спека есть; brainstorm-light |
| 3b  | **Port-DA сиды** Istanbul/Constanta/Odesa/Novorossiysk                                                                                   | S (data, Rule#22) | --dry                        |
| 3c  | **camelCase порт-нормализация** → null-дистанция fix (24 порта)                                                                          | S                 | ключи searoute = human-имена |

### W4 — DEEP TRUST (L, brainstorm, последовательно, в конце)

| Под | Что                                                                                            | Tier            | Заметки                                            |
| --- | ---------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------- |
| 4a  | **Извлечение скорости/расхода судна** (78%/86% null) — улучшить промпт ИЛИ честный «est.»-флаг | M-L             | **brainstorm** (извлечь vs показать неуверенность) |
| 4b  | **Деньги-в-скоринг (C3)** — tceUsdPerDay в fit/score, убыток ранжируется низко                 | L (движок core) | **brainstorm** (вес/кап vs фактор)                 |

Оба трогают движок core → строго после стабилизации W0-W3.

### W5 — HYGIENE (batch, низкая срочность)

session 1ч-cliff · stored-not-recompute mitigation · market live-feed · CSV/PDF/Excel · LLM-creds prod-check · sweep-fallback пустой доски · orphan/starved таблицы+миграция 045+runbook(pm2→systemd) · карта #671 · Sentry #668 · empty-state #673 · error.tsx на 6 стр.

---

## ЗАВИСИМОСТИ (граф)

```
W0 (#829) ──┬──> W2 ──> W3 ──> W4
            │     (economics/seed/engine surface — последовательно)
W1 (P0) ────┘  (параллельно W0 — другой surface)
W5 ── в любой момент (hygiene, разные surface)
```

## ОТКРЫТЫЕ РЕШЕНИЯ FOUNDER

1. **Порядок старта:** W1(P0 demo) сейчас + добить #829 [рекоменд.] vs сразу W4(глубина).
2. **Кнопки 1b:** disable+label «demo» [рекоменд., быстро+честно] vs wire-for-real (email-инфра, большой scope) vs оставить.
3. **Ветка:** rebase feat/bunker на main [рекоменд.] vs новые ветки off main.

## RISK-OVERRIDE / DATA-APPLY карта

- Tier M + /test-skill: 1a(auth), 2a(parser), 2b(normalizer/engine), 3a(economics), 4a/4b(parser+engine).
- Rule#22 --dry + прод-реген: 3b(DA-сиды), W2/W4 (любой seed-реген после движок-фикса), #829.
- Gate5 (user-visible): 1a, 1b, 2c, 3*, 4*.
- Brainstorm: 1b(per-кнопка), 3a(light), 4a, 4b.
