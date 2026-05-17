# Quantika Demo — ROADMAP (Current State)

**Last full audit:** 2026-05-17 (5-stream parallel audit)
**Current version:** v1.4.0-eval-qa, prod HEAD `abc646d`
**Status:** ✅ Production-stable on demo.quantika.org

> **Living document.** Replaces `ROADMAP-SESSION-PROMPT.md` (which was a one-time generator prompt, not a state tracker).
> Source reports: `/root/orchestrator-state/audit-2026-05-17/{parsers,data,api,ui,waves}.md`

---

## Executive Summary

Quantika Demo прошла **Wave α → β → βf×3 → γ (Scale + Vertex + Knowledge Layer)** за апрель-май 2026. Production-stable, 1840+ tests green, 8 PRs merged за сегодня (2026-05-17). **Wave α MVP scope = 12 ✅ / 5 🟡 / 0 ❌.** Главные пробелы — НЕ в коде (большинство фичей реализованы), а в **данных и активации:** seed-скрипты не запущены (RAG corpus, market indices, port_master), Bedrock Opus 4.7 не активирован (блокирует все bake-off verdicts), 5 webhooks не в auth bypass (silent failure).

**Next 7 days:** активация data layer + Bedrock + γ-флагов по runbook'у.
**Next 30 days:** mobile UX hardening + WhatsApp/Pipedrive webhook fixes + parse-cargo R5 finalization.
**Next 90 days:** Wave δ kickoff (когда PMF подтверждён).

---

## 1. Domain Status

### 1.1 Parsers & LLM (audit-parsers.md)

| Parser | Provider | Accuracy | Eval | Status |
|---|---|---|---|---|
| classify | gemini-flash | 95.5% cat / 73.4% urgency | progonq R0 ✅ | R4 prompt готов, не активирован (с 04-20) |
| parse-cargo | openai gpt-5.5 | est. 87%+ | no baseline | R4 normalizer #175 merged, R5 ETA |
| parse-vessel | openai gpt-5.5 | 76.0% mean, **dwcc 51.9%** | progonq ✅ | weakest field — unit conversion |
| parse-recap | openai gpt-5.5 | **~70% overall** (static analysis, 3 corpus scenarios) | **baseline ✅ 2026-05-17** | weakest: despatch_rate 40%, ack_deadline 38%, laytime-wh 53%; schema/prompt mismatch = Gemini-path bug |
| match | bedrock-opus | n/a | **no baseline** | most expensive scope, no eval |
| explain-deal | openai | n/a | none | feature live |
| draft-quote | openai | n/a | none | feature live |

**Provider routing:** 5/7 scopes on OpenAI via ClipProxy (opaque cost). Bedrock Opus 4.7 = match endpoint. Gemini Flash = classify only.

**Critical gap:** AWS Bedrock Opus 4.7 model access not activated → all bake-off verdicts DEFERRED → cannot promote any model swap.

### 1.2 Data Layer (audit-data.md)

**31 migrations applied.** Большинство таблиц **EMPTY** — seeds не запускались:

| Status | Tables |
|---|---|
| ✅ Fresh | ofac_entities (18,959), schema_migrations (31), knowledge_sources (15) |
| ⚠️ Partial | port_distances **30%** (17,985 / 59,700 — interrupted), baltic/bunker/eua (stale, 1 date only) |
| ❌ NEVER seeded | eu_sanctions, port_master, market_indices, charterers, psc_detention_history, port_da_estimates, eca_zones, war_risk_zones |
| ❌ NEVER embedded (RAG) | imsbc_fts+vec, igc_fts+vec, jwc_fts+vec, bimco_fts+vec |

**RAG architecture:** hybrid FTS5+vec0 (sqlite) или Vertex AI Search. Backend dispatch live, но **chunks пустые** — embeddings никогда не запускались на VPS.

**Bug:** `bimco_vec` table exists (migration 029) но НЕ в allowlist `retriever-sqlite.ts` → BIMCO reachable только через Vertex backend.

### 1.3 API Surface (audit-api.md)

**50 routes total.** Coverage:

| Auth tier | Routes |
|---|---|
| public | health, knowledge clauses (flag), market indices (flag), TCE, vessel, canal, etc. |
| session (DEMO_AUTH cookie) | dashboard, match, /ai/*, audit, charterers |
| admin (X-Admin-Token) | knowledge refresh, market upload-csv, knowledge-status |
| cron (X-Cron-Secret) | cron-heartbeat |
| HMAC | whatsapp webhook, pipedrive webhook |
| internal token | whatsapp ingest |

**🚨 HIGH GAP — 5 webhooks НЕ в `AUTH_BYPASS_PATHS`:**
- `/api/whatsapp/webhook` — Meta получает 302→/login, отключит endpoint
- `/api/whatsapp/ingest` — internal service breaks
- `/api/integrations/pipedrive/webhook` — Pipedrive перестанет слать events
- `/api/admin/knowledge/refresh` + `/api/admin/knowledge-status` — admin curl breaks

**Cron heartbeat coverage:** 1/5 scripts шлёт (refresh-sanctions + backup). 4/5 silent fail: refresh-fx-rates, refresh-eua, refresh-bimco-rag, refresh-bunker.

**Tests:** 17 routes без functional tests (auth/logout, agent/*, /economics, /vessel/[imo], etc.)

**13 feature flags** в коде, **все default OFF.** Готовы к активации.

### 1.4 UI/UX (audit-ui.md)

**23 pages:** 14 production-ready, 7 feature-gated, 2 stubs (`/upgrade`, `/matches`).

**70+ components.** Покрытие тестами:
- Хорошо: match/, vessel/, dashboard/, mobile/, economics/
- ❌ Нет: charterers/, psc/, recap/, request/, market/MarketBenchmarkChart, ui/ (shadcn)

**Mobile scorecard:**
- ✅ BottomSheet + SwipeCard + FabVoice (haptics, focus trap, gestures)
- ⚠️ Feature pages (laytime, market, PSC) — desktop-first, no `sm:` fallback
- ❌ Bottom navigation
- ❌ Touch target min-h-44px enforcement

**RTL:** только email content (ExplainDealModal AR mode). Full UI RTL — нет (no i18n, no logical CSS properties).

**PWA: 0** — нет `public/manifest.json`, нет service worker, нет install prompt, нет theme-color.

**Bugs:**
- `EXPLAIN_DEAL_ENABLED` — server-only env var без `NEXT_PUBLIC_` pair → UI button renders, click → 403
- `SubsCountdownWidget` — нет live `setInterval`, countdown frozen после mount

### 1.5 Wave History (audit-waves.md)

| Wave | Status | Delivered |
|---|---|---|
| **Pre-MVP** (Audit Foundation, Wave 2, Architecture) | ✅ | PRs #1-#4, +268 tests |
| **MVP Wave 1-4** (Hard filters → ports 431) | ✅ | v0.2 → v1.1 tags, 376 tests |
| **Wave α** (15 specs Web/WhatsApp/Gmail) | ✅ | PR #8, +301 tests, 700+ total |
| **Wave β + βf×3** (depth + fixes, adversarial QA) | ✅ | PRs #46-#53, 1840 tests, v1.4-eval-qa |
| **Wave γ — Vertex migration** (13 specs OpenAI→Gemini/Bedrock) | ✅ | PR #85 + #98 |
| **Wave γ — Knowledge L1+L2** (RAG hybrid + IMSBC/IGC/JWC/BIMCO + sanctions) | ✅ | PRs #92, #99, #102, #103 |
| **Wave γ — Scale** (11 specs: γ-01..18) | ✅ | PR #127 |
| **Parse-cargo track** (R14 → R4 normalizer) | 🟡 | R5 pending |
| **Wave γ original 13 specs** | 1✅/0🟡/**8❌** (archived by decision: ice-class, tone, counterparty-int, SignWell, Wise+Xero, audit PDF, Apple Watch) |
| **Wave δ** (Native iOS, SSO, white-label, APIs, team) | 0/0/5 — **not started** (правильно: post-PMF) |

**ROADMAP vs delivered — Wave α delta:** 12✅ / 5🟡 / 0❌. 🟡 items: market live feed (manual CSV), digest content, 14-day billing backend, quote PDF pipeline, etc.

---

## 2. Critical Issues (cross-domain, requiring urgency)

### 🚨 P0 — Blocking other work

| # | Issue | Effort | Blocks |
|---|---|---|---|
| **C1** | Bedrock Opus 4.7 model access not activated in AWS Console | 5 мин (manual) | parse-cargo / parse-recap / parse-vessel bake-off verdicts |
| **C2** | 5 webhooks not in AUTH_BYPASS_PATHS — WhatsApp/Pipedrive silent failure | 1 PR, ~30 мин | WhatsApp delivery, Pipedrive sync |
| **C3** | EU_SANCTIONS_TOKEN expired — sanctions sync failing since 05-16 | 5 мин (user only) | Sanctions screening live data |

### 🟠 P1 — Data layer activation (cheap wins, huge impact)

| # | Task | ETA |
|---|---|---|
| **D1** | Resume port_distances seed (17,985 → 59,700 rows, +41,715 missing) | 2-3h bg |
| **D2** | Seed market_indices (synthetic 30d BHSI + TMI) | 5 мин |
| **D3** | Seed charterers (20 blue-chip names) | 5 мин |
| **D4** | Seed port_master from `top-200-ports.json` (write loader script) | 1-2h |
| **D5** | Seed port_da_estimates from `port-da-base.json` (39 records) | 5 мин |
| **D6** | Seed psc_detention_history (fixture) | 5 мин |
| **D7** | Run RAG embeddings: imsbc (~116), igc (~119), jwc (~7), bimco (~14) — required Vertex AI access | 30-60 мин per source |
| **D8** | Fix `bimco_vec` allowlist in `retriever-sqlite.ts` (BIMCO unreachable in sqlite) | 1 PR, 10 мин |

### 🟡 P2 — γ flag activation (runbook готов в [docs/runbooks/wave-gamma-flag-activation.md](docs/runbooks/wave-gamma-flag-activation.md))

| Flag | Risk | Prerequisite | Order |
|---|---|---|---|
| `SUBS_TIMER_V2` (γ-08) | low | — | 1st (verified PASS 88/88) |
| `LAYTIME_ENGINE` (γ-05) | low | — | 2nd (PASS 91/91) |
| `BIMCO_RAG` (γ-09) | low-med | run `seed-bimco-clauses.ts` + D8 fix | 3rd (PASS 58/58) |
| `PSC_DETENTION` (γ-03) | med | D6 seed | 4th |
| `MULTI_CURRENCY_V2` (γ-01) | low | — | 5th |
| `FUELEU` (γ-11) | low | — | 6th |
| `ROI_GUARANTEE` (γ-18) | low | — | 7th |
| `CHARTERER_CREDIT` (γ-02) | med | D3 seed | 8th |

---

## 3. Prioritized Roadmap

### Next 7 days (week of 2026-05-17)

**Theme:** «Включить то что уже построено» — данные + флаги + auth fixes.

1. **C2** webhook auth bypass PR (HIGH)
2. **D1-D6** seed scripts batch (data layer awakens) — 1 wave-pipeline session
3. **D7** RAG embeddings (4 sources) — 4 parallel scripts, ~2-3h total
4. **γ-08 + γ-05 + γ-09** flag activation per runbook
5. **EXPLAIN_DEAL_ENABLED** NEXT_PUBLIC pair fix
6. **SubsCountdownWidget** live interval fix (1h)
7. **C1** Bedrock activation (manual, you)
8. **C3** EU_SANCTIONS_TOKEN refresh (manual, you)

ETA: ~5-7 days wall-clock. Mostly autonomous.

### Next 30 days (рest of May - mid June)

**Theme:** «UX polish + dark spots в parsers + tracking issues»

1. **Parse-cargo R5** — finalize per parse-cargo track (deep accuracy work)
2. **parse-recap prompt fixes** — baseline ✅ 2026-05-17 (~70%); fix despatch_rate/ack_deadline/laytime-wh; see `scripts/baselines/parse-recap-baseline-2026-05-17.md`
3. **parse-vessel dwcc fix** — unit conversion bug (51.9% → ?)
4. **match progonq baseline** — long overdue
5. **Tracking issues** #177-180 (MarketIntelligence cards, war-risk crew, alerts email, check-deadlines)
6. **MEDIUM/LOW backlog** из QA reports (continuous)
7. **Mobile bottom nav + touch targets enforcement**
8. **Test coverage for 17 untested routes + missing component tests**
9. **/upgrade + /matches** — заменить stubs на real content
10. **Sentry + UptimeRobot** integration (when accounts ready)

### Next 90 days (mid-June - mid-August)

**Theme:** «PWA + RTL full + WhatsApp polish + first paying customers»

1. **PWA setup** — manifest.json, service worker, install prompt
2. **Arabic RTL** — full UI, not just email content (logical CSS properties, i18n framework)
3. **Mobile-first overhaul** для feature pages (laytime, market, PSC)
4. **WhatsApp digest content** finalization
5. **Quote PDF pipeline** for activation metric
6. **Billing backend** — Stripe integration (when first paying customer signals)
7. **Counterparty Intelligence** lite (Brave News free, archived from γ but reconsider if customers ask)

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

## 4. Operating Principles (как этот документ используется)

1. **Living document.** Каждое решение «делать X» сверяем с этим файлом. Если X = ✅ done — не предлагаем.
2. **Update cadence:** после каждого merged PR — update relevant section (✅/🟡/❌, ETA, owner).
3. **Audit refresh:** раз в 30 days — повтор 5-stream audit, regenerate sections 1.*.
4. **Old ROADMAP-SESSION-PROMPT.md** = deprecated (был prompt для генерации wave_plan, не state). Не удалён для history, но не используется.
5. **Source reports:** `/root/orchestrator-state/audit-2026-05-17/*.md` на VPS — детали по каждому домену.

---

## 5. Quick Reference

**Prod URL:** https://demo.quantika.org (auth: DEMO_AUTH cookie)
**VPS:** dev-VPS root@157.173.124.116
**Path:** `/root/work/quantika-demo`
**PM2:** `quantika-demo` cluster
**Backup:** daily 00:00 UTC → `/var/backups/quantika/`
**Inotify:** `env-local-watcher.service` + auditd
**Cron heartbeat:** http://localhost:3000/api/admin/cron-heartbeat (CF strips X-Cron-Secret on external)
**Provider routing source:** `lib/ai-provider.ts` + `.env.local.example`
**Feature flags source:** `lib/knowledge/flags.ts` + grep `process.env.*_ENABLED`
**Wave plans:** `~/.claude/plans/idempotent-seeking-quokka.md` (breakbulk pivot), `.wave/wave_plan-beta-fixes.yaml`
**Runbooks:** `docs/runbooks/wave-gamma-flag-activation.md`

---

🤖 Generated by 5-stream system audit (parsers/data/api/ui/waves) + synthesis by orchestrator.
