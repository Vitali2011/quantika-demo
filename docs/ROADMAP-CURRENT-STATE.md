# Quantika Demo — ROADMAP (Текущее состояние)

**Последний полный аудит:** 2026-05-17 (5-поточный параллельный аудит)
**Последнее обновление:** 2026-05-17 вечер (после Plan A)
**Текущая версия:** v1.4.0-eval-qa, prod HEAD после PR #194
**Статус:** ✅ Стабильно в проде на demo.quantika.org

> **Живой документ.** Заменяет `ROADMAP-SESSION-PROMPT.md` (тот был разовый промпт-генератор, не state tracker).
> Источники отчётов: `/root/orchestrator-state/audit-2026-05-17/{parsers,data,api,ui,waves}.md`

---

## Краткая сводка

Quantika Demo прошла **Wave α → β → βf×3 → γ (Scale + Vertex + Knowledge Layer)** за апрель-май 2026. Стабильно в проде, 5570+ тестов зелёные, **17 PR слиты за день 2026-05-17** (12 утром + 5 вечером).

**Wave α MVP scope = 12 ✅ / 5 🟡 / 0 ❌.**

**Что изменилось за 2026-05-17:**
- ✅ Hot-restore env-incident (`.env.local` truncated, prod молча тлел 22h)
- ✅ Data layer полностью оживлён (RAG=141 chunks, market_indices=90, charterers=20, port_da=94, psc=16, distances=17985, roi_metrics=18, fx_rates=200)
- ✅ Все 8 γ-флагов активированы (γ-02/03/05/08/09/11/18/01)
- ✅ Bedrock Opus 4.7 заменён на claude-cli (наша Opus подписка) — экономим $15/$75 per 1M tokens
- ✅ Backup cron + inotify watchers + searoute systemd live
- ✅ 4 tracking issues #177-180 закрыты (#180 deferred как нерелевантный)
- ✅ parse-cargo GT нормализован (PR #197, 43 fixtures)

**🎯 Стратегия моделей (актуализация 2026-05-17 вечер):** код миграции на Gemini уже сделан (Wave γ, 2026-05-05). На проде AI_PROVIDER=gemini default — **6/7 scopes уже через Gemini**. Match — fallback на claude-cli (Bedrock не активен). Сейчас в отдельной user-сессии идёт bake-off конкретных Gemini моделей per parser. Подробности в §1.1.

**Что ещё блокирует pre-PMF:**
- ⏸ C2 — 5 webhooks auth bypass (нужен user)
- ⏸ C3 — EU_SANCTIONS_TOKEN refresh (5 мин user)
- 📋 Parser quality финализация (parse-cargo R5, parse-vessel dwcc 51.9%, parse-recap/match baselines)
- 📋 UX polish (mobile bottom nav, /upgrade /matches заглушки, EXPLAIN_DEAL flag fix)

**Следующие 7 дней:** webhook auth + parser quality + UX polish.
**Следующие 30 дней:** mobile-first feature pages + monitoring (Sentry/UptimeRobot).
**Следующие 90 дней:** PWA + Arabic RTL + Quote PDF + Stripe billing — путь к первым 10 платящим клиентам.

---

## 1. Статус по доменам

### 1.1 Парсеры и LLM (audit-parsers.md)

**🎯 Реальный статус (2026-05-17 вечер):** код миграции на Gemini был сделан в Wave γ (2026-05-05, `lib/ai-provider.ts` shim). После env-restore сегодня `AI_PROVIDER=gemini` стоит default → **6/7 scopes уже работают через Gemini на проде**. Идёт bake-off тестов конкретных моделей per parser (в отдельной user-сессии).

| Парсер | Прод-провайдер | Точность | Eval | Статус |
|---|---|---|---|---|
| classify | gemini-flash | 95.5% cat / 73.4% urgency | progonq R0 ✅ | R4 промпт готов, не активирован (с 04-20) |
| parse-cargo | gemini (model TBD) | оцен. 87%+ | baseline pending | R4 normalizer #175 слит, GT нормализован #197, bake-off in progress |
| parse-vessel | gemini (model TBD) | 76.0% mean, **dwcc 51.9%** | progonq ✅ | слабейшее поле — единицы измерения, bake-off in progress |
| parse-recap | gemini (model TBD) | **70.0%** (baseline 2026-05-17 PR #193) | progonq ✅ baseline only | bake-off in progress |
| match | claude-cli (наш Opus) | н/д | **нет baseline** | MATCH_PROVIDER=bedrock override, Bedrock не активен → fallback claude-cli (PR #186); Gemini migration возможна после bake-off |
| explain-deal | gemini (model TBD) | н/д | нет | фича live |
| draft-quote | gemini (model TBD) | н/д | нет | фича live |

**Provider routing (текущий, на проде):** 6/7 scopes default через Gemini (AI_PROVIDER=gemini). Match через MATCH_PROVIDER=bedrock но Bedrock не активирован → fallback на claude-cli. ClipProxy/OpenAI больше не активен по умолчанию (только если AI_PROVIDER=openai вернуть).

**Текущая работа:** bake-off конкретных Gemini моделей (Flash vs Pro vs 2.5 Pro vs новые) per parser идёт в отдельной user-сессии. Цель — выбрать оптимальную модель по cost/accuracy.

**Bake-off вердикты:** разблокированы (judge через claude-cli работает).

### 1.2 Data Layer (audit-data.md)

**31+ миграция применена.** **Большинство таблиц теперь заполнены** (значительный прогресс 2026-05-17):

| Статус | Таблицы |
|---|---|
| ✅ Свежие, заполненные | ofac_entities (18,959), schema_migrations, knowledge_sources (15), **market_indices (90), charterers (20), port_da_estimates (94), psc_detention_history (16), port_distances (17,985 = реальный complete target), roi_metrics (18), fx_rates (200)** |
| ✅ RAG embedded | **imsbc_fts (49), igc_fts (77), jwc_fts (8), bimco_fts (7)** — 141 chunks всего |
| ⚠️ Частичные | baltic/bunker/eua (устарели, manual CSV upload) |
| ❌ НИКОГДА не seed-нулись | eu_sanctions (token expired), port_master, eca_zones, war_risk_zones |

**RAG-архитектура:** гибрид FTS5+vec0 (sqlite). Vertex Search disabled (extractiveContentSpec Enterprise-only, наши engines Standard) — rollback на SQLite богаче.

**Bug FIXED:** `bimco_vec` теперь в allowlist `retriever-sqlite.ts` (PR #186).

### 1.3 API Surface (audit-api.md)

**50 routes всего.** Coverage:

| Auth tier | Routes |
|---|---|
| public | health, knowledge clauses (флаг), market indices (флаг), TCE, vessel, canal, etc. |
| session (DEMO_AUTH cookie) | dashboard, match, /ai/*, audit, charterers, **/api/analytics/roi (γ-18)**, **/api/laytime/* (γ-05)**, **/api/knowledge/clauses (γ-09)** |
| admin (X-Admin-Token) | knowledge refresh, market upload-csv, knowledge-status |
| cron (X-Cron-Secret) | cron-heartbeat |
| HMAC | whatsapp webhook, pipedrive webhook |
| internal token | whatsapp ingest |

**🚨 HIGH GAP сохраняется — 5 webhooks НЕ в `AUTH_BYPASS_PATHS`:**
- `/api/whatsapp/webhook` — Meta получает 302→/login, отключит endpoint
- `/api/whatsapp/ingest` — внутренний сервис ломается
- `/api/integrations/pipedrive/webhook` — Pipedrive перестанет слать events
- `/api/admin/knowledge/refresh` + `/api/admin/knowledge-status` — admin curl ломается

**Cron heartbeat coverage:** 5/5 скриптов теперь шлют (после PR #182 — localhost route bypasses CF header stripping).

**Тесты:** 17 routes без функциональных тестов (auth/logout, agent/*, /economics, /vessel/[imo], etc.) — остаётся в backlog.

**13 feature flags** в коде. **8 default ON** (γ-флаги активированы 2026-05-17). 5 остаются OFF.

### 1.4 UI/UX (audit-ui.md)

**23 страницы:** 14 production-ready, 7 feature-gated **(теперь все 7 unlocked через γ-флаги)**, 2 заглушки (`/upgrade`, `/matches`).

**70+ компонентов.** Покрытие тестами:
- Хорошо: match/, vessel/, dashboard/, mobile/, economics/, **market/ (PR #192)**
- ❌ Нет: charterers/, psc/, recap/, request/, ui/ (shadcn)

**Mobile scorecard:**
- ✅ BottomSheet + SwipeCard + FabVoice (haptics, focus trap, gestures)
- ⚠️ Feature-страницы (laytime, market, PSC) — desktop-first, нет `sm:` fallback
- ❌ Bottom navigation
- ❌ Touch target min-h-44px enforcement

**RTL:** только контент email (ExplainDealModal AR mode). Full UI RTL — нет (no i18n, no logical CSS properties).

**PWA: 0** — нет `public/manifest.json`, нет service worker, нет install prompt, нет theme-color.

**Баги (актуально):**
- `EXPLAIN_DEAL_ENABLED` — server-only env var без `NEXT_PUBLIC_` пары → UI кнопка рендерится, клик → 403 (НЕ исправлено)
- `SubsCountdownWidget` — нет live `setInterval`, countdown заморожен после mount (НЕ исправлено, виджет live через γ-08 но без auto-tick)

### 1.5 История волн (audit-waves.md)

| Волна | Статус | Поставлено |
|---|---|---|
| **Pre-MVP** (Audit Foundation, Wave 2, Architecture) | ✅ | PR #1-#4, +268 тестов |
| **MVP Wave 1-4** (Hard filters → ports 431) | ✅ | v0.2 → v1.1 теги, 376 тестов |
| **Wave α** (15 спек Web/WhatsApp/Gmail) | ✅ | PR #8, +301 тест, 700+ всего |
| **Wave β + βf×3** (depth + fixes, adversarial QA) | ✅ | PR #46-#53, 1840 тестов, v1.4-eval-qa |
| **Wave γ — Vertex migration** (13 спек OpenAI→Gemini/Bedrock) | ✅ | PR #85 + #98 |
| **Wave γ — Knowledge L1+L2** (RAG hybrid + IMSBC/IGC/JWC/BIMCO + sanctions) | ✅ | PR #92, #99, #102, #103 |
| **Wave γ — Scale** (11 спек: γ-01..18) | ✅ | PR #127 |
| **Wave γ — flag activation** (все 8 γ-флагов LIVE) | ✅ | env edits 2026-05-17 |
| **Day batch 2026-05-17 morning** (incident restore + data + Bedrock→cli) | ✅ | PR #172-#186 (12 PR) |
| **Day batch 2026-05-17 evening (Plan A)** (tracking issues + parser baseline + flaky test + seeds) | ✅ | PR #187-#194 (8 PR, из них 3 fix) |
| **Parse-cargo track** (R14 → R4 normalizer) | 🟡 | R5 в работе (path exhausted — нужна GT нормализация ~4-6h) |
| **Wave γ original 13 спек** | 1✅/0🟡/**8❌** (8 архивированы решением: ice-class, tone, counterparty-int, SignWell, Wise+Xero, audit PDF, Apple Watch) |
| **Wave δ** (Native iOS, SSO, white-label, APIs, team) | 0/0/5 — **не начато** (правильно: post-PMF) |

**ROADMAP vs delivered — Wave α delta:** 12✅ / 5🟡 / 0❌. 🟡 items: market live feed (manual CSV), digest content, 14-day billing backend, quote PDF pipeline, etc.

---

## 2. Критические проблемы (cross-domain, требующие срочности)

### 🚨 P0 — Блокируют другую работу

| # | Issue | Effort | Блокирует | Статус |
|---|---|---|---|---|
| **C1** | ~~Bedrock Opus 4.7 model access~~ → claude-cli replacement | done | ~~bake-off вердикты~~ | ✅ РЕШЕНО PR #186 |
| **C2** | 5 webhooks не в AUTH_BYPASS_PATHS — WhatsApp/Pipedrive silent failure | 1 PR, ~30 мин | WhatsApp delivery, Pipedrive sync | ⏸ ждёт user |
| **C3** | EU_SANCTIONS_TOKEN expired — sanctions sync падает с 05-16 | 5 мин (user only) | Sanctions screening live data | ⏸ ждёт user |

### 🟠 P1 — Активация data layer

**Полностью выполнено 2026-05-17.** Все таблицы заполнены (см. §1.2).

| # | Task | Статус |
|---|---|---|
| **D1** | port_distances seed (17,985 = real complete target) | ✅ DONE |
| **D2** | market_indices (90 rows: BHSI/TMI/Drewry × 30d) | ✅ DONE |
| **D3** | charterers (20 blue-chip names) | ✅ DONE |
| **D4** | port_master из `top-200-ports.json` | ⏸ deferred (не блокирует current features) |
| **D5** | port_da_estimates (94 rows) | ✅ DONE |
| **D6** | psc_detention_history (16 rows) | ✅ DONE |
| **D7** | RAG embeddings imsbc/igc/jwc/bimco (141 chunks) | ✅ DONE |
| **D8** | bimco_vec allowlist fix | ✅ DONE (PR #186) |

### 🟡 P2 — Активация γ флагов

**Полностью выполнено 2026-05-17.** Все 8 γ-флагов LIVE на проде.

| Флаг | Статус | PR/commit |
|---|---|---|
| `SUBS_TIMER_V2` (γ-08) | ✅ LIVE | batch-1 |
| `LAYTIME_ENGINE` (γ-05) | ✅ LIVE | batch-1 |
| `BIMCO_RAG` (γ-09) | ✅ LIVE | batch-1 |
| `CHARTERER_CREDIT` (γ-02) | ✅ LIVE | batch-2 |
| `PSC_DETENTION` (γ-03) | ✅ LIVE | batch-2 |
| `FUELEU` (γ-11) | ✅ LIVE | batch-2 |
| `ROI_GUARANTEE` (γ-18) | ✅ LIVE | batch-3 (PR #187 seed) |
| `MULTI_CURRENCY_V2` (γ-01) | ✅ LIVE | batch-3 (PR #188 seed) |

---

## 3. Приоритизированная Roadmap

### Следующие 7 дней

**Тема:** «Закрыть остатки от user + поднять качество парсеров»

1. **C2** webhook auth bypass PR (HIGH) — ждёт user
2. **C3** EU_SANCTIONS_TOKEN refresh (5 мин user) — ждёт user
3. **EXPLAIN_DEAL_ENABLED** NEXT_PUBLIC pair fix
4. **SubsCountdownWidget** live interval fix (1h)
5. **Resend API key** на VPS .env.local (после регистрации на resend.com) — иначе email alerts silent skip
6. **npm audit fix** для CRITICAL CVE sanitize-html + 3 HIGH в next/protobufjs/fast-uri

ETA: ~3-4 дня wall-clock. В основном waiting на user.

### Следующие 30 дней (остаток мая - середина июня)

**Тема:** «Parser quality + UX polish + monitoring»

1. **Parse-cargo R5** — финализация (path exhausted, нужна нормализация GT ~4-6h)
2. **parse-vessel dwcc fix** — единицы измерения bug (51.9% → ?)
3. **match progonq baseline** — давно пора
4. **parse-recap fix-loop** — улучшить с 70% baseline (PR #193 идентифицировал weakest fields)
5. **MEDIUM/LOW backlog** из QA reports (continuous)
6. **Mobile bottom nav + touch targets enforcement**
7. **Test coverage для 17 untested routes + missing component tests**
8. **/upgrade + /matches** — заменить заглушки на реальный контент
9. **Sentry + UptimeRobot** интеграция (когда аккаунты готовы)
10. **port_master seed** (D4 — отложен, может понадобиться для расширенных features)

### Следующие 90 дней (середина июня - середина августа)

**Тема:** «PWA + RTL полный + WhatsApp polish + первые платящие клиенты»

1. **PWA setup** — manifest.json, service worker, install prompt
2. **Arabic RTL** — full UI, не только контент email (logical CSS properties, i18n framework)
3. **Mobile-first overhaul** для feature pages (laytime, market, PSC)
4. **WhatsApp digest content** финализация
5. **Quote PDF pipeline** для activation metric
6. **Billing backend** — Stripe интеграция (когда сигналы первого платящего клиента)
7. **Counterparty Intelligence** lite (Brave News free, архивирована из γ но переоценить если клиенты просят)

### Post-PMF (Wave δ)

Не начинаем до того как:
- 10+ paying customers signed
- Activation metric (1 real deal in 7 days) consistently met
- Quote PDF + billing live

Затем:
- Native iOS wrapper
- SSO (Okta/Azure)
- White-label
- Public API (Veson/Kpler/MarineTraffic)
- Team collaboration

---

## 4. Принципы работы с документом

1. **Living document.** Каждое решение «делать X» сверяем с этим файлом. Если X = ✅ done — не предлагаем.
2. **Update cadence:** после каждого merged PR — обновляем relevant section (✅/🟡/❌, ETA, owner).
3. **Audit refresh:** раз в 30 дней — повтор 5-stream audit, regenerate sections 1.*.
4. **Старый ROADMAP-SESSION-PROMPT.md** = deprecated (был prompt для генерации wave_plan, не state). Не удалён для истории, но не используется.
5. **Источники отчётов:** `/root/orchestrator-state/audit-2026-05-17/*.md` на VPS — детали по каждому домену.

---

## 5. Quick Reference

**Prod URL:** https://demo.quantika.org (auth: DEMO_AUTH cookie)
**VPS:** dev-VPS root@157.173.124.116
**Path:** `/root/work/quantika-demo`
**PM2:** `quantika-demo` cluster
**DB:** `data/sessions.db` (legacy filename, содержит и sessions и knowledge tables)
**Backup:** ежедневно 00:00 UTC → `/var/backups/quantika/`
**Inotify:** `env-local-watcher.service` + auditd
**Cron heartbeat:** http://localhost:3000/api/admin/cron-heartbeat (CF strips X-Cron-Secret on external)
**Provider routing source:** `lib/ai-provider.ts` (claude-cli + openai + gemini + bedrock)
**Feature flags source:** `lib/knowledge/flags.ts` + grep `process.env.*_ENABLED`
**Wave plans:** `~/.claude/plans/idempotent-seeking-quokka.md` (breakbulk pivot), `.wave/wave_plan-beta-fixes.yaml`
**Runbooks:** `docs/runbooks/wave-gamma-flag-activation.md`
**Env backups:** `.env.local.before-*-YYYYMMDD-HHMM` (incident recovery)

---

🤖 Сгенерировано 5-stream system audit (parsers/data/api/ui/waves) + synthesis оркестратором + обновлено вечером 2026-05-17 после Plan A.
