# Quantika — Продуктовое описание для партнёра

**Документ от:** Виталий Борисенко, Quantika AI
**Дата:** 24 апреля 2026
**Статус:** v1.0 — для обсуждения

---

## 1. Что это (одним предложением)

**Quantika — AI-ассистент, который заменяет 3-5 часов ежедневной рутины морского брокера на 15 минут работы.**

Читает его почту, распознаёт входящие запросы на груз или суда, проверяет каждое судно по 8 международным базам (санкции, класс, страховка, история задержаний), считает полную экономику рейса (топливо, пошлины, каналы, налоги), сравнивает с рыночным benchmark и выдаёт готовый к отправке ответ с обоснованием каждой цифры. Брокер только редактирует и нажимает Send.

---

## 2. Для кого

**Target user:** Solo- и mid-брокеры в сегменте breakbulk (штучные грузы — сталь, лес, мешки, проект-карго, оборудование).

**География:**
- MENA (Dubai, Istanbul, Riyadh, Cairo, Jeddah)
- Средиземноморье (Piraeus, Genoa, Marseille)
- Западная Африка (Lagos, Tema, Abidjan)
- Азия (Singapore, Mumbai)

**Профиль:**
- 1-15 брокеров в конторе (не tier-1 Clarksons/SSY)
- Зарабатывают $100k-$500k/год на комиссии 1.25-3.75% с фрахта
- Работают со Spot voyage charter (70-80% сделок) + иногда CoA
- **Не имеют доступа** к платным инструментам: Clarksons SIN ($30k/год), Kpler ($100k/год), RightShip (subscription)
- Живут в WhatsApp + Gmail, не в CRM/BI-дашбордах

**Размер рынка:** 5,000-10,000 брокеров такого профиля в мире. При $300/мес подписке это $18-36M ARR TAM.

---

## 3. Какую проблему решаем

### Что делает брокер за день

Шериф (8 лет опыта, Dubai) в типичный день:
1. 09:00 — открывает Gmail, там 30-50 писем за ночь. 2 часа — triage.
2. 11:00 — 4-5 интересных inquiries. По каждой 30-60 минут ручной работы:
   - Парсинг данных (тоннаж, DWT, laycan, cranes)
   - Поиск подходящего судна в своей сети
   - 15 минут ручной проверки в Equasis для каждого кандидата
   - Проверка санкций, PSC detentions, class society, P&I
   - Расчёт бункеровки в 3-5 портах (55-65% всех расходов рейса)
   - Учёт EU ETS (с 2026 = +€300/тонна топлива)
   - Сравнение с Toepfer TMI benchmark
   - Составление Draft Quote с обоснованием
3. 15:00 — подготовил 2-3 quote. Отправил.
4. Остаток дня — follow-ups, телефонные звонки, переписка.

**3-5 часов рутины каждый день.** Что-то обязательно забывает.

### Что происходит когда забыл

| Ошибка | Последствие | $ impact |
|---|---|---|
| Не проверил новую OFAC sanction | Сделка с санкционным судном → criminal liability | Лицензия + $1M+ fine |
| Пропустил detention в Equasis | Фиксанул vessel, detained в порту → claim | $50-200k demurrage |
| Забыл EU ETS в quote (intra-EU) | Owner получил счёт €150k после рейса | Потерял trust charterer'а |
| Не сравнил bunker в портах | Бункер $15k дороже чем мог | Owner/charterer upset |
| Пропустил L5C check | Steel coils после угля → cargo claim | $100-300k |
| Не поймал shadow fleet red flag | AIS gaps, смена флага 3x за 6 мес | Broker criminal liability |
| Quote без benchmark reference | Charterer давит "дорого" → теряет сделку | $5-30k комиссии |

**Даже один catch в год окупает Quantika на 10 лет вперёд.**

---

## 4. Как решаем — конкретный пример

Покажу ровно что делает Quantika. Реалистичный сценарий.

### Сценарий

**Дата:** Среда, 22 апреля 2026, 09:12 Dubai time.
**Брокер:** Шериф.
**Событие:** В 03:47 ночи в Gmail пришло письмо от charterer'а:

```
From: ahmed.ibrahim@dangote-trading.com
Subject: Cargo inquiry — Steel coils Istanbul to Lagos

Dear Sherif,

We have firm cargo for loading early May:

Cargo: 7,500 MT steel coils, HMS bundled
Load: Istanbul (Ambarli), Turkey
Discharge: Lagos (Apapa), Nigeria
Laycan: 10-15 May 2026
Heaviest piece: ~52 MT single coil
Stowage: 1.35 m³/mt
Commission: 1.25% + 3.75% ADCOM
Freight: please quote FIOS basis

Best,
Ahmed
```

Шериф ещё спит. Quantika уже работает.

---

### Что происходит за кулисами (пошагово)

#### ШАГ 1 — Inbox | 03:47:02

Quantika опрашивает Gmail через OAuth каждые 5 минут. Новое письмо → в очередь обработки.

#### ШАГ 2 — Classify | 03:47:04

LLM читает письмо и определяет: **`CARGO_INQUIRY`** (уверенность 0.96). Отправитель — Ahmed Ibrahim, Dangote Trading (известный в базе как blue-chip charterer, 12 сделок за 2 года, платит в 10-14 дней).

#### ШАГ 3 — Parse | 03:47:08

LLM извлекает структурированные данные с ссылками на исходный текст:

```
Origin:        Istanbul (Ambarli), Turkey
Destination:   Lagos (Apapa), Nigeria
Weight:        7,500 MT (confirmed)
Cargo type:    BREAK_BULK · steel coils HMS bundled
Heaviest piece: 52 MT single coil
Stowage:       1.35 m³/mt (explicit)
Laycan:        10–15 May 2026
Commission:    1.25% + 3.75% ADCOM
Incoterms:     FIOS
Charterer:     Dangote Trading (blue-chip, known)
```

Каждое поле Шериф сможет кликнуть и увидеть откуда взяли — защита от LLM-галлюцинаций.

#### ШАГ 4 — Knowledge lookup | 03:47:09

Quantika запрашивает свои справочники:

- **Порт Istanbul:** max draft 10.0 м, shore cranes до 50т, terminals для breakbulk доступны ✅
- **Порт Lagos:** max draft 9.5 м, limited shore cranes → нужно geared vessel, terminals breakbulk OK ✅
- **Charterer Dangote Trading:** blue-chip, -1.5% рейт-премиум, платит 10-14 дней
- **Incompatibility matrix для steel coils:** предыдущий груз угля → ЗАПРЕТ, зерно → warning, урея → OK

#### ШАГ 5 — Match | 03:47:10

Из пула Шерифа (45 судов в его vessel library) Quantika применяет жёсткие фильтры:

```
45 судов в библиотеке Шерифа
  ↓ DWT 10,000-20,000 (handy MPP)
22 судна
  ↓ geared (Lagos требует собственные краны)
19 судов
  ↓ draft ≤ 9.5 м (Lagos лимит)
15 судов
  ↓ open position April 25 – May 10
7 судов
  ↓ vessel type = MPP / General Cargo
7 судов
  ↓ combinable SWL ≥ 52т (heaviest piece)
5 судов
  ↓ bale capacity ≥ 10,400 м³ (7,500 × 1.35 × margin)
5 судов
  ↓ LLM scoring (proximity, timing, rate fit)
TOP 4 GOOD MATCHES
```

Шериф увидит 4 кандидата, отсортированных по match-level. Первый — **MV ATLAS HANDY**.

#### ШАГ 6 — Validate (vessel passport) | 03:47:14

Для MV ATLAS HANDY параллельно запрашиваются 5 внешних баз:

| Проверка | Источник | Результат |
|---|---|---|
| Flag | Equasis | Panama — **Paris MoU white list** ✅ |
| Class | Equasis | DNV (член IACS) ✅ |
| P&I | Owner P&I letter | Gard — International Group (90% tonnage) ✅ |
| Age | Equasis | 12 лет (modern tonnage, 2014 год постройки) ✅ |
| PSC detentions | Paris/Tokyo MoU scrape | 12 инспекций за 3 года, **0 detentions** ✅ |
| CII rating | IMO DCS | **B** (выше среднего) ✅ |
| OFAC sanctions | OpenSanctions API | clean ✅ |
| EU/UK sanctions | OpenSanctions API | clean ✅ |
| Shadow fleet | AIS + flag history | нет AIS gaps, стабильный flag ✅ |
| Owner | Equasis + OpenSanctions | Angelicoussis Group (blue-chip греческий) ✅ |

**Passport score: 94/100 — отличное судно, никаких красных флагов.**

#### ШАГ 7 — Economics | 03:47:16

Quantika считает полную экономику рейса:

```
МАРШРУТ
Istanbul → Suez canal → Gulf of Guinea → Lagos
Расстояние: 5,800 морских миль
Скорость: 12 узлов (экономичная)
Время в море: 20 дней
Время в портах: 8 дней (по 4 в каждом)
Всего: 28 дней
Расход топлива: 22 т/сутки в море + 3 т/сутки в порту
ИТОГО: 464 тонны VLSFO
```

**Бункеровка** (цены из Ship & Bunker за сегодня):

| Порт | VLSFO $/т | Итого 464 т |
|---|---|---|
| Istanbul (Tuzla) | $665 | $308,560 |
| **Algeciras (по пути)** | **$635** | **$294,640** |
| Las Palmas | $645 | $299,280 |

💡 **Рекомендация: split-бункеровка 200т Istanbul + 230т Algeciras = $296,320. Экономия $12k vs только Istanbul. Zero deviation — Algeciras на маршруте.**

**War risk (JWC Lloyd's):**
- Gulf of Guinea — HRA зона
- Премиум: 0.5% × стоимость судна ($8M) × 7 дней = $11,200
- K&R insurance: +$3,000
- Crew war bonus: +$2,000
- **Итого: ~$20k**
- **Важно:** Quantika вставит в quote BIMCO CONWARTIME 2025 clause → pass-through charterer'у

**EU ETS:** Turkey → Nigeria не intra-EU. **Экономия €135k** относительно EU-рейса той же дистанции (для сравнения).

**Port DA (disbursement accounts):**
- Istanbul: $28,000 (лоцман $4k, буксиры $6k, агент $4k, стивидоры $12k, сборы $2k)
- Lagos: $54,000 (включая $8k contingency за slow stevedoring — Lagos известен)

**Suez canal:** $98,000 (по SCNT) + $8,000 war risk = $106,000 laden handy.

**Итого все расходы:**

```
Бункер (split):            $296,320
Port DA Istanbul:           $28,000
Port DA Lagos:              $54,000
Suez canal:                $106,000
War risk (pass-through):    $20,000
Crew / прочее:              $20,000
─────────────────────────────────────
TOTAL VOYAGE COST:         $524,320
```

#### ШАГ 8 — Benchmark | 03:47:17

**Toepfer TMI April 2026:** $12,683/день TCE (baseline 12,500 DWT MPP).

Adjustments:
- Route Istanbul → WAFR (длинный маршрут): +3%
- DWT 12,500 совпадает с baseline: 0%
- Charterer blue-chip credit: -1.5%
- **Implied freight range: $30.80 – $32.10/mt FIOS**

**Last-done fixtures из нашей базы** (похожий маршрут последние 14 дней):
- 21-апр: Iskenderun → Lagos, 6,800т, $30.00/mt
- 18-апр: Istanbul → Tema, 5,500т, $33.50/mt (heavy-lift)
- 14-апр: Mersin → Abidjan, 8,200т, $29.25/mt

Вывод: **$31.50/mt попадает в верхний квартиль рынка — оправдано blue-chip charterer + Toepfer восходящий тренд.**

#### ШАГ 9 — Draft Quote готов | 03:47:18

Quantika формирует готовый ответ:

```
Subject: RE: Cargo inquiry — Steel coils Istanbul to Lagos

Dear Ahmed,

Pleased to offer firm, subject to following:

VESSEL: MV ATLAS HANDY (IMO 9876543)
        Flag: Panama · Class: DNV · P&I: Gard (IG Club)
        DWT 12,500 · Age 12y · CII rating B
        Owner: Angelicoussis Group

CARGO: 7,500 MT steel coils HMS 5% MOLOO, FIOS

ROUTE: Istanbul (Ambarli) → Lagos (Apapa) via Suez

LAYCAN: 10-15 May 2026

FREIGHT: USD 31.50/MT FIOS
         (basis Toepfer TMI Apr 2026 + route adjustment)

LAYTIME:
  Load 5,000 MT/WWD SHINC at Istanbul
  Disch 4,000 MT/WWD SHEX at Lagos
  NOR WIPON/WIFPON/WIBON · Turn time 6 hrs
  Demurrage USD 9,000/day PDPR
  Despatch USD 4,500/day (half-despatch)

WAR RISK: CONWARTIME 2025 — pass-through to charterer per BIMCO

COMMISSION: 1.25% + 3.75% ADCOM on F/D/D

Vessel passport and voyage economics attached.

Best regards,
Sherif
```

**Плюс 5 WOW-insights для Шерифа** (приватные, не идут в ответ charterer'у):

1. 💡 Split-бункеровка Istanbul+Algeciras — сообщи charterer'у, $3k economy для него, используй как negotiation leverage.
2. ⚠ L5C судна: steel, urea, wheat, clinker, steel. Урея во 2-й позиции. Если charterer потребует hospital clean — добавь +2 дня + $15k re-cleaning к quote.
3. 📊 Toepfer TMI +8% QoQ → upper-quartile $31.50 обсолютно оправдан, charterer не может давить.
4. 🛡 CONWARTIME 2025 — вставляется автоматически, но напомни charterer'у что премиум pass-through (он blue-chip, знает стандарт).
5. ✅ Heaviest piece 52т vs combinable SWL 80т = +54% margin. Никаких issues с кранами в Lagos.

**🚩 Red flags: 0**

---

### ШАГ 10 — Шериф открывает Gmail | 09:12

Dashboard Quantika показывает топ-priority карточку:

```
🟢 NEW   #1247  Steel coils 7,500mt  Istanbul → Lagos
         4 vessel matches · Draft Quote ready · 0 red flags
         💡 Bunker Algeciras saves $14k    [Review →]
```

Шериф кликает. Видит полную сводку: 10 проверок судна все ✅, вся экономика посчитана, benchmark аргументирован, Draft Quote готов. **Читает 90 секунд.**

Решает повысить до **$32.00/mt** (знает Dangote, заплатит). Редактирует одно поле. Нажимает **Send**.

**Итого работы Шерифа: 2 минуты.**

Без Quantika он бы потратил 90 минут.

---

## 5. Что Quantika поймала (чего Шериф мог не заметить)

В каждом рейсе 3-5 таких catch-ов. В этом — 6:

### Catch #1 — Split bunkering ($12k savings)
Без Quantika бункеровал бы только в Istanbul за $308k. Split через Algeciras = $296k. $12k экономии.

### Catch #2 — War risk pass-through ($20k)
Мог забыть CONWARTIME 2025 clause → owner absorbит $20k. Quantika вставила автоматически → charterer платит.

### Catch #3 — L5C warning ($15k contingency)
Урея во 2-й позиции L5C. Если charterer потом захочет hospital clean — $15k re-cleaning + 2 дня простоя. Quantika предупредила до firm.

### Catch #4 — Benchmark reference (защита рейта)
С Toepfer reference $31.50 объективно защищён. Без benchmark charterer мог продавить до $28 → потеря $26k freight → $330 комиссии Шерифа.

### Catch #5 — Vessel passport (15 мин → 1 сек)
Ручная проверка в Equasis = 15 минут. Плюс Шериф обычно **не смотрит** CII, IMO DCS, shadow fleet red flags, OpenSanctions — он их просто не знает или не имеет доступа. Quantika делает все 10 проверок за 1 секунду.

### Catch #6 — Sanction auto-refresh
OpenSanctions обновляется ежедневно. Если новая OFAC designation на Angelicoussis (гипотетически) — Quantika мгновенно алертит. Шериф сам проверяет раз в месяц.

**Суммарная ценность только в этой сделке: $47k+ avoided losses + защищённый $26k рейт + 88 минут времени.**

---

## 6. Остальные функции приложения

Пример выше — только одна сделка. Полный feature-set:

### A. До сделки (inbox + matching)
- **Классификация писем** — 8 категорий (cargo, vessel, recap, reply, etc.)
- **Парсинг с source-traceability** — каждая цифра кликабельна
- **Vessel matching** — hard filters (draft, cranes, SWL, volume, L5C) + LLM scoring
- **Vessel passport** — 10 проверок за 1 секунду
- **Cargo library** — накопленная база cargo types с stowage factors
- **Multi-vessel quote** — 3-4 варианта charterer'у на выбор

### B. В момент сделки (draft quote)
- **Bunker optimizer** — split bunkering, deviation economics, recommended ports
- **EU ETS calculator** — intra-EU leg detection, €250-310/т, BIMCO clause insertion
- **Port DA estimates** — для топ-30 портов MENA/WAFR/Med
- **Canal costs** — Suez, Panama, Kiel, Bosporus
- **War risk calculator** — JWC zones + premium + BIMCO CONWARTIME
- **Voyage calculator** — полная экономика + TCE
- **Suez vs Cape decision support** — две воронки для Asia→EU
- **Benchmark reference** — Toepfer TMI, BHSI, Drewry indices, last-done feed
- **Draft Quote composition** — с обоснованием каждой цифры

### C. После firm offer (negotiation tracking)
- **Subs timer** — countdown на sub-stem, sub-shippers, sub-charterers, sub-RightShip (24-72h каждый, пропуск = сделка развалилась)
- **Negotiation points tracker** — что AGREED, что PENDING, что DISAGREED
- **Change log** — кто что предложил, когда, с цитатами

### D. После рейса
- **SOF parser** — поминутный Statement of Facts → laytime calculation
- **Demurrage/despatch calculator** — с учётом WIPON/SHINC/SHEX/WWD
- **Commission invoice** — автоматический расчёт на F/D/D
- **Payment tracking** — когда charterer оплатил, tier update

### E. Непрерывно (market intel)
- **Daily feed** — Toepfer, bunker, EUA, sanctioned vessels update
- **Seasonal alerts** — "April: fertilizer peak Brazil → India"
- **Sanction alerts** — новые shadow fleet designations, OFAC updates
- **Charterer credit tracker** — blue-chip / second / weak с payment history
- **Vessel library growth** — каждое встреченное судно добавляется

### F. UX-каналы
- **Web dashboard** — утренний overview + deep review
- **WhatsApp bot** — forward inquiry → ответ за 30 сек (80% дневной работы)
- **Gmail extension** — inline Draft Quote прямо в compose window
- **Mobile PWA** — для работы в дороге

---

## 7. Как это работает технически (для не-технарей)

Приложение — многоэтапный конвейер. Письмо входит внизу, проходит через 10 слоёв обработки, выходит наверху как Draft Quote:

```
┌────────────────────────────────────────────┐
│  10. Post-fixture (subs, SOF, commission)  │ ← После рейса
├────────────────────────────────────────────┤
│  9. Draft Quote (composition + WOW)        │ ← Готовый ответ
├────────────────────────────────────────────┤
│  8. Benchmark (Toepfer, BHSI, last-done)   │ ← Рыночный reference
├────────────────────────────────────────────┤
│  7. Economics (bunker, ETS, DA, canal)     │ ← Полная экономика рейса
├────────────────────────────────────────────┤
│  6. Match (hard filters + LLM scoring)     │ ← Кто подходит физически
├────────────────────────────────────────────┤
│  5. Validate (Equasis, sanctions, MoU)     │ ← Можно ли доверять судну
├────────────────────────────────────────────┤
│  4. Knowledge (наши БД — ports, charterers)│ ← Справочные данные
├────────────────────────────────────────────┤
│  3. Parse (LLM извлекает структуру)        │
├────────────────────────────────────────────┤
│  2. Classify (LLM определяет тип)          │
├────────────────────────────────────────────┤
│  1. Inbox (Gmail OAuth)                    │ ← Письмо входит
└────────────────────────────────────────────┘
```

Каждый слой делает одну вещь хорошо и передаёт дальше.

### Источники данных

**Бесплатные (обязательные):**
- **Ship & Bunker** — цены топлива в портах ежедневно
- **Equasis** — официальный реестр судов (flag, class, age, detentions)
- **OpenSanctions** — объединённая база OFAC/EU/UK sanctions
- **Paris MoU / Tokyo MoU** — портовые инспекции
- **IMO DCS** — углеродный рейтинг CII
- **EEX** — цена углеродных credits для EU ETS
- **JWC Lloyd's** — зоны military risk (пираты, войны)
- **Toepfer** — главный benchmark для MPP
- **Drewry** — breakbulk indices

**Платные (добавляем при подтверждённом product-market fit):**
- RightShip (vetting subscription)
- MarineTraffic Premium (AIS + shadow fleet detection)
- StormGeo (weather routing)
- Clarksons SIN — **не планируем** ($15-40k/год не нужно для наших users)

**Наши собственные (растут со временем):**
- Vessel library — каждое встреченное судно
- Charterer journal — tier-ы, payment history
- Port DA database — для топ-30 портов региона
- Fixture log — собственный "last-done" feed
- Clause library — из парсенных recaps

---

## 8. Revenue model

**Pricing tiers:**

| Tier | Цена | Для кого | Что включено |
|---|---|---|---|
| Free | $0 | Trial | Inbox triage, 3 matches/день cap |
| **Solo** | **$300/мес** | **Target tier** | Unlimited matches, full vessel passport, economics, benchmark, WhatsApp bot |
| Team | $1,500-3,000/мес | 5-10 брокеров в конторе | Multi-user, shared vessel library, compliance pack |
| Enterprise | Custom | Broker houses, trade associations | API access, white-label |

**Финансовая проекция:**

| Период | Подписчики | ARR |
|---|---|---|
| Год 1 (конец 2026) | 300 solo | $1.08M |
| Год 2 | 1,000 solo + 50 team | ~$4.8M |
| Год 3 | 3,000 solo + 200 team | ~$18M |

**Юнит-экономика:**
- Gross margin: 80%+ (SaaS + контролируемые external API costs)
- CAC target: $500-1,000 (через Breakbulk.com events + direct LinkedIn)
- LTV target: $7,200 (2 года средний срок подписки × $300)
- LTV/CAC: 7-15× — здоровый SaaS

**TAM (total addressable market):**
5,000-10,000 solo breakbulk/dry brokers × $300/мес × 12 = **$18-36M/год потенциал**.

Не unicorn, но крепкий mid-market SaaS с хорошей прибыльностью.

---

## 9. Почему Quantika выигрывает

### 1. Underserved market
Tier-1 инструменты (Clarksons SIN, Kpler) начинаются с $15-100k/год — solo-брокерам недоступно. Quantika — их **первый настоящий tool** за разумные деньги.

### 2. AI-первый подход
Конкуренты (Clarksons, Drewry) построены 20+ лет назад, их parsing keyword-based и с большими ошибками. LLM даёт понимание контекста, которое качественно лучше.

### 3. End-to-end pipeline
Конкуренты решают **одну часть** (только rates или только vetting или только routing). Quantika закрывает **весь workflow** брокера.

### 4. Правильная distribution
WhatsApp bot + Gmail extension + mobile PWA — там где брокер **реально** работает. Не "заходи на наш dashboard, когда будет время".

### 5. Data compounding
Каждое фиксированное письмо обогащает нашу БД. Через 12 месяцев у нас собственный last-done feed, vessel library, charterer credit data — которых нет ни у кого за пределами tier-1 с платными терминалами.

### 6. Regulatory tailwind
EU ETS, FuelEU Maritime, CII, shadow fleet regulations — индустрия становится сложнее **каждый год**. Quantika автоматизирует compliance, Ручная работа становится невозможной. Отличный timing.

---

## 10. Roadmap

**Апрель 2026 (сейчас):** Breakbulk pivot. Убираем всё не-breakbulk из кода (контейнеры, танкеры, dry-bulk). Версия v1.4.0.

**Май-июнь 2026 — Wave α (Economics):**
- Bunker calculator + split bunkering
- EU ETS calculator
- Полный vessel passport (10 проверок)
- Shadow fleet + OpenSanctions scanner
- Crane SWL + combinable + heaviest piece matching

**Июнь-июль 2026 — Wave α.5 (Distribution):**
- **WhatsApp bot MVP** — точка перелома adoption
- Gmail extension inline

**Июль-сентябрь 2026 — Wave β (Depth):**
- Port DA database (топ-30)
- Canal costs (Suez, Panama, Kiel)
- Voyage calculator + TCE
- Suez vs Cape decision support
- Hold cleanliness + L5C matrix
- Subs timer

**Сентябрь-декабрь 2026 — Wave γ (Scale):**
- Laytime calculator + SOF parser
- Market benchmark feed (Toepfer, Drewry, BHSI, own index)
- Charterer credit tier tracker
- RightShip integration
- BIMCO clause library

**2027+:** Scale в новые регионы (Latam, Asia), enterprise features, API для broker houses.

---

## 11. Текущий статус (что уже сделано)

**Версия v1.3.4 в production на https://demo.quantika.org:**
- ✅ Inbox Gmail OAuth + classify + parse
- ✅ Базовый vessel-cargo matching с hard filters
- ✅ Port master (15 портов, расширяется до 416)
- ✅ Equasis basic integration
- ✅ Базовая sanctions matrix (flag × country)
- ✅ Score breakdown с confidence multipliers
- ✅ Basic Draft Quote (без WOW-insights)
- ✅ 1,048 автоматических тестов green
- ✅ Sentry + PostHog observability
- ✅ Deployed на VPS через PM2

**Что в работе прямо сейчас:**
- Breakbulk pivot (13 специализированных задач в wave-pipeline), merge в main планируется до конца апреля.

---

## 12. Что нам нужно от партнёра

*(раздел для заполнения — зависит от типа партнёрства)*

**Вариант А — финансовый инвестор:**
- Seed round: $[TBD] для 12-18 месяцев runway
- Покрытие: 3 разработчика + 1 продакт + 1 sales + инфраструктура + external APIs + marketing
- Milestones: Wave α + α.5 + β + первые 100 платящих подписчиков

**Вариант Б — индустриальный партнёр:**
- Доступ к сети 50+ брокеров для beta-testing
- Валидация фич с реальными пользователями
- Co-branding или referral deals
- Возможно equity за traction delivery

**Вариант В — стратегический партнёр:**
- Доступ к данным (fixtures, market intel, port operations)
- Contribution в БД в обмен на premium tier
- Potential acquisition partnership долгосрочно

---

## 13. Контакты

**Founder:** Виталий Борисенко
**Email:** [email]
**LinkedIn:** [URL]
**Product demo:** https://demo.quantika.org
**Company:** Quantika AI, Berlin

---

## Приложение — Глоссарий терминов

- **Breakbulk** — штучные грузы (сталь, лес, мешки, оборудование), в отличие от навалочных (зерно, уголь) и контейнерных
- **MPP (Multi-Purpose Vessel)** — универсальное грузовое судно, рабочая лошадка breakbulk, 8-20k DWT
- **DWT (Deadweight)** — полная грузоподъёмность судна в тоннах (груз + топливо + провизия)
- **Laycan** — окно дат, в которое судно должно подать NOR в порт погрузки
- **FIOS** — "Free In Out Stowed" — charterer оплачивает погрузку, выгрузку, укладку
- **MOLOO** — "More Or Less Owner's Option" ±5% — владелец решает точный тоннаж
- **Draft Quote** — предварительное ценовое предложение от брокера charterer'у
- **Firm offer** — окончательное предложение, обязывающее к сделке при принятии
- **Subs** — условия после firm ("subject to stem", "subject to RightShip") с дедлайнами 24-72ч
- **SOF (Statement of Facts)** — поминутный журнал событий судна в порту
- **Demurrage** — штраф за превышение разрешённого времени в порту
- **Despatch** — премия за досрочное завершение
- **SWL (Safe Working Load)** — максимальная грузоподъёмность крана
- **Combinable SWL** — два крана работают парой на одном грузе, сумма SWL
- **L5C (Last 5 Cargoes)** — история последних 5 грузов судна (проверка совместимости)
- **Hold cleanliness grade** — стандарт чистоты трюма (grain clean, hospital clean, shinkle-swept)
- **IMO DCS** — Data Collection System, база углеродных данных судов
- **CII (Carbon Intensity Indicator)** — рейтинг A-E углеродной эффективности судна
- **CP (Charter Party)** — полный чартер-контракт (обычно форма GENCON 2022)
- **PSC (Port State Control)** — портовая инспекция, публикуется в MoU-реестрах
- **P&I Club** — взаимный клуб страхования ответственности судна (13 главных = IG)
- **IACS** — ассоциация 8 классификационных обществ (DNV, LR, ABS, BV, NKK, KR, CCS, RINA)
- **RightShip** — ведущая vetting-платформа breakbulk/bulk
- **Toepfer TMI** — ежемесячный index для MPP ($/день TCE)
- **JWC (Joint War Committee)** — Lloyd's список военно-рисковых зон
- **ADCOM** — Address Commission, 3.75% стандарт на voyage charter
- **F/D/D** — Freight/Demurrage/Despatch — база для комиссии брокера
- **TCE (Time Charter Equivalent)** — заработок владельца в $/день
- **EU ETS** — европейская система платы за CO₂ для судов >5,000 GT, 100% с 2026

---

**Конец документа.**

*Документ self-contained. Для вопросов по детальной архитектуре, коду, или roadmap — см. технические документы в репозитории (по запросу).*
