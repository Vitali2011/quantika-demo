# Browser Walkthrough — demo.quantika.org — 2026-05-13

**Task:** 3.1 из acceleration-plan — ручная разведка UI через Chrome MCP  
**Дата:** 2026-05-13  
**Аудитор:** Claude Code (Sonnet 4.6) + Chrome MCP  
**Сессия:** fervent-hoover-692508  

---

## Сводка

| Статус | Кол-во |
|--------|--------|
| ✅ Работает | 14 |
| 🟡 Частично | 1 |
| 🔴 Сломано | 5 |
| ⚪ Отключено/Пусто | 3 |
| **Итого** | **23** |

> Примечание: /commission посчитан отдельно (страница рендерится, но данных нет).

---

## Таблица маршрутов

| # | Маршрут | Статус | Severity | Заметки | Screenshot |
|---|---------|--------|----------|---------|------------|
| 1 | `/login` | ✅ | — | Single-password форма (без username). Login работает, редирект на `/`. | login.png |
| 2 | `/onboarding` | ✅ | — | "Welcome to Quantika" 14-day trial CTA. Region picker (MENA/Med/WAFR). "Try with Sample Data" кнопка работает. | onboarding.png |
| 3 | `/dashboard` | ✅ | — | Полные данные: 92 cargo, 53 vessel, 3 fixture recap, 1 match. Виджеты статистики, expandable email list (30 inquiries). | dashboard.png |
| 4 | `/processing` | 🔴 | CRITICAL | Навигация на `/processing` **перезапускает** AI-анализ (re-trigger on navigate). Через ~2-3 мин VPS падает с **502 Bad Gateway** на шаге "Finding available vessels". PM2 рестартует автоматически (~15 сек). | processing-crash.png |
| 5 | `/email/[id]` | ✅ | MEDIUM | Рендерится. Показывает "Email Body — Annotated" + оригинал письма. Надпись **"No parsed extractions for this email yet — process it first."** — AI не запускался. Кнопки parse отсутствуют (только через /processing). | email-id.png |
| 6 | `/cargo/[id]` | ✅ | MEDIUM | Рендерится. Показывает оригинал письма + **"No AI analysis available for this cargo inquiry."** Кнопки: "Draft Quote", "Ask Client for Missing Info". "View annotated →" ведёт на /email/[id]. | cargo-id.png |
| 7 | `/vessel/[id]` | ✅ | MEDIUM | Рендерится. Показывает оригинал письма + **"No vessel data parsed from this email."** "View annotated →" ведёт на /email/[id]. | vessel-id.png |
| 8 | `/match/0` | ✅ | LOW | Demo match работает. 4 таба: Vessels / Economics / Passport / Quote. Economics tab: TCE, voyage P&L, FuelEU section. Некоторые поля-заглушки. Draft Quote генерируется. | match-0.png |
| 9 | `/matches` | 🔴 | HIGH | Маршрут **редиректит на `/dashboard`** — список всех матчей недоступен. Навигационная ссылка сломана. | matches-redirect.png |
| 10 | `/recap/[id]` | 🔴 | HIGH | **404 "This page could not be found."** Маршрут прописан в плане роутера, но страница не существует. Возможно переименован в `/fixture/[id]`. | recap-404.png |
| 11 | `/fixture/[id]` | ✅ | — | **Полностью работает.** AI распарсил charter party: Vessel (MV STAD ✅), Broker, Load Port (Teignmouth ✅), Cargo (Clay ✅), Freight Rate (EUR 30 PMT ✅), Laytime terms (SSHEX ✅), Demurrage (1500 EUR PDPR ✅), CP Form (GENCON 76). "Copy Recap as Text" кнопка. | fixture-id.png |
| 12 | `/commission` | ⚪ | LOW | Страница рендерится, но показывает **"No commission data found"**. Форма/таблица отсутствует. | commission.png |
| 13 | `/summary` | ✅ | — | "157 emails processed, ~4.3h/day saved". Сводная статистика по парсингу. | summary.png |
| 14 | `/laytime` | ✅ | — | Laytime Calculator: SHEX/SHINC переключатель, "Calculate" кнопка, "Parse SOF" для Statement of Facts. | laytime.png |
| 15 | `/clauses` | ✅ | — | BIMCO clause search. Форма поиска, результаты. | clauses.png |
| 16 | `/market` | 🟡 | MEDIUM | 3 таблицы (BHSI, TMI, DREWRY-BB) рендерятся. **Данные устарели: последнее обновление 2026-04-21** (3 недели назад). В /admin/knowledge "Baltic Dry Indices (TradingEconomics)" = `never_synced`. | market.png |
| 17 | `/psc` | ⚪ | LOW | **"Feature Not Enabled"** — требует `NEXT_PUBLIC_PSC_ENABLED`. Env flag не установлен. | psc.png |
| 18 | `/charterers` | ✅ | — | Листинг charterers (blue-chip: ADM, Cargill, Viterra и др.). Карточки с профилями. | charterers.png |
| 19 | `/charterers/[id]` | ✅ | — | Детальная страница (ADM). Контакты, регион, история. | charterers-adm.png |
| 20 | `/vessels/[imo]/psc-history` | ⚪ | LOW | **"Feature Not Enabled"** — требует `NEXT_PUBLIC_PSC_DETENTION_ENABLED`. Env flag не установлен. | psc-history.png |
| 21 | `/admin/knowledge` | ✅ | MEDIUM | 5 knowledge sources. **Критично: несколько источников `never_synced`**: Baltic Dry Indices (TradingEconomics), другие справочники. Объясняет stale /market данные. | admin-knowledge.png |
| 22 | `/upgrade` | 🔴 | MEDIUM | **404 "This page could not be found."** Known bug из плана. | upgrade-404.png |
| 23 | `/` (root) | ✅ | — | Редирект на /onboarding (если нет сессии) или /dashboard (если залогинен). | root.png |

---

## Топ-5 находок

### 🔴 F1 — VPS падает при запуске AI-обработки (CRITICAL)
Навигация на `/processing` запускает новый AI-пайплайн. На шаге "Finding available vessels for your cargo" (~63% прогресса) VPS падает с **502 Bad Gateway**. PM2 перезапускается автоматически, но вся сессия теряется. Это блокирует **основной value-prop** продукта: пользователь не может получить AI-анализ входящих фрахтовых запросов. Следствие: все `/cargo/[id]` и `/vessel/[id]` показывают "No AI analysis" — данные пустые.

**Рекомендация (triage 3.2):** Найти и устранить OOM/timeout в pipeline на VPS. Добавить graceful abort и лимит памяти на процесс. Рассмотреть queue-based обработку вместо синхронного вызова.

---

### 🔴 F2 — `/matches` редиректит на Dashboard (HIGH)
Маршрут `/matches` (список всех совпадений cargo↔vessel) перенаправляет на `/dashboard` вместо показа списка. Пользователь не может видеть историю матчей. Единственный способ добраться до матча — через dashboard виджет.

**Рекомендация:** Починить роутинг. Создать `/matches` страницу со списком всех Match записей или убрать ссылку из навигации.

---

### 🔴 F3 — `/recap/[id]` возвращает 404 (HIGH)
Маршрут `/recap/[id]` заявлен в router и в плане, но страница не существует (404). Судя по всему, функционал был переименован в `/fixture/[id]`. Если где-то в UI есть ссылки на `/recap/`, они ведут в никуда.

**Рекомендация:** Проверить наличие ссылок на `/recap/` в коде и заменить на `/fixture/`, либо добавить redirect.

---

### 🟡 F4 — Рыночные данные устарели на 3 недели (MEDIUM)
Страница `/market` показывает индексы BHSI/TMI/DREWRY-BB, но последнее обновление — **2026-04-21**. В `/admin/knowledge` источник "Baltic Dry Indices (TradingEconomics)" имеет статус `never_synced`. Для демо-продукта, позиционирующегося вокруг актуальных данных — это видимый недостаток.

**Рекомендация:** Настроить cron-синхронизацию knowledge sources (TradingEconomics API или альтернатива). Или убрать /market из демо-навигации до настройки синхронизации.

---

### ⚪ F5 — Три фичи отключены env флагами (LOW-MEDIUM)
`/psc`, `/vessels/[imo]/psc-history`, `/commission` — либо показывают "Feature Not Enabled", либо пустые данные. PSC страницы требуют `NEXT_PUBLIC_PSC_ENABLED` и `NEXT_PUBLIC_PSC_DETENTION_ENABLED`. Для демо-сессии с клиентами эти "дыры" создают впечатление незавершённого продукта.

**Рекомендация:** Либо скрыть эти пункты из навигации (условный рендер по флагу), либо активировать на demo-стенде с тестовыми данными.

---

## Что работает хорошо (для triage)

- **`/fixture/[id]`** — флагманская фича. AI-парсинг charter party полностью функционирует: 8+ полей с ✅, красивый structured output.
- **`/laytime`** — полноценный калькулятор, Parse SOF — хорошая демо-точка.
- **`/charterers`** — blue-chip база, выглядит профессионально.
- **`/summary`** — "157 emails, 4.3h/day saved" — убедительная ROI-метрика для демо.
- **`/dashboard`** — богатый, работает быстро, expandable sections — хороший первый экран.

---

## Рекомендации для triage (Task 3.2)

| Приоритет | Задача |
|-----------|--------|
| P0 | Починить VPS crash в AI-pipeline (/processing 502) |
| P1 | Починить /matches redirect → реальный список |
| P1 | Проверить и убрать/редиректить /recap/ ссылки |
| P2 | Запустить sync Baltic Dry Indices в /admin/knowledge |
| P3 | Скрыть PSC/commission из навигации если флаги OFF, или включить на demo |

---

*Скриншоты:* `docs/audits/screenshots-2026-05-13/`  
*Не коммитить — оркестратор коммитит отдельно.*
