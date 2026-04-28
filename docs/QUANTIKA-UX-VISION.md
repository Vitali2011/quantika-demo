# Quantika — UX Vision Document

**От:** Виталий Борисенко, Quantika AI
**Дата:** 28 апреля 2026
**Статус:** v1.0 — для партнёров и команды
**Контекст:** дополняет [QUANTIKA-PRODUCT-SPEC-FOR-PARTNER.md](./QUANTIKA-PRODUCT-SPEC-FOR-PARTNER.md)

---

## Пользовательские решения, фиксированные в этой версии

1. ✅ **3 канала равноправны** — WhatsApp bot + Web PWA + Gmail Extension
2. ✅ **Arabic RTL — с Wave α** (первые клиенты в Saudi/UAE)
3. ✅ **Voice features — с Wave α/β** (диктовка, fixture memo)
4. ❌ **Native iOS — позже**, сначала PWA до 500+ users
5. ❌ **Hamburger menu** — никогда (NN/G: -50% feature adoption)

---

## 5 фундаментальных принципов UX

### 1. Quantika augment'ит, не заменяет
Брокер живёт в Gmail + WhatsApp. Мы НЕ делаем "новый email клиент". Мы — слой поверх его существующих инструментов. Sedna провалилась именно на этом — adoption rate низкий когда требуется migration.

### 2. Source-first design (Perplexity для maritime)
Каждая цифра кликабельна → видишь источник. Брокер должен **за 3 секунды** проверить любое поле. Это убирает страх "а вдруг AI ошибся" и формирует habit "я быстро проверяю → AI обычно прав → доверие растёт".

### 3. 3 канала, 3 роли — не один primary + спутники
| Канал | Роль | Когда брокер использует |
|---|---|---|
| **WhatsApp bot** | Triage + quick decisions | 80% времени, в машине, в обед |
| **Gmail Extension** | Compose augmentation | Когда пишет ответ — 30-60 раз/день |
| **Web PWA** | Deep work + analytics | Утренний overview + сложные сделки |

Все три **равноправны**, не "WhatsApp = упрощённая версия web". Каждый optimized под свой context. Конкуренты выбирают **один** primary канал и проигрывают там где он не подходит.

### 4. Confidence как блокер, не украшение
Если AI uncertain → блокируем "Send Quote", требуем подтверждения. Это не раздражает — это **снимает страх**. Брокер знает: система не пропустит критические gaps.

### 5. Mobile-first на equal footing
Не "responsive web". Конкретный mobile workflow: triage за 30 секунд, swipe actions, voice fixture memo, bottom sheets вместо modal'ов.

---

## Архитектура 3 каналов — конкретные flows

### 🟢 WhatsApp bot — главный point of entry

**Onboarding (3 минуты):**
```
Привет, Карим 👋 Я Quantika.
В каких регионах работаете?
[🌍 MENA] [🌊 Med] [🌍 WAFR] [Other]
↓
Основные порты? (через запятую)
↓
Готово! Перешли любое cargo inquiry — я разберу.
[🎯 Пример] [📨 Жду первое письмо]
```

**Утренний digest (08:30 GST, timezone-aware):**
```
🌅 Доброе утро, Карим. Пятница 25 апр:

🔴 СРОЧНО (1):
D-47 / wheat Novo→Jeddah — ответ до 14:00

⚠️ ATTENTION (2):
D-43 / counter-offer 2 days
D-51 / docs missing

✅ OK (3 deals)

📊 Market: BHSI 730 (+15) · VLSFO Rotterdam $651 (-$8)

[📋 Все] [D-47] [Ставки]
```

**Forward Anything (killer feature):**
Брокер пересылает в чат:
- Email с inquiry → bot парсит → структурированная карточка
- PDF charter party → bot extract'ит terms
- Скриншот WhatsApp от owner → bot transcribes
- Voice note ("Quote Cargill panamax 22000 per day") → bot создаёт draft

**Deal ID system (D-47):**
- Каждая сделка = короткий ID
- "D-47 status" в любой момент → instant card
- "Все сделки" → digest с 🔴/⚠️/✅ traffic light

**MENA-specific (Wave α):**
- **Arabic RTL** auto-detection по языку входящих
- **Friday quiet hours** 13:00-15:00 GST (пятничная молитва)
- Ramadan: укороченные digest'ы, не отправлять до Iftar
- Code-switching English+Arabic — bot understands оба

### 🔵 Gmail Chrome Extension — compose augmentation

**Ghost-text Draft Quote (Superhuman pattern):**
Брокер открывает inquiry → AI **уже** распарсил, **уже** нашёл vessel matches, **уже** написал draft. Видит ghost-текст серым в compose:
```
Dear Ahmed,

[Pleased to offer firm: MV ATLAS HANDY (IMO 9876543), Panama,
DNV class, Gard P&I. USD 31.50/MT FIOS, basis Toepfer TMI Apr 2026.
Full terms attached. — Press Tab to accept]
```
- **Tab** → принять весь draft
- **⌘→** → принимать слово за словом
- **Esc** → отклонить, начать с нуля
- **Любое нажатие клавиши** → тихо отклонить

**Contextual sidebar (Pipedrive pattern):**
Справа в Gmail — панель Quantika с:
- 📦 Parsed cargo (кликабельные поля → подсветка в email)
- 🚢 Top 3 vessel matches
- 🛡 Vessel passport (10 checks status dots)
- 💰 Economics breakdown
- 📊 Benchmark reference

**Real-time quote score (Lavender pattern):**
Пока брокер редактирует draft, scoring slider:
```
Quote Quality: 78/100 ⚠️
✅ Vessel passport included
✅ Laytime terms specified
⚠️ Validity date missing
❌ MOLOO not stated
[🔧 Auto-fix missing]
```

**One-click structured inserts:**
В compose toolbar:
- `[📊 Insert benchmark]` → Toepfer reference table
- `[🛡 Insert passport]` → vessel passport summary
- `[💰 Insert economics]` → cost breakdown
- `[✍️ Insert clauses]` → BIMCO standard clauses

### 🟠 Web PWA — deep work

**Главный morning view (mobile + desktop одинаковая структура):**
```
┌─────────────────────────────────────┐
│ Quantika    Fri 25 Apr      [avatar]│
├─────────────────────────────────────┤
│ Today: 3 new · ⏱ 2 expiring         │
│                                      │
│ ⚡ TOP PRIORITIES                    │
│ ┌─────────────────────────────────┐ │
│ │ 🔴 #1247 Steel Istanbul→Lagos  │ │
│ │ 4 matches · 0 red flags         │ │
│ │ 💡 Bunker save $14k             │ │
│ └─────────────────────────────────┘ │
│ 📊 Market: TMI $12,683 · VLSFO -$8  │
├─────────────────────────────────────┤
│ [Inbox] [Vessels] [Quotes] [Alerts] │
└─────────────────────────────────────┘
```

**Match Detail (mobile, bottom sheet):**
Tap карточку → bottom sheet 60% (карта/список остаётся виден):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   STICKY: MV ATLAS · DWT 12,500
   Match 94% · 0 red flags
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Vessels] [Economics] [Passport] [Quote]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swipe right → shortlist (haptic feedback)
Swipe left → reject
Long press → menu (sanctions / AIS / IMO)
```

**Voice Fixture Memo (Wave α):**
После closing — tap mic FAB → диктуешь 60 секунд:
> "Fixed Cargill, MV Atlantic Crown, panamax 75k, AG to China, $22500 per day, laycan May 12-16"

→ Whisper транскрибирует → NLP парсит → создаёт structured fixture + автоматический PDF recap.

---

## Trust UX — конкретно как делаем

### Source attribution на каждом поле
```
Cargo: Steel coils 7,500 MT  [¹]
                              ↑ click — split view:
                              left: parsed Quantika data
                              right: original email с подсветкой
```

### Confidence как 4-цветный border
| Цвет | Статус | Действие |
|---|---|---|
| 🔵 Синий | Verified | Из явного текста |
| 🟡 Жёлтый | Inferred | AI вывел из контекста |
| 🟠 Оранжевый | Uncertain | **Блокирует Send Quote** |
| ⚫ Серый | Missing | Поле не найдено |

Если 2+ полей в Uncertain → modal: "3 critical fields need confirmation".

### Hallucination prevention (cross-check)
- Vessel IMO → AIS check автоматически
- Port names → UN/LOCODE normalization
- Если vessel "scrapped" в БД, но AI suggest'ит → 🚨 warning blocks

### Audit trail per inquiry (compliance feature)
```
14:23  AI parsed 12 fields
14:31  You confirmed: weight, laycan, port
14:32  You overrode: vessel (MV X → MV Y)
       Reason: "Better slot availability"
14:35  Quote sent to charterer
[Revert to AI draft] [Export PDF audit log]
```

PDF audit log → можно показать compliance officer'у charterer'а.

---

## Onboarding trust — первые 5 минут

### Минута 0-30: Demo на знакомом примере
Реальное анонимизированное cargo inquiry → "Quantika уже распарсила за 8 секунд" → showing parsed fields + draft quote ready. Wow до signup.

### Минута 30-90: "Verify this" mode
Split view: original слева, parsed справа. Tooltip: "Click to see source". Пользователь сам убеждается: 10/12 правильно. 2 поля Uncertain — он подтверждает. **"I verified it myself"** moment.

### Минута 90-180: Honest limitations
```
What Quantika does NOT do:
• Does not send quotes without your approval
• Market data updates every 6h, not real-time
• May misparse handwritten attachments
Every AI suggestion requires your confirmation.
```

### Минута 3-5: Real first inquiry
Connect Gmail OAuth → парсим 1 inquiry из его inbox → проверяет на знакомом письме → moment of truth с собственными данными.

---

## 🚀 Killer features — для дифференциации

### 1. 30-Second Quote Pipeline
От inquiry до sent quote за 30 секунд (индустрия — 30-90 минут).
**Реализация:** WhatsApp forward → bot parses → matches + draft → broker tap "Send" → sent.

### 2. Forward Anything
Email, PDF, screenshot, voice note → структурированная сделка. Никто из конкурентов не делает это через мессенджер.

### 3. Sanction Sentinel с Maritime Context (proactive, background)
Generic checkers (World-Check, Dow Jones) дают сырые данные. Quantika знает **активные deals** → alert приходит с контекстом: "MT STELLAR WIND — new OFAC sanction. Это судно в твоём Deal #47, subs через 6 дней, counterparty Vitol. [Remove from deal]".
**Дифференциатор:** разница между data и intelligence.

### 4. Voice Fixture Memo
Брокер диктует 60 секунд → structured fixture + PDF recap. Заменяет 30 минут ручного entry в Excel.

### 5. Quote Quality Scoring (live в Gmail compose)
Slider score 0-100 в реальном времени → "Validity date missing", "MOLOO not stated". Auto-fix кнопка.

### 6. Auto-Pre-Quote Engine (ночной режим) 🔥 GAME-CHANGER
Inquiry приходит в 03:47 → AI **уже** парсит → **уже** ищет vessels → **уже** составляет draft → broker утром в 09:00 видит готовый Draft Quote, не сырой запрос.
**Дифференциатор:** "Пока конкуренты отвечают в 9 утра, твой Quote Engine уже подготовил draft в 3 ночи."
**Permission gates:** Parse + draft — autonomous. Send to charterer — всегда explicit broker approval.

### 7. Subs Deadline Guardian (escalation lestnitsey)
- 24h до deadline → reminder
- 8h → urgent push
- 4h → "Хочешь запросить extension? [Подготовить draft]"
- 2h → call/SMS если broker настроил
**Зачем:** Subs пропускают не от незнания — от информационного шума. Guardian вырезает critical из потока. Пропущенный sub = $50-300k ущерба.

### 8. Plan-First Execute-Second (Claude Code pattern)
Перед multi-step action агент показывает план: "Я собираюсь: (1) проверить sanction status, (2) запросить bunker quotes у 3 портов, (3) подготовить draft CP. Confirm?" → один tap → agent работает сам.
**Зачем:** Одно approval вместо 20 micro-approvals. Снижает friction, сохраняет контроль.

### 9. Live Market Intelligence в empty states
Когда у broker нет deals — вместо пустого экрана: "Рынок сегодня: MENA breakbulk avg $58-72/MT, 3 open cargoes by Jebel Ali. BDI -2.1%. New sanctions: 1 vessel."
**Зачем:** Превращает Quantika из workflow tool в **daily habit** даже в спокойные дни.

### 10. "First Quote in 5 Minutes" гарантия + 90-day ROI guarantee
Позиционирование: "Создай первый professional quote за 5 минут или вернём время".
Plus: "Если за 90 дней Quantika не помог закрыть хотя бы одну сделку — полный возврат денег".
**Зачем:** Maritime индустрия скептична к SaaS. Money-back снимает риск, сигналит уверенность. Решающий аргумент для solo broker с ACV $3k/год.

---

## ❌ Anti-patterns — что НЕ делаем

| НЕ делаем | Почему |
|---|---|
| Hamburger menu в production | -50% feature adoption (NN/G) |
| Replace Gmail | Sedna provel — adoption catastrophe |
| Spinner вместо skeleton | Spinner = "приложение сломано" под time pressure |
| Auto-send без review | Air Canada lawsuit |
| Generic "How can I help?" в WhatsApp | Не работает для B2B |
| 25-item меню в WhatsApp | Cognitive overload — 0 selections |
| Browse-first navigation | Дорого по cognitive load для solo broker |
| Native iOS app в первый год | $80k vs $20k PWA, ROI отрицательный до 500 users |

---

## 📅 Implementation priority по волнам

### Wave α (MVP, 8-10 недель)
**Web PWA:**
- Top priorities morning view
- Match Detail с tabs (Vessels / Economics / Passport / Quote)
- Source attribution split view
- Confidence как блокер
- Audit trail per inquiry
- **Arabic RTL support** ✓
- **Live Market Intelligence в empty states** ✓ (digest даже без deals)

**WhatsApp bot:**
- Onboarding flow (3 минуты, no concierge — pure self-serve)
- Forward Anything (email + voice + PDF + screenshots)
- Daily morning digest 08:30 GST
- Deal ID system (D-47)
- MENA timezone + Friday quiet hours + Ramadan adjust
- **Arabic RTL** ✓
- **Voice input** ✓ (Whisper API)

**Gmail extension MVP:**
- Contextual sidebar (parsed cargo + matches + passport)
- Ghost-text Draft Quote (Tab to accept)

**Onboarding:**
- "5 minutes to first quote" гарантия
- 14-day trial, no credit card upfront
- Demo data — industry-specific (MENA / Med / WAFR — выбирает user)
- **NO concierge** — pure self-serve from day 1
- Activation metric: 1 real deal + sent quote PDF в первые 7 days

### Wave β (10-50 users, 3 месяца)
- Real-time quote scoring (Lavender pattern)
- One-click structured inserts
- Mobile bottom sheets + swipe actions + haptics
- **Sanction Sentinel с Maritime Context** ✓ (proactive)
- **Subs Deadline Guardian** ✓ (escalation)
- **Plan-First Execute-Second** для multi-step agentic
- Cross-device handoff
- **Voice Fixture Memo** ✓ (post-close memo, Whisper + NLP)
- **Auto-Pre-Quote Engine** (ночной режим) ✓
- "While You Were Away" digest

### Wave γ (50+ users, 3 месяца)
- Tone-per-recipient AI drafts (Superhuman pattern)
- Audit log PDF export для compliance
- Apple Watch complications (deal alerts)
- Counterparty Intelligence Agent (news monitoring)
- Auto-Reply Scheduler (low-stakes templates)
- Wise Business API integration (commission payouts)
- Xero integration (commission invoicing)
- DocuSign / SignWell integration (CP signing)
- 90-day ROI guarantee fulfillment workflow

### Wave δ (post-PMF, enterprise)
- **Native iOS wrapper** (haptics, Siri shortcuts, Handoff)
- Team collaboration (shared deals, @mentions, role-based)
- White-label для broker houses
- API для Veson/Kpler/MarineTraffic
- Voice agent ("Hey Quantika, status of D-47")
- SSO (Okta / Azure AD)

---

## 🎯 Что Quantika должна украсть у конкурентов (top-5)

1. **Superhuman:** Ghost-text pre-draft + Tab to accept + tone-per-recipient
2. **Perplexity:** Citation-first architecture + inline source numbers
3. **Linear mobile:** Card-based triage + swipe actions
4. **Lavender:** Real-time quality scoring slider
5. **Claude Code:** Plan-First Execute-Second + tiered autonomy

---

## 🎯 Healthy Engagement Metrics — этический compass

Quantika — productivity tool, **не social media**. Helping broker spend **LESS time** на рутине = главный value prop.

### ❌ НЕ оптимизируем
- DAU/MAU ratio (B2B нормально 10-20%)
- Time spent in app
- Sessions per day
- Notification open rate

### ✅ Оптимизируем
- Time inquiry → quote (decreasing = value)
- Quotes sent per inquiry (efficiency)
- **Sanction catches per month** (avoided losses, real $)
- **Bunker savings reported** (avoided losses, real $)
- Fixture rate per quote (conversion quality)
- NPS / "would recommend"

### Этический тест для каждой фичи
1. Без этой функции broker теряет реальную бизнес-ценность?
2. Эта функция помогает закрыть сделку **быстрее**?
3. Пользователь скажет "спасибо" или "опять это"?

Если broker закрыл 3 deals за неделю при 20 минутах в день в app — это **win**, не defeat.

---

## 🚫 Dropped from scope (specific)

Эти идеи рассмотрены и **отклонены**:

| Идея | Причина |
|---|---|
| Concierge WOW session (Superhuman model) | Self-serve достаточно; founder time не ROI-positive |
| Graduated Trust Trajectory (auto-approval growth) | Сложность без value; user сам контролирует gates |
| Broker Referral Network | Не sustainable channel в нашем сегменте |
| Seasonal Pause | Operational complexity без ясного ROI |
| Native iOS app в первый год | $80k vs $20k PWA, ROI отрицательный до 500 users |

---

## 🔌 Integration corrections (важно для plan)

**AIS provider:** ❌ MarineTraffic / Spire (стали enterprise-only после Kpler acquisition)
→ ✅ **VesselFinder** (€330/10k credits) **или Datalastic** (€80/мес) — прозрачное pricing

**E-signature:** ❌ DocuSign $50/мес (дорого для startups)
→ ✅ **SignWell** ($8/мес) или **Docuseal** (open source)

---

## 🔑 Главный архитектурный bet

**Quantika UX строится на 3 равноправных каналах + единое source-first design language.**

```
┌────────────────────────────────────────┐
│   3 канала, 1 mind, 1 design language   │
│                                          │
│   WhatsApp bot ←→ Web PWA ←→ Gmail Ext  │
│         ↓             ↓           ↓      │
│   Triage         Deep work    Compose    │
│   (80% time)    (analytics)  (replies)   │
│                                          │
│   Все 3 — same data, same logic,         │
│   same trust UX                          │
└────────────────────────────────────────┘
```

Брокер выбирает по контексту:
- В машине → WhatsApp
- В офисе пишет ответ → Gmail extension inline
- Утром стратегический review → Web PWA

---

## Источники research (Wave 1)

Анализировано 80+ продуктов: Superhuman, Sedna, Kpler, Perplexity, Harvey, Linear, Lavender, Notion AI, Cursor, Tideform Atlas, Pipedrive Gmail, Bloomberg ASKB, Hebbia, Zerodha WhatsApp, Upstox WhatsApp, NotebookLM, GitHub Copilot, Mixmax, Streak, Calendly, Boomerang, Salesforce Mobile, IBKR Mobile, TradingView, MarineTraffic, VesselFinder, Veson IMOS, ShipNext, BunkerEx, и др.

Detail research отчёты: [previous internal docs]

---

**Конец документа.**
