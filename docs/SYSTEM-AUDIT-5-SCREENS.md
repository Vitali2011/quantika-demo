# Аудит системы — Часть 5/5: ЭКРАНЫ

> 2026-06-05. 5 read-only Sonnet-разведчиков (доска / карточка / дашборд+списки / выгрузки+действия / рендеринг+auth), A→Z + проверка компонентов.
> Ветка `feat/bunker-oilmonster-med-blacksea`.

---

## ГЛАВНЫЙ ВЫВОД (5 тем)

1. **Кнопки-обманки.** Несколько действий ВЫГЛЯДЯТ рабочими, но заглушки — риск для сделки: **Send Quote = только toast** (брокер думает «квота ушла», клиент ничего не получил); **Counter offer** = пишет в БД, наружу не уходит; **Save Draft** = sessionStorage без восстановления; **agent send-email = noop**; Import CSV/New Vessel/AI-Parse = стабы без onClick.
2. **Заморозка протекает в UI.** Сервер+ClockProvider заморожены (Часть 4 — solid), НО 2 клиентских места используют реальное `Date.now()`: `formatAge` (возраст матча) и `PriceSourceBadge` (флаг устаревания) → в demo показывают реальное время, не замороженное. Заморозка ~95%, не 100% на краю UI.
3. **Auth-bypass кластер (подтверждён в 3-й раз, 5 путей).** `/api/sample` + `/api/auth/google` + `/api/market/{eua-kpi,tmi,indices}` НЕ в bypass → на demo.quantika.org «Try sample data», «Connect Gmail» и виджеты рынка отдают 401. Корень #667. XS-фикс, критичный эффект.
4. **Выгрузки тонкие.** CSV работает, но только 9 базовых колонок (нет vessel_name/fit%/TCE/dwt/laycan — бесполезно для Excel). PDF-код есть (`recap-pdf.ts`), но не подключён к роуту. Excel нет. «Что наружу» = тонкий CSV + AI-черновики копипастом.
5. **#819 в UI: остаточный вектор.** EconomicsTab принимает `storedTceUsdPerDay`, но НЕ отображает; показывает live-пересчёт по `readiness.distanceNm` (балластное плечо) ≠ laden-дистанция БД. #829 унифицирует ФОРМУЛУ дней, но вход-ДИСТАНЦИЯ в карточке всё равно балластная → возможно остаточное расхождение. **Watch-item для приёмки #829.**

**ПОЧИНЕНО:** #786 (hash-имена судов) — fixed коммитом `19e63901`, `/vessels` показывает реальные имена.

---

## ПОУЗЛОВОЙ ВЕРДИКТ

| Узел                     | Вход | Выход | Цел. | Главная боль                                                                           |
| ------------------------ | ---- | ----- | ---- | -------------------------------------------------------------------------------------- |
| **1. Доска**             | ✅   | ✅    | ⚠️   | fmtTce негатив `$-1.1k`; neg-TCE на доске; SSE-refresh теряет dedup/laycan_display     |
| **2. Карточка**          | ✅   | ✅    | ⚠️   | #671 карта не подключена; #819 distance-вектор; storedTce prop не используется         |
| **3. Дашборд+списки**    | ✅   | ✅    | ⚠️   | #667 sample-data; стабы (Import CSV/Parse); persistSessionMatches-on-render            |
| **4. Выгрузки+действия** | ✅   | ⚠️    | ❌   | Send Quote/Counter/Save Draft — обманки; CSV тонкий; нет PDF/Excel                     |
| **5. Рендеринг+auth**    | ✅   | ✅    | ⚠️   | 5 auth-bypass дыр; frozen-clock UI-протечки; Sentry #668; нет error.tsx на 6 страницах |

---

## 1. ДОСКА `/matches`

RSC грузит `listMatches(sortBy:score)` → dedup → resolveLaycanDisplay → клиент пересортировывает (fit charterer / tce owner). **Fit≥60 floor ЕСТЬ в UI** (`MatchesClient.tsx:340`, #789). Вкладки review/insuf — из session-blob (toBucketRows, отриц. id).
**Проблемы:** `fmtTce` негатив `$-1.1k` (не `-$1.1k`); cards vs table формат TCE рассинхрон; TCE=0 dimmed (выглядит как отсутствие); SSE-refresh теряет dedup + laycan_display; empty-state #673 без CTA; owner col2 показывает только cargo_type; вкладки review/insuf — dead code (нет кнопки переключения); neg-TCE рендерится на доске.

## 2. КАРТОЧКА `/match/[id]`

Без сессии: hero + Vessel/Cargo карточки + MatchWorksheet (из stored). С сессией: + 4 вкладки (Vessels/Economics/Passport/Quote). Graceful degrade при протухшей сессии.
**Проблемы:** #671 карта (`RouteMapButton` существует, не импортирован нигде); #819 distance-вектор (EconomicsTab live-TCE по ballast-дистанции); `storedTceUsdPerDay` prop принят но мёртв; #666 Send Quote stub; ExplainDeal двойной флаг (server `EXPLAIN_DEAL_ENABLED` vs client `NEXT_PUBLIC_…`) → silent null; PassportTab «Demo data» badge вшит навсегда; bunker-port null до async-ответа блокирует P&L.

## 3. ДАШБОРД + СПИСКИ + ЛЕНДИНГ + РЫНОК

Дашборд: session-blob + persistSessionMatches-on-render + listMatches. KPI BDI/BHSI в bypass (работают). Cargo/Vessels: session.parsed\*. Laycan «Spot» рендерится корректно (detectSpot). Market: client-only, auth-gated (аноним → 302).
**Проблемы:** #667 sample-data 401; cargo refYear по реальным часам (не frozen — minor); persistSessionMatches-on-render bloat; TMI/Drewry графики тихо пусты (market_indices=0); VesselsClient Import CSV/New Vessel — стабы; Cargo AI-Parse «Parse» — стаб; session↔board sync gap (board пуст до первого визита дашборда).

## 4. ВЫГРУЗКИ + ДЕЙСТВИЯ

| Действие                    | Статус                           | Файл                         |
| --------------------------- | -------------------------------- | ---------------------------- |
| CSV export                  | ✅ FUNCTIONAL (но 9 колонок)     | `matches-csv.ts:3`           |
| Generate Quote              | ✅ LLM-черновик                  | `QuoteTab.tsx:36`            |
| **Send Quote**              | ❌ STUB (toast)                  | `QuoteTab.tsx:33`            |
| Save Draft                  | ⚠️ sessionStorage, нет restore   | `QuoteTab.tsx:26`            |
| Counter offer               | ⚠️ пишет DB, нет downstream      | `CounterModal.tsx:39`        |
| Explain deal                | ⚠️ flag-gated (двойной флаг-баг) | `ExplainDealModal.tsx:65`    |
| Draft Reply / clipboard     | ✅ FUNCTIONAL                    | `recap-actions.tsx:18`       |
| Status save/dismiss/archive | ✅ FUNCTIONAL                    | `MatchesClient.tsx:228`      |
| PDF                         | ❌ ABSENT (код есть, не wired)   | `lib/voice/recap-pdf.ts:17`  |
| Excel                       | ❌ ABSENT                        | —                            |
| agent send-email            | ❌ noop                          | `lib/agent/plan-first.ts:57` |

**3 критические обманки:** Send Quote (toast), Counter (нет наружу), Save Draft (теряется) — брокер думает действие выполнено, оно нет.

## 5. РЕНДЕРИНГ + AUTH + ГРАНИЦЫ

Чистый RSC-shell + Client-leaf паттерн (искл.: psc-history full-client с fetch). ClockProvider/useDemoNow корректны (no #418). Loading.tsx есть; error.tsx — НЕ на cargo/vessels/email/market/match.
**Проблемы:** **5 auth-bypass дыр** (`/api/sample`, `/api/auth/google`, `/api/market/{eua-kpi,tmi,indices}`); `formatAge`+`PriceSourceBadge` real-clock в demo; Sentry POST на каждую навигацию #668 (если DSN задан, нет beforeSend-фильтра); empty-state #673; SSE refetch тихо падает на 401; нет error.tsx на 6 страницах.

---

## РЕАЛЬНЫЕ БАГИ (UI)

1. **auth-bypass 5 путей** (#667) — demo-вход + market мертвы. XS, критично.
2. **Send Quote/Counter/Save Draft обманки** — credibility. S каждый.
3. **frozen-clock UI-протечки** (formatAge/PriceSourceBadge). S.
4. **#819 distance-вектор в EconomicsTab** — watch для #829. S.
5. **CSV тонкий + PDF не wired + нет Excel**. S-M.
6. **#671 карта не подключена**. S.
7. **Sentry #668 navigation-noise**. S.
8. **fmtTce негатив + empty-state #673**. XS.

**По дизайну:** RSC/Client паттерн чистый; degrade при протухшей сессии graceful; fit≥60 в UI; «Demo data» badge намеренно.
