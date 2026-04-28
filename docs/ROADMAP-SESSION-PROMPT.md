# PROMPT для новой сессии — Quantika Roadmap для Wave-Pipeline

**Скопируй всё ниже в новый чат Claude Code (`claude` в терминале или /clear → новая сессия)**

---

# Quantika Roadmap Session — старт

## Контекст (читай перед стартом)

Я фаундер **Quantika AI** (Berlin). Продукт: SaaS для морских брокеров в сегменте **breakbulk** (steel coils, timber, bagged cargo, project cargo, heavy-lift). Target: solo и mid-tier brokers в MENA/Med/WAFR/Asia.

**Текущий статус:**
- Версия v1.3.4 в production на https://demo.quantika.org
- 1,048 автоматических тестов green
- Идёт breakbulk pivot (отрезаем dry-bulk/containers/tankers)
- Архитектура и UX vision полностью спроектированы

**Цель этой сессии:** построить **wave-pipeline ROADMAP.md** который декомпозирует продукт на спеки для headless параллельного исполнения через `/Users/jarvis/claude/skills/wave-pipeline/SKILL.md`.

## Обязательно прочитай эти файлы (в этом порядке)

1. **Архитектура и UX (источники правды):**
   - `/Users/jarvis/work/quantika-demo/docs/QUANTIKA-PRODUCT-SPEC-FOR-PARTNER.md` — продукт-спека для партнёров (RU)
   - `/Users/jarvis/work/quantika-demo/docs/QUANTIKA-PRODUCT-SPEC-FOR-PARTNER-EN.md` — то же на английском
   - `/Users/jarvis/work/quantika-demo/docs/QUANTIKA-UX-VISION.md` — детальный UX vision со всеми решениями ⭐ САМЫЙ ВАЖНЫЙ

2. **План пивота (текущая работа):**
   - `/Users/jarvis/.claude/plans/idempotent-seeking-quokka.md` — breakbulk pivot wave-pipeline план (13 спек)
   - `/Users/jarvis/.claude/plans/breakbulk-pivot-scaffold/wave_plan.yaml` — пример рабочего wave_plan.yaml

3. **Архитектурные исследования:**
   - `/Users/jarvis/.claude/plans/quantika-architecture-audit-2026-04-24.md` — gap map + data sources strategy
   - `/Users/jarvis/.claude/plans/quantika-architecture-plain-2026-04-24.md` — plain-language architecture + broker audit
   - `/Users/jarvis/.claude/plans/quantika-architecture-visual-2026-04-24.md` — диаграммы + дашборды

4. **Wave-pipeline скилл:**
   - `/Users/jarvis/claude/skills/wave-pipeline/SKILL.md` — полная инструкция
   - `/Users/jarvis/claude/skills/wave-pipeline/wave_plan.example.yaml` — пример plan'а

## Зафиксированные решения (DO NOT REVISIT)

### Архитектура — 3 канала равноправны
1. **WhatsApp bot** (triage, 80% времени брокера)
2. **Web PWA** (deep work, утренний review)
3. **Gmail Chrome Extension** (compose augmentation)

Все три **equal-tier**. Не "primary + спутники".

### UX принципы
1. **Augment, не replace** Gmail/WhatsApp
2. **Source-first design** — каждая цифра кликабельна → видно источник
3. **Confidence как блокер** (не украшение)
4. **Mobile-first** (PWA сейчас, native iOS позже)
5. **Этический compass:** не оптимизируем DAU/time-in-app, а deals closed per week

### Wave α (MVP, 8-10 недель) — обязательное scope
- Web PWA: top priorities, match detail с tabs, source attribution split view, confidence blocker, audit trail, **Arabic RTL** ✓, Live Market Intelligence в empty states
- WhatsApp bot: onboarding, Forward Anything (email+voice+PDF), morning digest 08:30 GST, Deal ID system, MENA timezone + Friday quiet hours, **Arabic RTL**, **Voice input**
- Gmail extension: contextual sidebar + Ghost-text Draft Quote (Tab to accept)
- Onboarding: "5 minutes to first quote" guarantee, 14-day trial, demo data industry-specific, NO concierge — pure self-serve
- Activation metric: 1 real deal + sent quote PDF в первые 7 days

### Wave β (10-50 users, 3 мес)
- Real-time quote scoring (Lavender pattern)
- One-click structured inserts
- Mobile bottom sheets + swipe actions + haptics
- **Sanction Sentinel с Maritime Context** (proactive background)
- **Subs Deadline Guardian** (24h/8h/4h/2h escalation)
- **Plan-First Execute-Second** для multi-step agentic actions
- Cross-device handoff
- **Voice Fixture Memo** (post-close, Whisper + NLP)
- **Auto-Pre-Quote Engine** (ночной режим — game-changer)
- "While You Were Away" morning digest

### Wave γ (50+ users)
- Tone-per-recipient AI drafts (Superhuman pattern)
- Audit log PDF export для compliance
- Apple Watch complications
- Counterparty Intelligence Agent (news monitoring)
- Auto-Reply Scheduler (low-stakes templates only)
- Wise Business API (commission payouts)
- Xero integration (commission invoicing)
- DocuSign/SignWell (CP signing)
- 90-day ROI guarantee fulfillment workflow

### Wave δ (post-PMF, enterprise)
- Native iOS wrapper (haptics, Siri shortcuts, Handoff)
- Team collaboration
- White-label для broker houses
- API для Veson/Kpler/MarineTraffic
- SSO (Okta/Azure AD)

### Платные источники (после research двух волн)
- **OpenAI API** через ClipProxy (LLM, обязательно) — модели: GPT 5.5 heavy + GPT 5.4 light
- **WhatsApp Business Cloud API** ($0.005/msg) — обязательно
- **Stormglass €19/мес** — Wave α weather (потом self-host Open-Meteo)
- **Data Docked €80/мес** — Wave α PSC (потом частичный exit на Paris MoU XML + USCG PSIX free)
- **OilPriceAPI $45/мес** — Wave α bunker (потом USDA Socrata + scraping)
- **VesselFinder €330/10k credits ИЛИ Datalastic €80/мес** — Wave β AIS (НЕ MarineTraffic — стал enterprise после Kpler)
- **Pipedrive** — Wave β CRM bridge
- **SignWell $8/мес ИЛИ Docuseal (open source)** — Wave γ e-signature (НЕ DocuSign $50)
- **Wise Business API** — Wave γ commission payouts
- **Xero** — Wave γ accounting

### Отклонённые идеи (DO NOT add to roadmap)
- Concierge WOW session (Superhuman model) — self-serve достаточно
- Graduated Trust Trajectory (auto-approval growth) — лишняя сложность
- Broker Referral Network — не sustainable channel
- Seasonal Pause — operational complexity без ROI
- Native iOS в первый год
- Salesforce, CargoWise, Apple iCloud, MarineTraffic enterprise, Kpler, Lloyd's List/TradeWinds — slip
- Vечный Free tier (только 14-day trial)

## Что мне от тебя нужно в этой сессии

**Главный deliverable:** `ROADMAP.md` для wave-pipeline в `/Users/jarvis/work/quantika-demo/docs/ROADMAP-WAVES.md` (или другое логичное место).

### Структура ROADMAP

```markdown
# Quantika Build Roadmap — Wave Pipeline Decomposition

## Wave α — MVP (8-10 weeks)
### Goals
### Acceptance criteria
### Specs (10-15 atomic specs):
- spec-01-...
- spec-02-...
...

## Wave β — Depth (3 months)
...

## Wave γ — Scale (3 months)
...

## Wave δ — Enterprise (post-PMF)
...
```

Каждая spec должна быть:
- **Self-contained** для headless wave-pipeline execution
- **Testable** (verify_commands)
- **Atomic** (1 spec = 1 PR в integration branch)
- **TDD-ready** (тесты first)

### Дополнительно

1. **Опредeli integration_branch** для каждой волны (или одну общую)
2. **Расставь dependencies** между спеками (wave_plan.yaml depends_on)
3. **Reuse:** не переделывать то что уже есть в текущем breakbulk pivot. Pivot должен быть baseline.
4. **Conflict-free:** в одной волне специфики не должны трогать одни и те же файлы (для parallel execution)
5. **Verify commands** для каждой волны: `npm run lint && npm test && npm run build` минимум

### Процесс для тебя

1. Прочитай все 8 файлов в "Обязательно прочитай"
2. Войди в plan mode (EnterPlanMode) — это большой план
3. Запусти Explore-агентов на текущий codebase `/Users/jarvis/work/quantika-demo/` чтобы понять что уже сделано и где переиспользовать
4. Если есть вопросы по решениям — AskUserQuestion (но не пересматривай зафиксированные решения!)
5. Plan-агенты для design волн
6. Финальный ROADMAP-WAVES.md
7. Минимум один пример wave_plan.yaml для **первой волны** (чтобы я мог запустить `pipeline run` сразу)
8. ExitPlanMode для approval

### Критические constraints

- Repo: `/Users/jarvis/work/quantika-demo/` (NOT монорепо — отдельный repo)
- Stack: Next.js 14 + TS strict + Jest + Playwright + SQLite + ClipProxy
- Текущий baseline: 1,048 tests green, v1.3.4 on demo.quantika.org
- Active worktree: `/Users/jarvis/work/quantika-demo/.claude/worktrees/breakbulk-pivot/` (integration branch)
- Production deploy: SSH root@185.249.225.169 + PM2

### Стиль коммуникации

- Русский в чате/планах/файлах документации
- Английский в коде/commits/PR titles
- Прямой, опинионированный тон (как архитектор с 20-летним опытом)
- Не yes-man'ить — если решение пользователя плохое, указать на trade-off

---

**Готов? Начинай с чтения файлов из секции "Обязательно прочитай".**
