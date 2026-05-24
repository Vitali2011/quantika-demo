# Quantika Demo — Full Redesign (Design Spec)

**Дата:** 2026-05-24
**Автор:** Виталий + Claude (brainstorming session)
**Статус:** Draft → User review
**Trigger:** прошлые итерации UI делались точечно («как получалось»), сейчас приложение функционально готово (qa-walker run #6 PASSED, 0 errors). Назрел системный редизайн под единый design-system + чистую IA.

---

## 1. Цели и не-цели

### Цели
1. **Design-system first.** Единые токены (цвет, типографика, spacing, radius, motion), единые компоненты — отказаться от ad-hoc Tailwind по месту.
2. **Чистая IA под двусторонний режим** (charterer ↔ owner) с persistent mode-switcher, чтобы один экран не пытался обслуживать обе роли.
3. **Desktop-primary рабочее место брокера** + полноценный mobile companion с сужённым набором сценариев (notifications, quick-quote, view-only).
4. **«Продукт работает» с первого взгляда** — live-processing strip на `/matches` показывает реальную обработку email→match в реальном времени; cached matches видны мгновенно; sample-фикстура для совсем нового юзера.
5. **AI-bar как постоянный entry-point** (⌘K + visible search bar сверху) — берём вкусное из «AI-first» направления, не делая чат главным экраном.

### Не-цели
- Не переписываем бизнес-логику (matching, parsers, TCE-calculator) — только UI/UX слой над ней.
- Не меняем backend API (REST endpoints остаются совместимыми).
- Не делаем нативные mobile-приложения (mobile = responsive web companion).
- Не уходим от Next.js + shadcn/ui + Tailwind — стек остаётся, меняется token layer и patterns.

---

## 2. Решения, зафиксированные в brainstorming

| # | Вопрос | Решение | Обоснование |
|---|---|---|---|
| 1 | Scope | **D — полный редизайн** (~4-6 нед) | Точечные фиксы накопили inconsistency; нужен системный заход |
| 2 | Primary user | **C — двусторонний с mode-switcher** | Один и тот же `/matches` пытался обслужить обе роли — отсюда UX-каша |
| 3 | Form-factor | **D — desktop-primary + mobile companion** | Брокеры 8ч/день за монитором; mobile — для быстрых действий в пути |
| 4 | Визуальное направление | **B — Modern SaaS** (Linear/Notion/Vercel-vibe) | Air, тонкая типографика, минимум шума; «как у конкурентов через 3 года» |
| 5 | IA / нав-модель | **B — Top-nav 5 + ⌘K + persistent AI-bar** | Чисто, опытные → ⌘K; AI-bar берёт идею из «AI-first» как feature, не как nav |
| 6 | Палитра | **B — Maritime Deep (navy + amber accent)** | Узнаётся в shipping, отстраивает от типового «синего B2B SaaS» |
| 7 | Empty/loading state | **Live-processing strip + cached matches всегда видны + sample-fallback для новых** | Решает blank-screen + показывает «продукт работает» каждое открытие |

---

## 3. Архитектура

### 3.1. Design-system слой (foundation)

Новый каталог `design-system/`:

```
design-system/
├── tokens/
│   ├── colors.css       — semantic tokens (--bg, --surface, --border, --accent, --accent-fg)
│   ├── typography.css   — type scale, line-heights, weights
│   ├── spacing.css      — 4px-base scale (0/1/2/3/4/6/8/12/16)
│   ├── radius.css       — sm/md/lg + full
│   └── motion.css       — durations, easings
├── primitives/          — атомы (Button, Input, Badge, Card, Pill, Skeleton, …)
├── patterns/            — связки (StatCard, EmptyState, LiveStrip, ModeSwitcher, AIBar, CmdK)
└── README.md            — guidelines: «когда новый компонент vs когда patterns»
```

**Token-палитра Maritime Deep:**
- `--bg: #f8fafc` (slate-50) — фон страницы
- `--surface: #ffffff` — карточки, panels
- `--border: #e2e8f0` (slate-200)
- `--text: #0f172a` (slate-900)
- `--muted: #64748b` (slate-500)
- `--accent: #0f172a` (deep navy = primary brand) — кнопки primary, активные таб
- `--accent-fg: #fbbf24` (amber-400) — accent поверх navy (текст на primary, highlights, ratings)
- `--accent-soft: #fef3c7` (amber-100) — soft pills/badges
- `--success: #047857`, `--warn: #b45309`, `--danger: #b91c1c`
- Dark mode — отдельный набор токенов, но **дефолт = light** (Phase 1 не делает dark).

### 3.2. Layout shell

`AppShell` компонент-обёртка для всех страниц:

```
┌─────────────────────────────────────────────────────────────┐
│  Logo │ Dashboard · Matches · Cargo · Vessels · Market  ⋯  │  TopNav (5 + More)
│                                          [Charterer|Owner] │  ModeSwitcher (persistent)
├─────────────────────────────────────────────────────────────┤
│  🔍 Ask anything or paste email…                      ⌘K  │  AIBar (persistent, sticky)
├─────────────────────────────────────────────────────────────┤
│  (опционально) LiveStrip — когда есть активная обработка   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Page content                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Mobile (≤768px):**
- TopNav сворачивается в bottom-nav 4 икон (Matches / Cargo+Vessels combined / AI / More)
- AIBar становится полно-экранным sheet по тапу
- ModeSwitcher переезжает в drawer

### 3.3. ModeSwitcher (charterer ↔ owner)

- **Состояние** хранится в БД (`users.preferred_mode`) + URL query `?mode=charterer|owner` для shareable links.
- Переключение **не reload** страницы — реактивно меняет: `/matches` columns + sort defaults + AI-bar placeholder + nav badge counts.
- На desktop виден всегда (top-right); на mobile в drawer.
- На странице есть `Mode-aware copy`: `t('matches.empty', mode)` — разные тексты под роли.

### 3.4. AIBar + ⌘K

- **Visible bar** в shell: placeholder меняется по mode («Спроси про груз…» / «Спроси про судно…»).
- Клик или ⌘K → открывает full-width palette со 3 категориями:
  - **Actions** («Find vessel for 47k HSS Constanta», «Generate recap», «Show market HSS»)
  - **Navigate** (быстрый jump в любую страницу/match/cargo/vessel)
  - **Recents** (последние 5 действий)
- Парсинг свободного email/текста — отдельный handler, шлёт в существующий `/api/email/parse` или `/api/cargo/parse`.

### 3.5. LiveStrip (главная UX-фишка `/matches`)

Когда активна обработка (`useLiveJobs()` hook слушает SSE/polling от `/api/jobs/active`):

- Появляется gradient amber strip над списком matches.
- Показывает grid из N email-карточек (queue/active/done) — реалистичный прогресс.
- Каждое завершение → toast «✨ Новый match» + карточка проплывает в список с зелёной обводкой (10 сек fade).
- Прогресс — **реальный**, не fake (берётся из `job.progress_percent` в БД).
- В покое (нет активных job) — strip скрыт, ничего не занимает.

### 3.6. Empty states

| Состояние | Что показываем |
|---|---|
| **0 кэша + 0 jobs** (совсем новый юзер) | LiveStrip с подсказкой «👇 Подключи Gmail / кинь email / опиши груз словами» + ниже sample-данные с пометкой `Demo · так это будет выглядеть` |
| **0 кэша + есть active job** | LiveStrip с прогрессом, ниже skeleton placeholders |
| **Кэш есть + 0 jobs** | Список matches как обычно, strip скрыт |
| **Кэш есть + active jobs** | Список matches + strip сверху + toasts на новые |

### 3.7. Информационная архитектура (Top-nav 5 + More)

**Primary (top-nav):**
1. **Dashboard** — обзор за смену (today's matches, recent emails, market ticker, alerts)
2. **Matches** — главный экран (LiveStrip + cached list)
3. **Cargo** *(charterer mode)* / **Vessels** *(owner mode)* — mode-зависимая позиция
4. **Vessels** *(charterer mode)* / **Cargo** *(owner mode)* — оборотная сторона
5. **Market** — индексы, fixtures, knowledge base

**More dropdown:**
- Charterers (CRM)
- Recap (рекапы и фикстуры)
- Laytime calculator
- PSC (port state control)
- Commission
- Clauses
- Email inbox view
- Admin (если права есть)

**Sub-navigation:** внутри страницы — горизонтальные tabs (Overview / Economics / Quote) для match detail, sidebar только в admin/knowledge.

---

## 4. Data flow

### 4.1. Live processing pipeline (уже частично есть)

```
Email arrives → /api/email/webhook → enqueue job → jobs table
  → background processor → updates job.progress_percent + status
  → on done: insert into matches → emit SSE event
  
Frontend:
  /matches page mounts
  → fetch cached matches (immediate render)
  → open SSE connection /api/jobs/stream
  → on job update: re-render LiveStrip
  → on new match: prepend to list with fresh: true → toast
```

**Новое:** SSE endpoint `/api/jobs/stream` + `jobs.progress_percent` колонка (если ещё нет — migration 037).

### 4.2. Mode state

```
GET /api/me → { id, preferred_mode: "charterer"|"owner" }
PATCH /api/me { preferred_mode } → persist
URL query ?mode=X overrides preferred_mode for current view
```

Контекст React: `<ModeProvider>` оборачивает `AppShell`, дети используют `useMode()`.

---

## 5. Decomposition на sub-projects

Полный редизайн = **6 sub-projects**, каждый получает отдельный spec → plan → implementation. Порядок:

| # | Sub-project | Что входит | Срок | Зависит от |
|---|---|---|---|---|
| **R1** | **Design-system foundation** | tokens/, primitives/, Storybook-like preview page `/design`, документация | 5-7 дней | — |
| **R2** | **AppShell + IA + ModeSwitcher** | TopNav, BottomNav (mobile), ModeSwitcher, route reorganization | 4-5 дней | R1 |
| **R3** | **AIBar + ⌘K palette** | Visible bar, palette, actions/navigate/recents | 4-5 дней | R1, R2 |
| **R4** | **Matches LiveStrip + cached list** | SSE, jobs.progress, LiveStrip component, toasts, fresh-card animation | 5-7 дней | R1, R2; **главная UX-фишка** |
| **R5** | **Per-section polish pass** | Применить design-system на все ~25 страниц (admin не трогаем), фиксы emptу-states, mobile-companion для каждой | 7-10 дней | R1-R4 |
| **R6** | **A11y + perf + полировка** | a11y audit (contrast, focus, ARIA), Lighthouse perf, motion-reduce, dark-mode prep | 3-5 дней | R1-R5 |

**Итого:** ~30 рабочих дней (~4-6 нед с переключениями), полностью bg-параллелится R2/R3 и R4/R5.

**Этот spec покрывает R1 + per-screen specifications для R5** (см. §5a ниже). R2/R3/R4/R6 получают отдельные specs после R1 merged.

---

## 5a. Per-screen specifications (вход в R5)

Дополнительный deep brainstorm 2026-05-24 (10 экранов, выбор A/B/C для каждого). Эти решения фиксируются ЗДЕСЬ чтобы R5 (per-section polish) не пересматривал layout-вопросы — только применял design-system к уже выбранному layout'у.

| # | Экран | Layout | Ключевые детали |
|---|---|---|---|
| 1 | **Dashboard** `/` | **A Agenda-first + KPI-полоска из B сверху** | «Что мне сегодня сделать» — задачи + matches + inbox. Сверху ленточка 4 KPI (BDI / Open matches / Active cargoes / HSS rate). |
| 2 | **Matches** `/matches` | **B Table-first + Cards/Table toggle** | Default на desktop = Table (~12 строк), на mobile = Cards. Toggle в filter-bar. Поверх — LiveStrip (см. §3.5). |
| 3 | **Match detail** `/match/[id]` | **B Split + sticky AI side-panel** | Главное слева (Vessel/Cargo/Map), справа — AI summary + Quote/Counter/Decline + контрагент-инфа. На mobile → bottom-sheet. |
| 4 | **Cargo + Vessels** `/cargo`,`/vessels` | **B Table + AI-add bar + side-modal** | Один паттерн на обе сущности. Сверху AI-add bar («вставь email → распарсилось»). Click row → side panel detail. |
| 5 | **Charterers** `/charterers` | **A Table** (как Cargo/Vessels) + **колонка Last-snippet** + **HOT/WARM/COLD coloring** | Консистентно с другими CRUD. Снимок последнего email + цвет по recency. |
| 6 | **Market** `/market` | **A Multi-section digest** (KPI tiles + Routes + Fixtures + Knowledge) + **click → B drill-down** | Default = digest. Click по KPI/маршруту → focused chart + history. |
| 7 | **Recap** `/recap` | **B Form-first + AI assist** + **Sources panel из A** | Форма с подсветкой missing-полей. AI заполняет что может, panel справа показывает sources («email Boris 21 May → freight»). Кнопка «Generate full text» → email/PDF. |
| 8 | **Email inbox** `/email` | **B Stream of action-cards** + **📄 Original кнопка** | Каждое письмо = карточка с parsed-полями и actions (Accept / Edit / Reject). Low-confidence (<80%) подсвечены amber. Mobile = swipe-style. |
| 9 | **Onboarding** flow | **B Pre-loaded demo + persistent banner** + **mode auto-detect** | Юзер сразу видит работающий продукт с DEMO-данными. Banner «Connect Gmail (1 OAuth)». Mode (charterer/owner) auto-detect по первому реальному email'у. |
| 10 | **Upgrade / billing** `/upgrade` | **B Usage-aware utilitarian внутри продукта** + **A Classic 3-tier как страница «See all plans»** | В nav кликнул Upgrade → видит current plan + usage bars + contextual upgrade prompt. Лендинг A — ссылка для сравнения. |
| 11 | **Landing page** `/` (public, незалогиненные) | **A Product-demo hero** (живой LiveStrip встроен) + **features-strip + pricing pill из B** | Aha-moment за 5 сек: посетитель видит LiveStrip работающий прямо в hero. Trust-logos. Features 3 иконки. Pricing pill ведёт на `/upgrade`. |
| 12 | **Settings / Account** `/settings` (NEW route) | **A Sidebar + content** (Stripe/Linear-стандарт) | 10 разделов (Profile/Password/Notifications/Integrations/Team/API/Billing/Payment/Invoices/Export/Danger). Default = Integrations (самая частая причина прийти). URL anchors (`/settings/integrations`) для shareable links. |
| 13 | **Notifications center** | **A Bell dropdown only** (MVP, YAGNI) | Bell сверху → popup с tabs (All/Matches/Replies/Alerts). 5-7 последних, «View all» внизу. Правила настраиваются в Settings → Notifications. Full page вынесена до момента, когда юзеры реально начнут терять старые уведомления. |
| 14 | **Help / Docs** (in-app) | **A AI chat-help (floating)** + reuse RAG-индекса (Knowledge Phase 2) | Floating «? Help» в bottom-right на всех страницах кроме landing. AI отвечает из docs+RAG, cites sources (guides/videos). Полный docs.quantika.org вынесен до момента когда контента нарастёт 30+. |

### Применение паттернов на остальные страницы (без отдельного brainstorm)

Эти экраны получают design-system + один из закреплённых паттернов:

| Экран | Паттерн |
|---|---|
| Laytime calculator (`/laytime`) | Form-first + AI assist (как Recap) — поля Time, AI считает; sources panel показывает CP-клаузы |
| PSC (`/psc`) | Table-first как Cargo/Vessels (port × inspection findings) |
| Commission (`/commission`) | Table + side-modal (как Cargo) |
| Clauses (`/clauses`) | Table + side-modal с rich-text edit |
| Request (`/request`) | Form-first (как Recap), AI suggests на основе match |
| Processing (`/processing`) | LiveStrip-like full-page (variant главного паттерна) |
| Summary (`/summary`) | Read-only digest (как Market section но узкий) |
| More menu | Cмpлый список ссылок в drawer-стиле |
| Login (`/login`) | Standard auth screen — token из design-system, layout default |
| Vessel detail (`/vessel/[id]`) | Split + AI side-panel (как Match detail но read-only stats) |
| Fixture (`/fixture`) | Read-only Recap view (no edit) |
| Admin/* | Не трогаем в R5 (внутренние страницы, низкий priority) |
| Error pages (`error.tsx`, `global-error.tsx`, `not-found.tsx`) | Standard design-system treatment: friendly copy + Action-CTA («Go to Dashboard», «Report») |
| Loading skeletons (`loading.tsx`) | `Skeleton` primitive из design-system, layout-matching текущей странице |

### Новые routes, которые нужно создать в R2/R5

| Route | Когда | Что |
|---|---|---|
| `/settings/*` | R2 (часть AppShell — добавить роутинг) + R5 (контент) | Sidebar nav + 10 разделов из экрана 12 |
| `/api/jobs/stream` | R4 (LiveStrip) | SSE endpoint для live processing |
| `/api/me` (PATCH) | R2 (ModeSwitcher) | Update preferred_mode |
| Floating Help button | R3 (часть AIBar) или R5 (отдельно) | Использует тот же AI-bar backend |

### Связь с R-структурой

- **R1** (текущий) реализует design-system, на котором всё это строится.
- **R5** (per-section polish) применяет таблицу §5a — `pageSpec → layout pattern → design-system primitives`. Никаких новых layout-решений в R5.
- При imp R5 разбивается на ~5 параллельных subagent'ов: по 2-3 экрана на каждого, паттерн уже фиксирован.

---

## 6. R1 — Design-system foundation (текущий план)

### 6.1. Структура

```
design-system/
├── tokens/
│   ├── colors.css
│   ├── typography.css
│   ├── spacing.css
│   ├── radius.css
│   └── motion.css
├── primitives/
│   ├── Button.tsx          — variants: primary, secondary, ghost, danger; sizes: sm, md, lg
│   ├── Input.tsx
│   ├── Textarea.tsx
│   ├── Select.tsx
│   ├── Badge.tsx           — variants: default, success, warning, danger, info, accent
│   ├── Pill.tsx            — rounded fully, для score/status
│   ├── Card.tsx            — surface + border + padding variants
│   ├── Skeleton.tsx
│   ├── Avatar.tsx
│   ├── Toast.tsx
│   ├── Dialog.tsx          — wrap shadcn Dialog с нашими токенами
│   ├── Sheet.tsx           — mobile bottom-sheet
│   ├── Tabs.tsx
│   ├── Switch.tsx
│   ├── Tooltip.tsx
│   └── index.ts
└── README.md
```

### 6.2. Token mapping в Tailwind

Расширить `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      bg: 'var(--bg)',
      surface: 'var(--surface)',
      border: 'var(--border)',
      text: 'var(--text)',
      muted: 'var(--muted)',
      accent: { DEFAULT: 'var(--accent)', fg: 'var(--accent-fg)', soft: 'var(--accent-soft)' },
      success: 'var(--success)',
      warn: 'var(--warn)',
      danger: 'var(--danger)',
    },
    borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)' },
    transitionDuration: { fast: 'var(--motion-fast)', base: 'var(--motion-base)' },
  }
}
```

### 6.3. Preview page `/design` (внутренняя)

Страница `app/design/page.tsx` (под auth, hidden from nav) показывает все primitives + patterns + token swatches. Заменяет Storybook (мы не хотим тащить storybook-зависимость) — простая HTML-галерея.

### 6.4. Migration strategy (важно)

- **Не ломаем существующее.** R1 ДОБАВЛЯЕТ `design-system/` параллельно к существующим компонентам.
- Старые компоненты в `components/ui/*` (shadcn-based) — остаются работать.
- В R2-R5 страницы постепенно мигрируют с `components/ui/Button` на `design-system/primitives/Button`. Когда последняя страница мигрировала — старый `components/ui/Button` удаляется.
- Никакого «большого rewrite», который сломает прод.

### 6.5. Error handling

- Token-CSS подключается в `app/layout.tsx` через `import './globals.css'` (где globals импортит tokens). Если файл токенов отсутствует — fallback значения в `:root` в самом globals.
- Primitive-компоненты используют semantic токены через Tailwind classes. Если token не определён — браузер берёт inherit; визуально это будет заметно сразу.

### 6.6. Testing

- **Visual regression:** для каждого primitive — snapshot test через Playwright `toHaveScreenshot()` на странице `/design`. 1 snapshot = 1 primitive в трёх состояниях (default, hover/focus, disabled).
- **Unit tests:** для Button/Input/Toast — поведенческие (click handler fires, disabled state, aria attributes).
- **A11y:** axe-core в Playwright тесте `/design` — должно быть 0 violations.
- **Build:** TS strict, никаких `any` в design-system/.

---

## 7. Out of scope (для R1)

- ❌ Dark mode (готовим токен-слой, реализация в R6)
- ❌ Миграция страниц на новые primitives (R2-R5)
- ❌ AIBar / LiveStrip компоненты (R3, R4)
- ❌ Удаление `components/ui/*` (последний шаг R5)
- ❌ Бизнес-логика любая (не трогаем)

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Двойная design-system live одновременно (R1 + старая) → визуальная каша на проде | R1 не меняет ни одной существующей страницы; preview только на `/design` |
| Tailwind CSS bloat от двойных токенов | После R5 удаляем старые цвета из конфига; CSS-tokens живут только в globals |
| Navy + amber accent может выглядеть «военно» если переборщить | В R1 строго ограничить amber только для accent-fg и interactive highlights (не для блоков); в `/design` будет правило usage |
| 4-6 нед — длинно, продукт «замерзнет» | R1-R6 идут параллельно с продакт-работой; миграция страниц incremental |
| Mobile-companion может вылезти за R1 scope | Mobile-layout вынесен в R2 (AppShell), R1 = только tokens + primitives без layout |

---

## 9. Success criteria для R1

- ✅ `/design` страница показывает все primitives + tokens, axe 0 violations
- ✅ `tailwind.config.ts` расширен semantic токенами; `design-system/tokens/*.css` импортируются
- ✅ TypeScript strict, 0 errors
- ✅ Playwright visual snapshots на `/design` — все green
- ✅ `design-system/README.md` объясняет: «когда добавлять primitive vs pattern», usage rules для accent-fg, mode-toggle copy patterns
- ✅ Существующие страницы продолжают работать без изменений (regression check через qa-walker)

---

## 10. Open questions / для следующего spec'а

- (R2) Mobile bottom-nav: 4 vs 5 икон? Иконография — Lucide или custom?
- (R3) ⌘K на mobile — full-screen sheet или slide-up? Voice input?
- (R4) SSE vs WebSocket vs polling для live-jobs — отдельный решающий spec
- (R5) Какие страницы мигрируем первыми (риск-ранжирование)?
- (R6) Dark mode — system-detect или ручной toggle?
- Брендинг: оставляем «Quantika» имя/лого, или редизайн логотипа тоже?

---

## 11. Visual references

Сохранены в `.superpowers/brainstorm/9302-1779612723/content/`:
- `visual-direction.html` — 3 направления (A Bloomberg / B SaaS / C Vertical) → выбрали B
- `ia-models.html` — 3 IA-модели (A Sidebar / B Top-nav / C AI-first) → выбрали B
- `palette.html` — 3 палитры (A Blue / B Navy+Amber / C Soft) → выбрали B
- `live-processing.html` — финальный мокап LiveStrip + cached matches + mode-switcher → ок

---

## 12. Next step

После approval этого spec → invoke **writing-plans** skill → создаст имплементационный план для R1 (Design-system foundation). R2-R6 получают свои specs после R1 merged.
