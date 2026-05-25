# QA Walker — R1-R6 Maritime Deep prod audit

**Дата:** 2026-05-25
**Target:** https://demo.quantika.org (prod, HEAD `d6182b5`)
**Виконавець:** /qa-walker (Claude Sonnet 4.6, оновлений під R1-R6 design)
**Сесія:** перший прогін після оновлення скілла під новий дизайн

---

## TL;DR

R1-R6 design-system **базово працює** (ds-* токени активні, ModeSwitcher реактивний, ⌘K palette з 3 секціями, /design gallery рендерить 10 секцій примітивів). Але **критичний баг**: `/matches` і `/dashboard` показують RSC skeleton назавжди — серце продукту (matches view) недосяжне через UI. Плюс `/market` і `/vessels` крашаться з chunk load error на module 964893.

**Filed: 6 issues (1 critical, 4 high, 2 low).** Detailed list at the bottom.

---

## Phase 2 — Mechanical (14 з 20 перевірено, 6 заблоковано через crashes/skeleton)

| # | Сторінка / дія | Результат | Деталі |
|---|---|---|---|
| 1 | `/` public landing | ✓ PASS | hero, 3 feature icons (Read-only/Data deleted/No storage); pricing pill і trust-logos відсутні (не критично) |
| 2 | `/login` submit | ✓ PASS | single-password form, redirect ✓ |
| 3 | `/dashboard` Agenda+KPI | ✗ **BUG #450** | RSC skeleton назавжди, main innerText="" |
| 4 | AppShell completeness | ⚠ partial | TopNav ✓ ModeSwitcher ✓ AIBar ✓ HelpFAB ✓ Bell ✗ |
| 5 | More dropdown | ✓ PASS | 8 items: Charterers/Recap/Laytime/PSC/Commission/Clauses/Email/Settings |
| 6 | ModeSwitcher Charterer↔Owner | ✓ PASS | URL `?mode=owner`, aria-pressed, AIBar placeholder "груз"→"судно", без reload |
| 7 | ⌘K palette | ✓ PASS | dialog opens, 3 sections (Actions/Navigate/Recents), input `bg-ds-surface`, ESC closes |
| 8 | AIBar suggestion | (не тестовано) | відкласти |
| 9 | `/matches` open | ✗ **BUG #450** | RSC skeleton, template B:0 не resolved, 0 API calls до app |
| 10-13 | Filter/sort/click/TCE | блоковано | matches не рендерять |
| 14 | `/cargo` table+AI-add bar | ✓ PASS | 80 rows, placeholder "Paste email from broker…", Parse/+New cargo buttons |
| 15 | `/vessels` | ✗ **BUG #452** | "Something went wrong", chunk `03xok7g1r9~wq.js` from module 964893 |
| 16 | `/market` | ✗ **BUG #451** | "Something went wrong", chunk `0o0~2z7h_.~tn.js` from module 964893 |
| 17 | `/recap` form+sources | ✓ PASS | "Negotiation Recap", AI Assist, Sources, Summary; textarea з `rounded-ds-md border-ds-border bg-ds-surface`; Generate recap / Export PDF / Send email |
| 18 | `/email` action-cards | ✓ PASS | "Email Inbox", повторні Accept/Edit/Reject buttons (>4 карток) |
| 19 | `/settings` sidebar | ✓ PASS | redirect → /settings/integrations (default), 11 sections: Profile/Password/Notifications/Integrations/Team/API/Billing/Payment/Invoices/Export data/Danger zone |
| 20 | Logout | ✗ **BUG #453** | logout button відсутній всюди (TopNav, More, Settings, Danger zone тільки "Delete account"); /api/auth/signout → 404 |

---

## Phase 2.5 — Broker Reality Check (заблоковано)

Всі 6 sub-checks заблоковані через #450 — матчі не рендерять, broker semantic перевірка неможлива.

| # | Sub-check | Результат |
|---|---|---|
| 2.5.1 | Match viability top-5 | BLOCKED (matches don't render) |
| 2.5.2 | Score sanity #1 vs #4 | BLOCKED |
| 2.5.3 | Parser correctness | SKIP (no fixture surface visible) |
| 2.5.4 | RAG hallucination check | SKIP (HelpFAB не протестовано глибоко) |
| 2.5.5 | Market data freshness | BLOCKED (/market crashes) |
| 2.5.6 | Ingestion latency | SKIP (intake не wired для цієї сесії) |

---

## Phase 2.6 — Design Regression Check

| # | Sub-check | Результат |
|---|---|---|
| 2.6.1 | `/design` gallery baseline | ✓ **PASS** — 10 H2 sections (Tokens·colors / Button / Form / Badge & Pill / Card / Skeleton / Avatar / Tabs / Overlays), Primary/Secondary/Ghost/Danger button variants, 111 ds-* token usages vs 9 legacy (всі — Skeleton demo приклади); 32 color swatches |
| 2.6.2 | AppShell completeness | ✗ FAIL — Bell missing (#455) |
| 2.6.3 | ModeSwitcher + ⌘K | ✓ **PASS** |
| 2.6.4 | LiveStrip behavior | BLOCKED (#450) |
| 2.6.5 | Per-page patterns | ✓ /recap split+sources ✓ /email action-cards ✓ /settings sidebar; /match/[id] не перевірено |
| 2.6.6 | Mobile + tokens | ⚠ BottomNav є з `bg-ds-surface border-ds-border`, але 4 items = Dashboard/Matches/Vessels/More замість Matches/Cargo+Vessels/AI/More (#456) |

---

## Bugs filed (GitHub Issues)

| Issue | Severity | Page | Title |
|---|---|---|---|
| [#450](https://github.com/Vitali2011/quantika-demo/issues/450) | **critical** | /matches + /dashboard | RSC streaming boundary never resolves — skeleton forever |
| [#451](https://github.com/Vitali2011/quantika-demo/issues/451) | **high** | /market | Chunk load failure module 964893 |
| [#452](https://github.com/Vitali2011/quantika-demo/issues/452) | **high** | /vessels | Chunk load failure module 964893 (same module, different chunk) |
| [#453](https://github.com/Vitali2011/quantika-demo/issues/453) | **high** | AppShell | Logout button missing from all UI surfaces |
| [#454](https://github.com/Vitali2011/quantika-demo/issues/454) | **high** | /login redirect | Post-login → / (public landing) instead of /dashboard |
| [#455](https://github.com/Vitali2011/quantika-demo/issues/455) | **low** | AppShell | Bell notifications icon missing from TopNav |
| [#456](https://github.com/Vitali2011/quantika-demo/issues/456) | **low** | Mobile BottomNav | Missing AI icon, wrong 4th slot (Dashboard замість Cargo+Vessels combined) |

---

## Що працює добре (positive findings)

- **Design system live:** `ds-*` токени всюди де перевіряв (`bg-ds-surface`, `border-ds-border`, `text-ds-text`, `rounded-ds-md`, `duration-ds-fast`, `bg-ds-accent`). Майже немає legacy shadcn leak на R5-migrated сторінках.
- **ModeSwitcher повністю реактивний:** URL `?mode=`, aria-pressed, AIBar placeholder, no full reload — exactly per spec §3.3.
- **⌘K palette:** keyboard shortcut working, dialog with 3 sections (Actions/Navigate/Recents), ESC closes — per spec §3.4.
- **/design gallery — solid baseline:** всі 10 розділів примітивів (Button × variants × sizes, Form, Badge & Pill, Card, Skeleton, Avatar, Tabs, Overlays, Tokens·colors), 32 swatches.
- **Per-page patterns коректні:** /recap form-first+Sources ✓, /email action-cards ✓, /settings sidebar з 10+ sections ✓, /cargo table+AI-add bar ✓.

---

## Priority order для фіксу

1. **#450** (critical) — RSC skeleton — без цього неможливо тестувати matches/dashboard, broker flow повністю зламаний.
2. **#454** (high) — post-login redirect — користувач після логіну бачить landing замість дашборда.
3. **#451 + #452** (high) — chunk load failures — швидше за все одне build-фікс, бо module 964893 однаковий.
4. **#453** (high) — logout missing — UX gap.
5. **#455** (low) + **#456** (low) — Bell + BottomNav — non-blocking.

---

## Скілл /qa-walker — own feedback

**Що спрацювало в оновленому скіллі:**
- Знання R1-R6 (AppShell elements, ds-* tokens, per-page patterns) дозволило одразу класифікувати чого не вистачає (Bell, AI icon, redirect destination).
- ds-* vs legacy heuristic спрацювала.
- Phase 2.6 sub-checks дали структурований чеклист дизайн-регресій.

**Що варто додати в наступну ітерацію скілла:**
- Console MCP не захоплює messages до того як інструмент вперше викликаний — додати в скілл preflight «викликати read_console_messages одразу після tabs_context_mcp до першої навігації».
- /matches RSC streaming hang може бути типовою проблемою — додати в bug criteria explicit «template id="B:N" не replaced після 10s» як `critical` тригер.
- Logout test потребує fallback: якщо UI кнопки немає → перевірити `/api/auth/signout`, `/api/logout`, document.cookie cleanup. Зараз скілл просто констатує fail.
- Chunk load failures (`Failed to load chunk`) варто винести як окремий клас A.X у Bug Criteria.

---

🤖 Filed by /qa-walker on 2026-05-25.
