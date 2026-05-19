# Quantika Demo — ROADMAP (Текущее состояние)

**Последний полный аудит:** 2026-05-17 (5-поточный код-аудит) + **2026-05-19 UI audit** через Playwright + Chrome MCP на проде demo.quantika.org
**Последнее обновление:** 2026-05-19 (match parser baseline R0→R2, 5 PRs + **UI audit added §1.0 findings**)
**Текущая версия:** prod HEAD после PR #240 (systemd quantika-demo.service на outreach-vps, NOT dev-vps)
**Статус:** ⚠️ В проде на demo.quantika.org — основные потоки работают, но **4 критических drift'а** найдены UI audit'ом 2026-05-19 (см. §1.0)

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

**🎯 Стратегия моделей (актуализация 2026-05-17 поздний вечер):** код миграции на Gemini уже сделан (Wave γ, 2026-05-05). На проде AI_PROVIDER=gemini + MATCH_PROVIDER=gemini → **7/7 scopes через Gemini default**. claude-cli остаётся для eval judge. Сейчас в отдельной user-сессии идёт bake-off конкретных Gemini моделей per parser. Подробности в §1.1.

**Что изменилось 19 мая (match parser baseline saga — 5 PRs):**

- ✅ **#235** eval harness — 11-scenario corpus + runner + judge для match parser (последний без eval)
- ✅ **#236** hard-filter cargoWeight — DWCC×1.05 reject, физически невозможные пары больше не идут в LLM
- ✅ **#237** readiness=unknown fix — port hints (Hereke→Marmara) + date object handling ({open,close,display})
- ✅ **#239** corpus calibration — R0 expected → R1 reality (3 → 5 no-match scenarios, S1/M2/W2 reclassified)
- ✅ **#240** port DB coverage +10.8pp — 40 aliases + 4 ports (Nemrut→Aliaga, Pivdennyi→Yuzhny etc.), broker corpus resolution 57.3%→68.1%
- ✅ **R0→R2 wins:** no-match hard-filter 0/2→5/5 PASS; W3 (5 mo late) score 47.8 possible → 34.8 weak; M1 top match 62.8 → 70.6 good (readiness ideal gap 2.33d); 0 hallucinations через 3 итерации
- 📋 **6/11 scenarios всё ещё readiness=unknown** — distance matrix gaps (Marmara↔Aliaga, Red Sea→Iskenderun, Ravenna→Izmail) — Phase B candidate
- 📋 **W1 (60-day idle)** всё ещё score 60.6 possible — idle penalty smell в match-scoring.ts — Phase B candidate

**Что изменилось 18 мая (parser audits wave + M1):**

- ✅ **15 PR merged** по парсерам: schema/prompt audits, eval harness recap, dedup для vessel hallucination, hotfix unknown_terms, surface 5 schema fields, UI display
- ✅ parse-vessel **dwcc 51.9%→94.9%, open_position 19.7%→92%, open_date 27.7%→91.1%** (был silent-null months из-за schema rename)
- ✅ parse-cargo cargo 91.8% / laycan 93.2% (GT normalization waves)
- ✅ parse-recap eval harness built, baseline 55.8% (noisy на 3 scenarios)
- ✅ /matches: M1 + M3 LIVE — MATCHES_ENABLED=true выставлен 2026-05-19, rebuild + systemctl restart
- ✅ 3 missing webhook routes добавлены в AUTH_BYPASS (PR #221) — после rebuild на правильном хосте outreach-vps работают
- 🟡 Discovered: prod = outreach-vps (NOT dev-vps); 14 PRs не были на проде до systemctl restart

**Что ещё блокирует pre-PMF:**

- ⏸ C3 — EU_SANCTIONS_TOKEN refresh (5 мин user)
- 📋 Match parser Phase B — port-master extensions + distance matrix + idle penalty calibration (R2 baseline ready, 6/11 residual readiness=unknown)
- 📋 Recap corpus expansion 3→30 (waiting real recap emails в Gmail)
- 📋 Classify urgency criteria (GT inconsistent, нужен annotator)
- 📋 UX polish (mobile bottom nav, /upgrade заглушка, EXPLAIN_DEAL flag fix)

**Следующие 7 дней:** webhook auth + parser quality + UX polish.
**Следующие 30 дней:** mobile-first feature pages + monitoring (Sentry/UptimeRobot).
**Следующие 90 дней:** PWA + Arabic RTL + Quote PDF + Stripe billing — путь к первым 10 платящим клиентам.

---

## 1. Статус по доменам

### 1.0 UI Audit Findings (2026-05-19)

**Метод:** Playwright headless × 24 страниц × 2 viewport (desktop 1920×1080 + mobile 375×667) на проде `https://demo.quantika.org`, login через DEMO_AUTH_PASSWORD из outreach-vps `.env.local`. Sсript: `/tmp/audit-quantika-demo.js` (см. `docs/superpowers/specs/2026-05-19-ui-audit-design.md`).

**Результат:** 48 entries — 40 🟢 / 6 🟡 / 2 🔴. Real picture после deep-dive более существенная — **4 критических env drift'а + auth model gap**.

#### 🚨 Critical drifts (ROADMAP/memory расходятся с prod env)

| #      | Claim (ROADMAP/memory)                            | Prod reality                                                                          | Impact                                                                                                                                                     |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | `AI_PROVIDER=gemini`, 7/7 scopes Gemini default   | `AI_PROVIDER=openai` на outreach-vps                                                  | LLM costs могут быть 5-15× выше; memory `project_quantika_demo_gemini_default_2026_05_17` потенциально wrong → нужно расследование (см. chip-task spawned) |
| **F2** | `MATCH_PROVIDER=gemini`                           | `MATCH_PROVIDER=bedrock`                                                              | /matches scoring идёт через AWS Bedrock; cost + reliability риск (memory: Bedrock Opus access lost 2026-05-17)                                             |
| **F3** | /matches M1+M3 LIVE (PR #227 + #234)              | ✅ **FIXED 2026-05-19** — MATCHES_ENABLED=true, rebuild + restart; HTTP 200           | Resolved                                                                                                                                                   |
| **F4** | 8 γ-flags LIVE (batch-1/2/3 activated 2026-05-17) | ✅ **FIXED 2026-05-19** — все 3 флага true, NEXT_PUBLIC pairs обновлены, rebuild done | Resolved                                                                                                                                                   |

#### 🟠 High — broken pages

| #      | Page                 | Symptom                                                                   | Hypothesis                                                                                                  |
| ------ | -------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **F5** | `/charterers/[id]`   | `Error: Failed to load charterer` + 401 console + 20s networkidle timeout | API requires `session_id` cookie, у demo user только `demo_auth` — нет fallback на demo data; см. chip-task |
| **F6** | `/charterers` (list) | 401 console error (page рендерится, но API call fails)                    | Same root cause as F5                                                                                       |
| **F7** | `/processing`        | 403 console error                                                         | Likely same auth model gap                                                                                  |

#### 📋 Medium — env vars missing

| #       | Setting                | Status                                                                    |
| ------- | ---------------------- | ------------------------------------------------------------------------- |
| **F8**  | `RESEND_API_KEY`       | Не в prod env → email alerts silent skip (ROADMAP это знает, ⏸ ждёт user) |
| **F9**  | `SENTRY_DSN`           | Не в prod env → Sentry wired (PR #209/#219) но inactive                   |
| **F10** | `EXPLAIN_DEAL_ENABLED` | Не в prod env → флаг OFF на проде                                         |

#### 🟡 Systemic — auth model surprise

**Без `session_id` cookie 18 из 24 authenticated страниц редиректят на `/`.** Только `/dashboard` (legacy alias на `/`), статичные страницы (`/login`, `/upgrade`, `/clauses`, `/onboarding`, `/admin/knowledge`), `/laytime`, `/market`, `/psc`, `/request` доступны для demo user'а с одним `demo_auth` cookie. Все остальное требует прохождения email-upload flow через `/processing` для создания `session_id`.

**Это не bug в UI** — это by-design business flow. Но Audit показал что demo user, который не сделал email upload, видит «empty app». Это может быть UX-bug: после login нужен явный CTA на `/processing` или auto-redirect.

#### Артефакты audit'а

- Spec: `docs/superpowers/specs/2026-05-19-ui-audit-design.md`
- Script: `/tmp/audit-quantika-demo.js` (24 pages × 2 viewports, parameterized via env vars)
- Screenshots: `/tmp/audit-screenshots-2026-05-19/*.png` (48 PNG)
- Report JSON: `/tmp/audit-screenshots-2026-05-19/report.json`
- Chip-tasks spawned: 3 (MATCHES_ENABLED+γ-flags activation; /charterers/[id] fix; AI_PROVIDER drift investigation)

### 1.1 Парсеры и LLM (audit-parsers.md)

**🎯 Реальный статус (2026-05-18 вечер):** Wave parser audits завершена — 11 PR за день (#197, #205, #216-218, #220-224, #226). Найден и исправлен production bug class: Gemini structured-output schema field names не совпадали с downstream contract в 2 парсерах (vessel + recap), silent-null months.

| Парсер       | Прод-провайдер     | Точность                                                                                          | Eval                                  | Статус                                                                                                          |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| classify     | gemini-flash       | **cat 100%**, urgency 70.8%                                                                       | progonq R9 ✅                         | R4 prompt active; urgency BLOCKED (GT inconsistent, см. memory)                                                 |
| parse-cargo  | gemini-pro         | cargo **91.8%**, laycan **93.2%** (PR #197+#205 GT normalization)                                 | progonq R27 ✅ 3-run median           | semantic_full 91.6%, стабилизировано                                                                            |
| parse-vessel | gemini-pro         | dwcc **94.9%** (было 62.8%), open_position **92%** (было 19.7%), open_date **91.1%** (было 27.7%) | progonq R1 ✅                         | PR #216 schema mismatch исправлен — было silent-null. semantic_full 8.9→19.6%                                   |
| parse-recap  | gemini-pro         | overall 45-58% (noisy на 3 scenarios)                                                             | progonq ✅ harness #218 + schema #220 | Corpus expansion blocked — public fixture recaps конфиденциальны, ждём real recap emails в Gmail                |
| match        | gemini (model TBD) | н/д                                                                                               | **нет baseline**                      | scope для следующей итерации после M1 (orchestrator session)                                                    |
| explain-deal | gemini-2.5-pro     | н/д (text-gen)                                                                                    | нет eval, дизайн готов                | parseSections regression-proof (PR #226). Eval harness design в `docs/plans/2026-05-18-text-gen-eval-design.md` |
| draft-quote  | gemini-2.5-pro     | н/д (text-gen)                                                                                    | нет eval                              | требует Phase 2 от text-gen eval плана                                                                          |

**Provider routing (текущий, на проде):** **7/7 scopes default через Gemini** (AI_PROVIDER=gemini + MATCH_PROVIDER=gemini). ClipProxy/OpenAI + claude-cli больше не активны по умолчанию (только если env override вернуть). claude-cli остаётся для eval judge (через --print, не runtime).

**Текущая работа:** bake-off конкретных Gemini моделей (Flash vs Pro vs 2.5 Pro vs новые) per parser идёт в отдельной user-сессии. Цель — выбрать оптимальную модель по cost/accuracy.

**Bake-off вердикты:** разблокированы (judge через claude-cli работает).

### 1.2 Data Layer (audit-data.md)

**31+ миграция применена.** **Большинство таблиц теперь заполнены** (значительный прогресс 2026-05-17):

| Статус                    | Таблицы                                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Свежие, заполненные    | ofac_entities (18,959), schema_migrations, knowledge_sources (15), **market_indices (90), charterers (20), port_da_estimates (94), psc_detention_history (16), port_distances (17,985 = реальный complete target), roi_metrics (18), fx_rates (200)** |
| ✅ RAG embedded           | **imsbc_fts (49), igc_fts (77), jwc_fts (8), bimco_fts (7)** — 141 chunks всего                                                                                                                                                                       |
| ⚠️ Частичные              | baltic/bunker/eua (устарели, manual CSV upload)                                                                                                                                                                                                       |
| ❌ НИКОГДА не seed-нулись | eu_sanctions (token expired), port_master, eca_zones, war_risk_zones                                                                                                                                                                                  |

**RAG-архитектура:** гибрид FTS5+vec0 (sqlite). Vertex Search disabled (extractiveContentSpec Enterprise-only, наши engines Standard) — rollback на SQLite богаче.

**Bug FIXED:** `bimco_vec` теперь в allowlist `retriever-sqlite.ts` (PR #186).

### 1.3 API Surface (audit-api.md)

**50 routes всего.** Coverage:

| Auth tier                  | Routes                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| public                     | health, knowledge clauses (флаг), market indices (флаг), TCE, vessel, canal, etc.                                                           |
| session (DEMO_AUTH cookie) | dashboard, match, /ai/_, audit, charterers, **/api/analytics/roi (γ-18)**, \*\*/api/laytime/_ (γ-05)**, **/api/knowledge/clauses (γ-09)\*\* |
| admin (X-Admin-Token)      | knowledge refresh, market upload-csv, knowledge-status                                                                                      |
| cron (X-Cron-Secret)       | cron-heartbeat                                                                                                                              |
| HMAC                       | whatsapp webhook, pipedrive webhook                                                                                                         |
| internal token             | whatsapp ingest                                                                                                                             |

**🚨 HIGH GAP сохраняется — 5 webhooks НЕ в `AUTH_BYPASS_PATHS`:**

- `/api/whatsapp/webhook` — Meta получает 302→/login, отключит endpoint
- `/api/whatsapp/ingest` — внутренний сервис ломается
- `/api/integrations/pipedrive/webhook` — Pipedrive перестанет слать events
- `/api/admin/knowledge/refresh` + `/api/admin/knowledge-status` — admin curl ломается

**Cron heartbeat coverage:** 5/5 скриптов теперь шлют (после PR #182 — localhost route bypasses CF header stripping).

**Тесты:** 17 routes без функциональных тестов (auth/logout, agent/\*, /economics, /vessel/[imo], etc.) — остаётся в backlog.

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

| Волна                                                                                              | Статус                                                                                                                    | Поставлено                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Pre-MVP** (Audit Foundation, Wave 2, Architecture)                                               | ✅                                                                                                                        | PR #1-#4, +268 тестов                                      |
| **MVP Wave 1-4** (Hard filters → ports 431)                                                        | ✅                                                                                                                        | v0.2 → v1.1 теги, 376 тестов                               |
| **Wave α** (15 спек Web/WhatsApp/Gmail)                                                            | ✅                                                                                                                        | PR #8, +301 тест, 700+ всего                               |
| **Wave β + βf×3** (depth + fixes, adversarial QA)                                                  | ✅                                                                                                                        | PR #46-#53, 1840 тестов, v1.4-eval-qa                      |
| **Wave γ — Vertex migration** (13 спек OpenAI→Gemini/Bedrock)                                      | ✅                                                                                                                        | PR #85 + #98                                               |
| **Wave γ — Knowledge L1+L2** (RAG hybrid + IMSBC/IGC/JWC/BIMCO + sanctions)                        | ✅                                                                                                                        | PR #92, #99, #102, #103                                    |
| **Wave γ — Scale** (11 спек: γ-01..18)                                                             | ✅                                                                                                                        | PR #127                                                    |
| **Wave γ — flag activation** (все 8 γ-флагов LIVE)                                                 | ✅                                                                                                                        | env edits 2026-05-17                                       |
| **Day batch 2026-05-17 morning** (incident restore + data + Bedrock→cli)                           | ✅                                                                                                                        | PR #172-#186 (12 PR)                                       |
| **Day batch 2026-05-17 evening (Plan A)** (tracking issues + parser baseline + flaky test + seeds) | ✅                                                                                                                        | PR #187-#194 (8 PR, из них 3 fix)                          |
| **Parse-cargo track** (R14 → R4 normalizer)                                                        | 🟡                                                                                                                        | R5 в работе (path exhausted — нужна GT нормализация ~4-6h) |
| **Wave γ original 13 спек**                                                                        | 1✅/0🟡/**8❌** (8 архивированы решением: ice-class, tone, counterparty-int, SignWell, Wise+Xero, audit PDF, Apple Watch) |
| **Wave δ** (Native iOS, SSO, white-label, APIs, team)                                              | 0/0/5 — **не начато** (правильно: post-PMF)                                                                               |

**ROADMAP vs delivered — Wave α delta:** 12✅ / 5🟡 / 0❌. 🟡 items: market live feed (manual CSV), digest content, 14-day billing backend, quote PDF pipeline, etc.

---

## 2. Критические проблемы (cross-domain, требующие срочности)

### 🚨 P0 — Блокируют другую работу

| #      | Issue                                                                 | Effort            | Блокирует                         | Статус            |
| ------ | --------------------------------------------------------------------- | ----------------- | --------------------------------- | ----------------- |
| **C1** | ~~Bedrock Opus 4.7 model access~~ → claude-cli replacement            | done              | ~~bake-off вердикты~~             | ✅ РЕШЕНО PR #186 |
| **C2** | 5 webhooks не в AUTH_BYPASS_PATHS — WhatsApp/Pipedrive silent failure | 1 PR, ~30 мин     | WhatsApp delivery, Pipedrive sync | ⏸ ждёт user       |
| **C3** | EU_SANCTIONS_TOKEN expired — sanctions sync падает с 05-16            | 5 мин (user only) | Sanctions screening live data     | ⏸ ждёт user       |

### 🟠 P1 — Активация data layer

**Полностью выполнено 2026-05-17.** Все таблицы заполнены (см. §1.2).

| #      | Task                                                | Статус                                     |
| ------ | --------------------------------------------------- | ------------------------------------------ |
| **D1** | port_distances seed (17,985 = real complete target) | ✅ DONE                                    |
| **D2** | market_indices (90 rows: BHSI/TMI/Drewry × 30d)     | ✅ DONE                                    |
| **D3** | charterers (20 blue-chip names)                     | ✅ DONE                                    |
| **D4** | port_master из `top-200-ports.json`                 | ⏸ deferred (не блокирует current features) |
| **D5** | port_da_estimates (94 rows)                         | ✅ DONE                                    |
| **D6** | psc_detention_history (16 rows)                     | ✅ DONE                                    |
| **D7** | RAG embeddings imsbc/igc/jwc/bimco (141 chunks)     | ✅ DONE                                    |
| **D8** | bimco_vec allowlist fix                             | ✅ DONE (PR #186)                          |

### 🟡 P2 — Активация γ флагов

**Полностью выполнено 2026-05-17.** Все 8 γ-флагов LIVE на проде.

| Флаг                       | Статус                                                                 | PR/commit              |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `SUBS_TIMER_V2` (γ-08)     | ✅ LIVE                                                                | batch-1                |
| `LAYTIME_ENGINE` (γ-05)    | ✅ LIVE                                                                | batch-1                |
| `BIMCO_RAG` (γ-09)         | ✅ LIVE                                                                | batch-1                |
| `CHARTERER_CREDIT` (γ-02)  | ✅ LIVE                                                                | batch-2                |
| `PSC_DETENTION` (γ-03)     | ✅ LIVE                                                                | batch-2                |
| `FUELEU` (γ-11)            | ✅ **LIVE** — re-activated 2026-05-19 (was DRIFT; env fixed + rebuild) |
| `ROI_GUARANTEE` (γ-18)     | ✅ LIVE                                                                | batch-3 (PR #187 seed) |
| `MULTI_CURRENCY_V2` (γ-01) | ✅ **LIVE** — re-activated 2026-05-19 (was DRIFT; env fixed + rebuild) |
| `SUBS_TIMER_V2` (γ-08)     | ✅ **LIVE** — re-activated 2026-05-19 (was DRIFT; env fixed + rebuild) |
| `MATCHES_ENABLED` (M1+M3)  | ✅ **LIVE** — activated 2026-05-19 (was NOT SET; env fixed + rebuild)  |

---

## 3. Приоритизированная Roadmap

### Следующие 7 дней (refreshed 2026-05-19 после UI audit)

**Тема:** «Закрыть env drifts от UI audit + поднять качество парсеров»

Большая часть старого 7-day списка закрыта PR'ами #194-#233 (см. PR history). Новый приоритет — drift'ы из §1.0:

1. ✓ **AUTO-DEPLOY LIVE 2026-05-19** — `.github/workflows/deploy.yml` LIVE в QD (#259 a1444f3) + AL (#200 a3a5b53). После merge `[code-only]` PR → GitHub Actions SSH'ится к outreach-vps → `/root/deploy.sh <service> <sha>` → install + build + restart + localhost health check + auto-rollback при fail. Auto-rollback prod-tested. Manual orchestrator `ssh + git pull + systemctl restart` теперь obsolete для code PRs.
2. ✓ **F3+F4 DONE 2026-05-19** — MATCHES_ENABLED + 3 γ-flags activated; rebuild + systemctl restart; /matches HTTP 200.
3. **F1+F2** — Расследовать AI_PROVIDER/MATCH_PROVIDER drift (prod = openai/bedrock vs ROADMAP claim Gemini). Chip-task spawned 2026-05-19. Решение либо update prod env, либо update memory `project_quantika_demo_gemini_default_2026_05_17` как wrong.
4. **F5+F6+F7** — Fix /charterers/[id], /charterers, /processing — auth model gap (session_id required for API but demo_auth user не имеет). Chip-task spawned 2026-05-19.
5. **C3** EU_SANCTIONS_TOKEN refresh (5 мин user) — token выставлен (`n00mo9i3`), но ROADMAP считал что expired — нужна проверка validity, не refresh.
6. **F8** Resend API key — user-only (после регистрации на resend.com).
7. **F9** Sentry DSN — user-only.
8. **F10** EXPLAIN_DEAL_ENABLED env activation (если фича готова).

ETA: ~1-2 дня wall-clock с user input на пп. 4-7. Пп. 1-3 — agent-only, можно через chip-spawn.

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
3. **Audit refresh:** раз в 30 дней — повтор 5-stream audit, regenerate sections 1.\*.
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
