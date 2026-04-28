# Quantika Build Roadmap — Wave Pipeline Decomposition

> **Baseline:** v1.3.4 main + 2-spec data cleanup (Wave α-0)
> **Stack:** Next.js 14 · TypeScript strict · Jest · Playwright · SQLite · ClipProxy
> **3 equal-tier channels:** WhatsApp bot · Web PWA · Gmail Chrome Extension
>
> **Прим.:** "Breakbulk pivot" (13-спек код-рефакторинг из плана `idempotent-seeking-quokka.md`)
> отменён по результату аудита 2026-04-28 — кодовая база уже cargo-type-agnostic
> (LLM-driven, COMPATIBILITY matrix data-driven). Bias только в sample data —
> закрывается двумя cleanup-спеками в Wave α-0 (см. ниже).

---

## Wave α — MVP (8–10 недель)

### Goals
1. Web PWA: complete broker workflow — parse → match → economics → draft quote → send
2. WhatsApp bot: primary triage channel (Forward Anything, morning digest, Deal ID)
3. Gmail Extension: compose augmentation (sidebar + ghost-text draft)
4. Full vessel passport (IACS + P&I + OpenSanctions + shadow fleet + Paris MoU)
5. Economics engine: bunker + EU ETS + JWC war risk + split bunkering optimizer
6. Market benchmark: Toepfer TMI monthly overlay in Draft Quote
7. Arabic RTL + MENA locale (Friday quiet hours, Ramadan, GST timezone)
8. 14-day trial + self-serve onboarding ("5 minutes to first quote")

### Acceptance Criteria
- Activation: broker creates 1 real deal + sends quote PDF within 7 days of signup
- WhatsApp: forward email → parse → 3 matches + draft quote < 30 seconds
- Web: inquiry → full draft quote with economics breakdown < 3 seconds
- Vessel passport: ≥8 of 10 checks functional (flag/class/P&I/sanctions/shadow/CII/PSC/age/IACS/IG)
- Economics: bunker + EU ETS + war risk in every Draft Quote
- 100% tests green, no regressions vs pivot baseline

### Integration Branch
`claude/wave-alpha`

### Платные источники (Wave α)
- WhatsApp Business Cloud API ($0.005/msg)
- Stormglass €19/mo — weather (опционально, для ETA корректировки)
- OilPriceAPI $45/mo → Ship & Bunker scrape free (стартуем бесплатно)
- Data Docked €80/mo — PSC detentions (Wave α, затем переход на Paris MoU XML)

### Specs (17 атомарных)

#### Wave 0 — Foundation (parallel × 3)

| ID | Spec | Files | Model | Timeout |
|----|------|-------|-------|---------|
| spec-01 | **types-and-interfaces** — добавить `ConfidenceLevel`, `AuditEntry`, `MarketBenchmark`, `EconomicsResult` в `lib/types.ts`; создать `lib/economics/types.ts`; добавить `MENA_TIMEZONES`, `CONFIDENCE_COLORS` в `lib/constants.ts` | M: `lib/types.ts`, `lib/constants.ts`; N: `lib/economics/types.ts` | sonnet | 25 min |
| spec-00a | **breakbulk-sample-data** — curate `lib/sample-data/cargo-inquiries.json` + `vessel-positions.json` + `fixture-recaps.json` + `client-replies.json` до 100% breakbulk (steel coils / timber / pipes / bagged cement / project cargo / heavy-lift / machinery); удалить bulk/container/tanker examples; убрать eval bias | M: `lib/sample-data/*.json` | sonnet | 25 min |
| spec-00b | **fix-dead-cargotype-tests** — найти и заменить ссылки на несуществующие enum values (`DRY_BULK` etc.) в test fixtures на валидные `BREAK_BULK` или `OTHER`; удалить dead-code branches в тестах | M: `**/__tests__/**/*.ts` | sonnet | 15 min |

Deps: none между ними — разные файловые деревья. Все α-1 спеки читают типы из spec-01.

**Прим.:** spec-00a и spec-00b — замена 13-спек breakbulk pivot. Code сам по себе уже polymorphic; пивот нужен только в test data + dead fixtures (см. audit 2026-04-28).

#### Wave 1 — Parallel Infrastructure (parallel × 4, dep: spec-01.merged)

| ID | Spec | Files | Model | Timeout |
|----|------|-------|-------|---------|
| spec-02 | **confidence-engine** — `lib/confidence.ts` (4-color logic: blue=verified/yellow=inferred/orange=uncertain→blocks Send/grey=missing); extend `lib/pipeline.ts` match output с `confidence` field | N: `lib/confidence.ts`, `lib/__tests__/confidence.test.ts`; M: `lib/pipeline.ts` | sonnet | 35 min |
| spec-03 | **audit-trail** — SQLite table `audit_events`; `lib/audit.ts` write/read helpers; `app/api/audit/route.ts`; audit UI компонент (readonly timeline) | N: `lib/audit.ts`, `app/api/audit/route.ts`, `components/audit-trail.tsx`; M: SQLite init | sonnet | 30 min |
| spec-04 | **whatsapp-infra** — WhatsApp Business Cloud API webhook handler `app/api/whatsapp/webhook/route.ts`; message router `lib/whatsapp/router.ts`; types `lib/whatsapp/types.ts`; mock harness для тестов (`WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` env required) | N: `lib/whatsapp/` (новый модуль), `app/api/whatsapp/webhook/route.ts` | sonnet | 40 min |
| spec-05 | **gmail-extension-base** — Chrome Manifest v3 scaffold: `extensions/gmail/manifest.json`, background script, content script, sidebar iframe entry; `build:extension` script в `package.json`; CI guard (`npm run build` не ломается без Chrome extension tooling) | N: `extensions/gmail/` (новый top-level dir), npm script `build:extension` | sonnet | 35 min |

Конфликты: нет — все спеки работают в разных файловых деревьях.

#### Wave 2 — Core Features (parallel × 4, dep: wave-1 merged)

| ID | Spec | Files | Model | Timeout |
|----|------|-------|-------|---------|
| spec-06 | **match-detail-tabs** — редизайн `app/match/[id]/page.tsx`: tabs Vessels/Economics/Passport/Quote; confidence border (4 цвета из spec-02); новые компоненты `components/match/{VesselsTab,EconomicsTab,PassportTab,QuoteTab}` | M: `app/match/[id]/page.tsx`; N: `components/match/` | sonnet | 45 min |
| spec-07 | **dashboard-morning-view** — редизайн главного дашборда: top priorities (🔴/⚠️/✅ traffic light), Live Market Intelligence в empty states, `components/dashboard/{MorningCard,TrafficLight}` | M: `app/page.tsx`; N: `components/dashboard/` | sonnet | 40 min |
| spec-08 | **economics-engine** — Ship&Bunker scraper (free daily), EU ETS calculator (EEX EUA price + BIMCO Allowance Clause 2022), JWC war risk premium, split bunkering optimizer; extend `lib/pipeline.ts` с economics enrichment step; `app/api/economics/route.ts` | N: `lib/economics/{bunker,ets,war-risk,split-bunker}.ts`, `app/api/economics/route.ts`; M: `lib/pipeline.ts` (different hunk from spec-02) | sonnet | 50 min |
| spec-09 | **whatsapp-onboarding-digest** — 3-min self-serve onboarding flow (region selector: MENA/Med/WAFR), morning digest 08:30 GST, Deal ID system (D-47), Friday quiet hours 13:00-15:00 GST, Ramadan schedule adjust; Arabic auto-detect | N: `lib/whatsapp/{digest,deal-id,scheduler,onboarding}.ts`; M: `lib/whatsapp/router.ts` | sonnet | 40 min |

Конфликты: spec-06 (`match/[id]`) vs spec-07 (`app/page.tsx`) — разные файлы ✅. spec-08 pipeline hunk ≠ spec-02 pipeline hunk (spec-02 уже merged) ✅.

#### Wave 3 — Distribution Features (parallel × 4, dep: wave-2 merged)

| ID | Spec | Files | Model | Timeout |
|----|------|-------|-------|---------|
| spec-10 | **whatsapp-forward-anything** — Forward email/PDF/screenshot/voice note → parse → structured card; Whisper API для voice via ClipProxy; dep: spec-09.merged (router.ts modification) | N: `lib/whatsapp/{forward-parser,voice-transcribe}.ts`, `app/api/whatsapp/ingest/route.ts`; M: `lib/whatsapp/router.ts` | opus | 60 min |
| spec-11 | **vessel-passport-upgrade** — OpenSanctions API (free, SQLite cache 24h TTL); IACS 8-member list; P&I IG 13-club list; shadow fleet red-flags (Equasis flag changes + STS transfers); Paris MoU white/grey/black scrape | M: `lib/counterparty.ts`; N: `lib/sanctions/{opensanctions,shadow-fleet}.ts` | sonnet | 45 min |
| spec-12 | **gmail-ghost-text-sidebar** — contextual sidebar (parsed cargo + top 3 matches + vessel passport); ghost-text Draft Quote (Tab=accept, Esc=dismiss, any key=silent dismiss); `app/api/extension/context/route.ts` | M: `extensions/gmail/content.ts`, `extensions/gmail/sidebar/index.tsx`; N: sidebar components, `app/api/extension/` | sonnet | 50 min |
| spec-13 | **source-attribution-rtl** — source attribution split view (left: Quantika parsed, right: original email highlighted); Arabic RTL auto-detect `lib/i18n/rtl-detect.ts`; RTL CSS; locale-aware layout; dep: spec-06.merged | M: `app/match/[id]/page.tsx` (split-view pane); N: `lib/i18n/rtl-detect.ts`, `components/match/SourceAttribution.tsx` | sonnet | 40 min |

#### Wave 4 — Benchmark & Onboarding (parallel × 2, dep: wave-3 merged)

| ID | Spec | Files | Model | Timeout |
|----|------|-------|-------|---------|
| spec-14 | **market-benchmark** — Toepfer TMI monthly scraper (heavyliftpfi.com); recorded fixture для тестов + graceful fallback; benchmark overlay в Draft Quote QuoteTab; cron-style monthly refresh | N: `lib/market/{toepfer-scraper,benchmark}.ts`; M: `components/match/QuoteTab.tsx` | sonnet | 35 min |
| spec-15 | **trial-onboarding** — 14-day trial flow (no credit card upfront); `app/onboarding/page.tsx`; demo data seeder (user picks region: MENA/Med/WAFR); "5 minutes to first quote" welcome screen; activation tracking; `lib/trial.ts` | N: `app/onboarding/`, `lib/trial.ts`, `lib/onboarding/demo-seed.ts`; M: `app/layout.tsx` (trial banner) | opus | 55 min |

### Wave α Verify Commands
```bash
npm run lint
npm test -- --silent
npm run build
# Wave 4 additionally:
npx playwright test --project=chromium
```

---

## Wave β — Depth (3 месяца, 10–50 users)

### Goals
1. Глубокая экономика рейса (voyage calculator + TCE + Suez vs Cape)
2. Proactive intelligence (Sanction Sentinel с maritime context, Subs Deadline Guardian)
3. Autonomous agentic workflows (Auto-Pre-Quote Engine, Plan-First Execute-Second)
4. Gmail compose enhancement (real-time quote scoring, one-click inserts)
5. Mobile PWA optimization (bottom sheets, swipe actions, haptics)
6. AIS integration (Datalastic €80/mo)
7. CRM bridge (Pipedrive)

### Integration Branch
`claude/wave-beta`

### Платные источники (Wave β)
- VesselFinder €330/10k credits **или** Datalastic €80/mo — AIS (НЕ MarineTraffic — enterprise после Kpler acquisition)
- Pipedrive — CRM bridge
- OilPriceAPI exit → Ship&Bunker scraper из Wave α

### Specs (15 атомарных)

#### Batch 0 — Foundation (parallel × 4, dep: Wave α merged)

| ID | Spec | Description |
|----|------|-------------|
| β-01 | **ais-adapter-datalastic** | Datalastic €80/mo AIS: vessel position polling, ETA, status feed; SQLite cache 15-min TTL; per-deal polling (не per-page) |
| β-02 | **pipedrive-crm-bridge** | Pipedrive OAuth, deal sync (create/update), contact upsert, webhook recv → Quantika notifications |
| β-03 | **port-da-database** | Port DA estimates: MENA + WAFR + Med top-30 портов; port dues/pilotage/tugs/stevedoring; LLM-enriched |
| β-04 | **canal-costs-db** | Suez/Panama/Kiel/Bosporus тарифы + formula engine; Suez SCNT calculator; war risk add; quarterly refresh |

#### Batch 1 — Economics Depth (parallel × 4, dep: batch-0)

| ID | Spec | Deps |
|----|------|------|
| β-05 | **voyage-calculator-tce** | β-03, β-04 merged |
| β-06 | **suez-vs-cape-decision** | β-04, β-05 merged |
| β-07 | **cii-rating-display** | β-01 merged |
| β-08 | **hold-cleanliness-l5c-matrix** | Wave α merged |

#### Batch 2 — Intelligence (parallel × 3, dep: batch-1)

| ID | Spec | Deps |
|----|------|------|
| β-09 | **sanction-sentinel-maritime** — proactive background scanner: active deals × OpenSanctions updates; context-aware alert с Deal ID | β-01, β-02 merged |
| β-10 | **subs-deadline-guardian** — 24h/8h/4h/2h escalation; всe 3 канала; "Draft extension request?" button | β-02 merged |
| β-11 | **plan-first-execute-second** — Plan-First UX: agent показывает план → 1 approve → autonomous execution | batch-1 merged |

#### Batch 3 — UX & Distribution (parallel × 4, dep: batch-2)

| ID | Spec | Deps |
|----|------|------|
| β-12 | **gmail-quote-scoring** — real-time 0-100 quality scorer в Gmail compose (Lavender pattern) | β-11 merged |
| β-13 | **gmail-one-click-inserts** — toolbar: Insert benchmark / passport / economics / BIMCO clauses | β-12 merged |
| β-14 | **mobile-bottom-sheets** — PWA: bottom sheets 60% overlay, swipe actions, haptics, FAB voice button | batch-2 merged |
| β-15 | **auto-prequote-engine** — ночной режим: parse+match+draft overnight; Plan-First gate утром; "While You Were Away" digest; Voice Fixture Memo (Whisper→NLP→PDF recap) | β-09, β-11 merged |

### Wave β Verify Commands
```bash
npm run lint && npm test -- --silent && npm run build
npx playwright test --project=chromium
```

---

## Wave γ — Scale (3 месяца, 50+ users)

### Goals
1. Post-fixture workflow (laytime calculator + SOF parser + demurrage/despatch)
2. Full market benchmark suite (Toepfer + Drewry + BHSI)
3. Financial integrations (Wise commission payouts, Xero invoicing, SignWell e-signature)
4. AI-driven personalization (tone-per-recipient, counterparty intelligence agent)
5. Compliance infrastructure (audit log PDF export, PSC detention history, FuelEU)
6. 90-day ROI guarantee fulfillment workflow

### Integration Branch
`claude/wave-gamma`

### Платные источники (Wave γ)
- SignWell $8/mo — e-signature (НЕ DocuSign $50)
- Wise Business API — commission payouts (верификация: начать в Wave β)
- Xero — commission invoicing

### Specs (18 атомарных)

#### Batch 0 — Foundation (parallel × 4, dep: Wave β merged)

| ID | Spec |
|----|------|
| γ-01 | **multi-currency-v2** — EUR/USD/GBP/NOK/AED; daily FX feed; F/D/D в любой валюте |
| γ-02 | **charterer-credit-tracker** — blue-chip/second/weak тиры; payment history; L/C flag для weak tier |
| γ-03 | **psc-detention-history** — Paris/Tokyo/USCG MoU детальная история; per-vessel drill-down |
| γ-04 | **market-benchmark-full** — Toepfer TMI + Drewry breakbulk + BHSI; unified `lib/market/benchmark-full.ts`; dashboard charts |

#### Batch 1 — Post-Fixture (sequential pipeline + parallel, dep: batch-0)

| ID | Spec | Deps |
|----|------|------|
| γ-05 | **laytime-calculator** — SHINC/SHEX/WWD/SSHEX/FHEX; allowed vs actual; reversible/non-reversible | γ-01 merged |
| γ-06 | **sof-parser** — SOF NLP → structured laytime events → feeds γ-05 | γ-05 merged |
| γ-07 | **demurrage-despatch** — full calculator; commission on D/D | γ-06 merged |
| γ-08 | **subs-timer-v2** — TZ-aware countdown, banking days, Pipedrive write-back (TZ-008 full) | γ-02 merged |
| γ-09 | **bimco-clause-library** — GENCON 2022, HEAVYCON, PROJECTCON; AI search + insert | batch-0 merged |
| γ-10 | **ice-class-filter** — 1A Super/1A/1B/1C; seasonal port restrictions | batch-0 merged |
| γ-11 | **fueleu-maritime** — FuelEU Well-to-Wake GHG calc (2025 compliance); penalty estimate | batch-0 merged |

#### Batch 2 — AI & Integrations (parallel × 4, dep: batch-1)

| ID | Spec | Deps |
|----|------|------|
| γ-12 | **tone-per-recipient** — Superhuman pattern: per-charterer tone learning; `lib/ai/tone-profile.ts` | γ-02 merged |
| γ-13 | **counterparty-intelligence** — background news monitoring (Reuters/TradeWinds); company mentions; active deal alerts | batch-1 merged |
| γ-14 | **signwell-esignature** — SignWell $8/mo API: CP signing flow, fixture confirmation PDF | batch-1 merged |
| γ-15 | **wise-xero-integration** — Wise commission payout + Xero invoice create/sync + Auto-Reply Scheduler | γ-01, γ-07 merged |

#### Batch 3 — Compliance & Product (parallel × 3, dep: batch-2)

| ID | Spec | Deps |
|----|------|------|
| γ-16 | **audit-log-pdf-export** — GDPR PDF: AI decisions, broker overrides, source attributions per deal | γ-14 merged |
| γ-17 | **apple-watch-complications** — deal alerts, subs countdown; WatchKit JS bridge; PWA widget fallback | batch-2 merged |
| γ-18 | **roi-guarantee-workflow** — 90-day ROI автоматика: deals closed, quote→fixture rate, bunker savings, sanction catches; fulfillment email | γ-16 merged |

### Wave γ Verify Commands
```bash
npm run lint && npm test -- --silent && npm run build
npx playwright test --project=chromium
```

---

## Wave δ — Enterprise (post-PMF)

### Goals
Team collaboration, white-label, enterprise API integrations, native iOS, voice agent, SSO.

### Prerequisites
- PMF confirmed: 50+ paying users, NPS >40, 90-day ROI guarantee triggered <5%
- Wave γ fully in production, stable
- Enterprise API partnership agreements signed (Veson/Kpler: NDA required)
- Wise Business verification complete

### Integration Branch
`claude/wave-delta`

### Платные источники (Wave δ)
- Veson/Kpler/MarineTraffic — enterprise API (партнёрский договор)
- Okta / Azure AD — SSO licensing

### Specs (9 атомарных)

#### Batch 0 (parallel × 2, dep: Wave γ merged)

| ID | Spec |
|----|------|
| δ-01 | **sso-okta-azuread** — SAML 2.0 / OIDC; org-level provisioning; individual → org session migration |
| δ-02 | **team-collaboration-core** — shared deal workspace; role-based access (owner/member/viewer); `lib/team/`; tenant-partitioned SQLite |

#### Batch 1 (parallel × 3, dep: batch-0)

| ID | Spec | Deps |
|----|------|------|
| δ-03 | **deal-thread-mentions** — @mentions; cross-channel notifications; activity feed | δ-02 merged |
| δ-04 | **native-ios-wrapper** — WKWebView + haptics + Siri shortcuts + Handoff; App Store submission | δ-01 merged |
| δ-05 | **white-label-tenant** — logo/domain/colors/email sender; subdomain routing | δ-01 merged |

#### Batch 2 (parallel × 4, dep: batch-1)

| ID | Spec | Deps |
|----|------|------|
| δ-06 | **veson-imos-bridge** — voyage import/export, fixture sync (NDA required before start) | δ-02 merged |
| δ-07 | **enterprise-ais-upgrade** — MarineTraffic enterprise или Kpler cargo flow (fleet view, vessel history) | δ-02 merged |
| δ-08 | **voice-agent** — "Hey Quantika, status of D-47": Whisper STT + tool-use routing + TTS; requires β-15 voice data ≥3 months old | δ-03 merged |
| δ-09 | **billing-seat-management** — per-seat Stripe billing, upgrade/downgrade, seat provisioning, usage metering | δ-01 merged |

### Wave δ Verify Commands
```bash
npm run lint && npm test -- --silent && npm run build
npx playwright test --project=chromium
```

---

## Dependencies Matrix

| Wave | Depends On | Gate |
|------|------------|------|
| Wave α | v1.3.4 main, 1048 tests green | code |
| Wave β | Wave α in production ≥2 weeks | code + usage |
| Wave γ | Wave β in production; Wise Business verification initiated | code + business |
| Wave δ | PMF confirmed (50+ users, NPS >40); Wave γ stable; enterprise partnerships signed | PMF + partnerships |

## Integration Branches Summary

| Wave | Branch | `plan_id` CLI flag |
|------|--------|-------------------|
| α | `claude/wave-alpha` | `wave-alpha` |
| β | `claude/wave-beta` | `wave-beta` |
| γ | `claude/wave-gamma` | `wave-gamma` |
| δ | `claude/wave-delta` | `wave-delta` |

## Отклонённые идеи (DO NOT ADD)

| Идея | Причина |
|------|---------|
| Concierge WOW session | Self-serve достаточно; founder time не ROI-positive |
| Graduated Trust Trajectory | Сложность без value |
| Broker Referral Network | Не sustainable channel |
| Seasonal Pause | Operational complexity без ROI |
| Free tier | Только 14-day trial; eternal free = no PMF signal |
| DocuSign $50/mo | SignWell $8/mo достаточно |
| MarineTraffic enterprise | Kpler acquisition → enterprise-only pricing |
| Kpler $50-150k/yr | Skip until enterprise tier |
| Clarksons SIN $15-40k/yr | Skip until post-PMF |
| Salesforce / CargoWise | Not our ICP |
| Hamburger menu | -50% feature adoption (NN/G research) |
| Native iOS в год 1 | $80k dev vs $20k PWA; ROI negative до 500 users |

---

*Документ сгенерирован: 2026-04-28*
*Источники: QUANTIKA-UX-VISION.md · quantika-architecture-audit-2026-04-24.md · quantika-architecture-plain-2026-04-24.md*
*Wave pipeline: `/Users/jarvis/claude/skills/wave-pipeline/SKILL.md`*
