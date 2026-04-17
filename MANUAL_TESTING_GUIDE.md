# Quantika Demo — Manual Testing Guide
# Quantika Demo — Руководство по ручному тестированию

**URL:** https://demo.quantika.org  
**Date / Дата:** April 2026  
**Version / Версия:** MVP v1.0.0

---

---

# 🇬🇧 ENGLISH VERSION

---

## What is this app?

Quantika Demo is an AI-powered freight email parser and vessel-cargo matching system.
You paste freight emails (cargo orders + vessel positions) and the AI:
1. Parses them into structured data
2. Matches vessels to cargoes
3. Checks sanctions, readiness, physical feasibility
4. Shows a scored match report with source traceability

---

## Step-by-Step Manual Testing Checklist

### ✅ STEP 1 — Landing Page

**URL:** https://demo.quantika.org

1. Open the URL in your browser
2. You should see the landing page with a big headline and a **"Try with Sample Data"** button
3. Check that the page loads without errors (open DevTools → Console, no red errors)
4. Look for the email input area (textarea with example freight emails)

**What to verify:**
- [ ] Page loads in < 3 seconds
- [ ] "Try with Sample Data" button is visible and clickable
- [ ] No JavaScript console errors

---

### ✅ STEP 2 — Submit Sample Data

1. Click **"Try with Sample Data"** button
2. The browser will submit the form and redirect you to `/processing`

**What to verify:**
- [ ] Redirect happens to `/processing` page
- [ ] A processing spinner / step list appears
- [ ] You can see step labels like "Classifying emails...", "Parsing cargo...", "Finding vessels..."

---

### ✅ STEP 3 — Processing Page

**URL:** https://demo.quantika.org/processing

The pipeline runs 5 steps automatically:

| Step | Label | What it does |
|------|-------|-------------|
| 1 | Classify emails | Sorts emails into CARGO / VESSEL / RECAP / OTHER |
| 2a | Parse cargo | Extracts cargo details from cargo emails |
| 2b | Parse vessel | Extracts vessel specs from vessel emails |
| 2c | Parse recap | Extracts recap/fixture data |
| 3 | Match vessels | Finds vessel-cargo pairs |
| 4a | Score matches | Adds 6-component scoring |
| 4b | Check counterparties | Sanctions screening |

**What to verify:**
- [ ] Steps complete one by one (watch the checkmarks ✅)
- [ ] No step shows a permanent red ❌ error
- [ ] After all steps: automatic redirect to `/dashboard`
- [ ] Processing takes 30–90 seconds (LLM calls) — this is normal

---

### ✅ STEP 4 — Dashboard

**URL:** https://demo.quantika.org/dashboard

**What to verify:**
- [ ] You see cargo email cards (left column) and vessel email cards (right column)
- [ ] Count: expect ~7 cargo emails + ~8 vessel emails from sample data
- [ ] Each card shows: subject, sender, date, extracted fields
- [ ] Click any cargo card → goes to `/cargo/sample-N` detail page
- [ ] Click any vessel card → goes to `/vessel/sample-N` detail page

---

### ✅ STEP 5 — Cargo Detail Page

**URL:** https://demo.quantika.org/cargo/sample-1  
(try sample-1, sample-2, sample-3, etc.)

**What to verify:**
- [ ] Original email text is shown
- [ ] "View annotated →" link works
- [ ] AI Analysis section shows extracted fields:
  - Cargo type, quantity, load port, discharge port, laycan dates
- [ ] Fields with **colored badges** (green/yellow/red) show confidence level
- [ ] **Click on a colored field value** → a popover should appear showing:
  - The source quote from the email
  - Confidence percentage
  - From / Date / Subject info
- [ ] Laycan dates are formatted as human dates (not raw ISO strings)

⚠️ **Known Bug:** Some fields may show `[object Object]` instead of a value — this is a rendering bug.

---

### ✅ STEP 6 — Vessel Detail Page

**URL:** https://demo.quantika.org/vessel/sample-3  
(MV AUGUSTA STAR — try sample-1 through sample-8)

**What to verify:**
- [ ] Original email text is shown
- [ ] "Active until" date is shown — **check if it shows raw ISO** (`2026-04-17T00:00:00.000Z`) or formatted (`4/17/2026`)
- [ ] Specifications table shows: DWT, DWCC, Draft, LOA, Built, Flag, Holds, Geared, Grain capacity
- [ ] **Geared field** — verify it matches the email text (if email says "Gearless", the field should show No/Gearless)
- [ ] Last cargoes — should show cargo type names, **not** `[object Object]`
- [ ] Click on DWT or Open port field → popover appears with source quote

⚠️ **Known Bug:** "Active until" shows raw ISO date string (not human-formatted).  
⚠️ **Known Bug:** Last cargoes shows `[object Object]` — rendering bug.

---

### ✅ STEP 7 — Match Detail Page

**URL:** https://demo.quantika.org/match/[matchId]

(Access via the Dashboard if matches are found — click a match card)

**What to verify:**
- [ ] Match card shows: cargo name, vessel name, match score badge
- [ ] Match reasons list (why this pair was matched)
- [ ] 🛡️ **Physical feasibility** — 4 checks:
  - Draft compatibility
  - Crane/gear requirement
  - Volume/hold fit
  - Cargo-vessel type compatibility
- [ ] ⏱️ **Vessel readiness** — 6 metrics:
  - Distance (nm), Speed (kn), Sailing days, Gap days, Arrival date, Laycan start/end
- [ ] ⚠️ **Sanctions** — should show screening result (CLEAR / HIGH RISK)
- [ ] 📊 **Score breakdown** — 6 components with progress bars:
  - Geographic proximity, Cargo type match, Cargo handling, Volume/hold fit, Laycan fit, DWT class fit

---

### ✅ STEP 8 — Demo Scenarios

**URL:** https://demo.quantika.org/api/demo-scenarios/01-karasu-mykolaiv-idle

Test these scenario IDs directly:

| ID | Scenario | Expected result |
|----|----------|----------------|
| `01-karasu-mykolaiv-idle` | Idle vessel | Match found, readiness = IDLE |
| `02-steel-on-bulker-blocked` | Wrong vessel type | Hard-filtered (blocked) |
| `05-ru-flag-mykolaiv-sanctioned` | Russia flag | Sanctions = HIGH |
| `10-perfect-match` | Perfect pair | High score, CLEAR sanctions |

**What to verify:**
- [ ] Each URL returns JSON (not 404)
- [ ] JSON contains `id`, `emails`, scenario metadata

---

### ✅ STEP 9 — Health Check

**URL:** https://demo.quantika.org/api/health

**What to verify:**
- [ ] Returns `{"status":"ok","version":"0.1.0"}`
- [ ] HTTP 200 status

Note: Version is hardcoded `0.1.0` — does not reflect actual release tag.

---

### ✅ STEP 10 — Session Expiry (edge case)

1. Open the app and process some data
2. Wait 65+ minutes
3. Try to navigate to `/dashboard`
4. You should be redirected to `/` (landing page)

**What to verify:**
- [ ] Old session gracefully redirects to home
- [ ] No 500 error shown

---

## Folder Structure (for developers)

```
~/work/quantika-demo/
├── app/                        ← Next.js App Router pages
│   ├── page.tsx                ← Landing page (form submission)
│   ├── processing/page.tsx     ← Pipeline progress UI
│   ├── dashboard/page.tsx      ← Email cards overview
│   ├── cargo/[id]/page.tsx     ← Cargo detail page
│   ├── vessel/[id]/page.tsx    ← Vessel detail page
│   ├── match/[id]/page.tsx     ← Match detail page
│   └── api/
│       ├── sample/route.ts     ← POST: load sample data
│       ├── health/route.ts     ← GET: health check
│       ├── demo-scenarios/     ← GET: scenario JSON files
│       └── ai/
│           ├── classify/       ← LLM: classify emails
│           ├── parse-cargo/    ← LLM: parse cargo details
│           ├── parse-vessel/   ← LLM: parse vessel details
│           ├── match/          ← LLM: match vessels to cargoes
│           └── recap/          ← LLM: parse recap/fixture
├── lib/
│   ├── session-store.ts        ← SQLite session storage
│   ├── sailing/
│   │   ├── readiness-gap.ts    ← Vessel readiness calculation
│   │   ├── match-filters.ts    ← Hard filters (draft/crane/volume/type)
│   │   └── match-scoring.ts    ← 6-component scoring
│   ├── validation/
│   │   ├── sanctions.ts        ← Sanctions screening logic
│   │   └── imo.ts              ← IMO number validation
│   └── sample-data/
│       └── demo-scenarios/     ← 10 pre-built test scenarios
├── components/
│   ├── source-quote-popover.tsx ← Clickable field popovers
│   └── confidence-field.tsx     ← Badge + click handler
├── data/
│   └── sessions.db             ← SQLite database (auto-created)
└── middleware.ts               ← CSRF protection for /api/ai/* routes
```

---

## Known Bugs Found During Smoke Test

| # | Severity | Location | Bug |
|---|----------|----------|-----|
| B1 | 🔴 HIGH | `/vessel/*` | "Active until" shows raw ISO (`2026-04-17T00:00:00.000Z`) instead of formatted date |
| B2 | 🔴 HIGH | `/vessel/*` | Last cargoes renders `[object Object]` instead of cargo type names |
| B3 | 🟠 MED | `/cargo/*` | `[object Object]` in port field when country is an object |
| B4 | 🟠 MED | `match-filters.ts` | BREAK_BULK cargo (fertilizer in bags) blocked on bulk carriers — may cause 0 matches with sample data |
| B5 | 🟡 LOW | `api/health` | Version hardcoded as `0.1.0`, not from `package.json` |
| B6 | 🟡 LOW | `app/api/ai/match` | `refYear` hardcoded to 2025 for sessions created in 2026 — date math may be off |

---

---

# 🇷🇺 РУССКАЯ ВЕРСИЯ

---

## Что такое это приложение?

Quantika Demo — это AI-система для разбора фрахтовых писем и подбора судов под грузы.
Вы вставляете электронные письма (заявки на грузы + позиции судов), и ИИ:
1. Разбирает их в структурированные данные
2. Подбирает суда к грузам
3. Проверяет санкции, готовность судна, физическую совместимость
4. Показывает отчёт с оценкой и ссылками на источники

---

## Пошаговый чеклист ручного тестирования

### ✅ ШАГ 1 — Главная страница

**URL:** https://demo.quantika.org

1. Откройте URL в браузере
2. Должна появиться главная страница с кнопкой **"Try with Sample Data"**
3. Откройте DevTools → Console, убедитесь, что нет красных ошибок
4. Найдите область ввода email-писем (textarea)

**Что проверить:**
- [ ] Страница загружается менее чем за 3 секунды
- [ ] Кнопка "Try with Sample Data" видна и кликабельна
- [ ] Нет ошибок JavaScript в консоли

---

### ✅ ШАГ 2 — Отправка тестовых данных

1. Нажмите кнопку **"Try with Sample Data"**
2. Браузер отправит форму и перенаправит на `/processing`

**Что проверить:**
- [ ] Происходит редирект на страницу `/processing`
- [ ] Появляется список шагов с индикатором загрузки
- [ ] Видны подписи шагов: "Classifying emails...", "Parsing cargo...", "Finding vessels..."

---

### ✅ ШАГ 3 — Страница обработки

**URL:** https://demo.quantika.org/processing

Пайплайн автоматически выполняет 5 шагов:

| Шаг | Название | Что делает |
|-----|----------|------------|
| 1 | Classify emails | Сортирует письма: CARGO / VESSEL / RECAP / OTHER |
| 2а | Parse cargo | Извлекает детали грузов |
| 2б | Parse vessel | Извлекает характеристики судов |
| 2в | Parse recap | Извлекает данные фикстур |
| 3 | Match vessels | Подбирает пары судно-груз |
| 4а | Score matches | Добавляет 6-компонентный скоринг |
| 4б | Check counterparties | Проверка санкций |

**Что проверить:**
- [ ] Шаги выполняются по одному (следите за галочками ✅)
- [ ] Ни один шаг не показывает постоянную красную ❌ ошибку
- [ ] После всех шагов: автоматический редирект на `/dashboard`
- [ ] Обработка занимает 30–90 секунд (LLM-вызовы) — это нормально

---

### ✅ ШАГ 4 — Дашборд

**URL:** https://demo.quantika.org/dashboard

**Что проверить:**
- [ ] Видны карточки грузовых писем (левая колонка) и карточки судов (правая колонка)
- [ ] Количество: ожидается ~7 грузовых писем + ~8 позиций судов из тестовых данных
- [ ] Каждая карточка показывает: тему, отправителя, дату, извлечённые поля
- [ ] Клик по карточке груза → переход на `/cargo/sample-N`
- [ ] Клик по карточке судна → переход на `/vessel/sample-N`

---

### ✅ ШАГ 5 — Страница деталей груза

**URL:** https://demo.quantika.org/cargo/sample-1  
(попробуйте sample-1, sample-2, sample-3 и т.д.)

**Что проверить:**
- [ ] Отображается оригинальный текст письма
- [ ] Ссылка "View annotated →" работает
- [ ] Секция AI Analysis показывает извлечённые поля:
  - Тип груза, количество, порт погрузки, порт разгрузки, даты лейкана
- [ ] Поля с **цветными значками** (зелёный/жёлтый/красный) показывают уровень уверенности ИИ
- [ ] **Клик на цветное поле** → должен появиться попап с:
  - Цитатой из письма-источника
  - Процентом уверенности
  - От кого / Дата / Тема письма
- [ ] Даты лейкана отформатированы как человекочитаемые (не сырые ISO строки)

⚠️ **Известный баг:** Некоторые поля могут показывать `[object Object]` вместо значения.

---

### ✅ ШАГ 6 — Страница деталей судна

**URL:** https://demo.quantika.org/vessel/sample-3  
(MV AUGUSTA STAR — попробуйте sample-1 до sample-8)

**Что проверить:**
- [ ] Отображается оригинальный текст письма
- [ ] Поле "Active until" — **проверьте**: сырая ISO строка (`2026-04-17T00:00:00.000Z`) или отформатированная дата (`17.04.2026`)
- [ ] Таблица характеристик: DWT, DWCC, Осадка, LOA, Год постройки, Флаг, Трюмы, Краны, Зерновая ёмкость
- [ ] Поле **Geared** — проверьте соответствие тексту письма (если в письме "Gearless" — должно быть No/Gearless)
- [ ] Последние грузы — должны показывать названия типов грузов, **не** `[object Object]`
- [ ] Клик на DWT или порт → появляется попап с цитатой из источника

⚠️ **Известный баг:** "Active until" показывает сырую ISO строку.  
⚠️ **Известный баг:** Последние грузы показывают `[object Object]`.

---

### ✅ ШАГ 7 — Страница деталей матча

**URL:** https://demo.quantika.org/match/[matchId]

(Доступна через Дашборд, если найдены матчи — клик по карточке матча)

**Что проверить:**
- [ ] Карточка матча: название груза, название судна, значок оценки матча
- [ ] Список причин матча (почему эта пара выбрана)
- [ ] 🛡️ **Физическая совместимость** — 4 проверки:
  - Совместимость осадки
  - Наличие кранов/стрел
  - Объём/вместимость трюма
  - Совместимость типа груза и судна
- [ ] ⏱️ **Готовность судна** — 6 метрик:
  - Расстояние (морские мили), Скорость (уз), Дней в пути, Разрыв (дни), Дата прибытия, Начало/конец лейкана
- [ ] ⚠️ **Санкции** — результат проверки (CLEAR / HIGH RISK)
- [ ] 📊 **Детализация оценки** — 6 компонентов с прогресс-барами:
  - Географическая близость, Тип груза, Обработка груза, Объём трюма, Соответствие лейкану, Класс DWT

---

### ✅ ШАГ 8 — Демо-сценарии

**URL:** https://demo.quantika.org/api/demo-scenarios/01-karasu-mykolaiv-idle

Протестируйте эти ID сценариев:

| ID | Сценарий | Ожидаемый результат |
|----|----------|---------------------|
| `01-karasu-mykolaiv-idle` | Простаивающее судно | Матч найден, готовность = IDLE |
| `02-steel-on-bulker-blocked` | Неправильный тип судна | Жёсткий фильтр (заблокировано) |
| `05-ru-flag-mykolaiv-sanctioned` | Флаг России | Санкции = HIGH |
| `10-perfect-match` | Идеальная пара | Высокий скор, санкции CLEAR |

**Что проверить:**
- [ ] Каждый URL возвращает JSON (не 404)
- [ ] JSON содержит `id`, `emails`, метаданные сценария

---

### ✅ ШАГ 9 — Проверка здоровья

**URL:** https://demo.quantika.org/api/health

**Что проверить:**
- [ ] Возвращает `{"status":"ok","version":"0.1.0"}`
- [ ] HTTP статус 200

Примечание: версия захардкожена как `0.1.0` — не отражает реальный тег релиза.

---

### ✅ ШАГ 10 — Истечение сессии (граничный случай)

1. Откройте приложение и обработайте данные
2. Подождите 65+ минут
3. Попробуйте перейти на `/dashboard`
4. Должен произойти редирект на `/` (главная страница)

**Что проверить:**
- [ ] Старая сессия корректно перенаправляет на главную
- [ ] Нет ошибки 500

---

## Структура папок (для разработчиков)

```
~/work/quantika-demo/
├── app/                        ← Страницы Next.js App Router
│   ├── page.tsx                ← Главная страница (форма)
│   ├── processing/page.tsx     ← Прогресс пайплайна
│   ├── dashboard/page.tsx      ← Обзор карточек писем
│   ├── cargo/[id]/page.tsx     ← Детали груза
│   ├── vessel/[id]/page.tsx    ← Детали судна
│   ├── match/[id]/page.tsx     ← Детали матча
│   └── api/
│       ├── sample/route.ts     ← POST: загрузить тестовые данные
│       ├── health/route.ts     ← GET: проверка здоровья
│       ├── demo-scenarios/     ← GET: JSON-файлы сценариев
│       └── ai/
│           ├── classify/       ← LLM: классификация писем
│           ├── parse-cargo/    ← LLM: парсинг груза
│           ├── parse-vessel/   ← LLM: парсинг судна
│           ├── match/          ← LLM: подбор пар
│           └── recap/          ← LLM: парсинг фикстур
├── lib/
│   ├── session-store.ts        ← Хранилище сессий на SQLite
│   ├── sailing/
│   │   ├── readiness-gap.ts    ← Расчёт готовности судна
│   │   ├── match-filters.ts    ← Жёсткие фильтры
│   │   └── match-scoring.ts    ← 6-компонентный скоринг
│   ├── validation/
│   │   ├── sanctions.ts        ← Логика проверки санкций
│   │   └── imo.ts              ← Валидация номера ИМО
│   └── sample-data/
│       └── demo-scenarios/     ← 10 готовых тестовых сценариев
├── components/
│   ├── source-quote-popover.tsx ← Попапы кликабельных полей
│   └── confidence-field.tsx     ← Значок уверенности + обработчик клика
├── data/
│   └── sessions.db             ← SQLite база (создаётся автоматически)
└── middleware.ts               ← CSRF защита для /api/ai/* маршрутов
```

---

## Известные баги (обнаружены при смоук-тесте)

| # | Серьёзность | Место | Баг |
|---|-------------|-------|-----|
| B1 | 🔴 ВЫСОКИЙ | `/vessel/*` | "Active until" показывает сырую ISO строку вместо форматированной даты |
| B2 | 🔴 ВЫСОКИЙ | `/vessel/*` | Last cargoes рендерит `[object Object]` вместо названий типов грузов |
| B3 | 🟠 СРЕДНИЙ | `/cargo/*` | `[object Object]` в поле порта когда страна — объект |
| B4 | 🟠 СРЕДНИЙ | `match-filters.ts` | BREAK_BULK груз (удобрения в мешках) блокируется на балкерах — возможен 0 матчей |
| B5 | 🟡 НИЗКИЙ | `api/health` | Версия захардкожена как `0.1.0`, не из `package.json` |
| B6 | 🟡 НИЗКИЙ | `app/api/ai/match` | `refYear` захардкожен как 2025 для сессий 2026 года — расчёт дат может быть неверным |
