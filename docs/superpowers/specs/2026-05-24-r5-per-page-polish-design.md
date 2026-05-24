# R5 — Per-Page Polish Pass (Design Spec)

**Дата:** 2026-05-24
**Parent:** §5a (10 brainstormed screens + 13 pattern-applied) + per-screen specs
**Depends:** R1 (primitives), R2 (AppShell), R3 (AIBar+⌘K), R4 (LiveStrip)

## 1. Цель

Применить **design-system + fixed layout patterns из §5a** ко всем ~22 страницам. Никаких новых layout-решений. Каждая страница:
1. Импортит из `design-system/primitives/` и `design-system/patterns/`
2. Использует Maritime Deep токены (`bg-ds-bg`, `text-ds-text`, etc.)
3. Применяет зафиксированный паттерн (table-first / split / form-first / etc.)
4. Получает mobile-companion variant (bottom-sheet, swipe-style, etc.)
5. Empty-state per §5a

## 2. Декомпозиция (5 параллельных subagents)

| Wave | Pages | Subagent | ETA |
|---|---|---|---|
| **R5a** | Dashboard + Matches | sub1 | 2-3 дня |
| **R5b** | Match detail + Cargo + Vessels | sub2 | 2-3 дня |
| **R5c** | Charterers + Market + Recap | sub3 | 2-3 дня |
| **R5d** | Email + Onboarding + Upgrade | sub4 | 2-3 дня |
| **R5e** | Apply patterns (Laytime/PSC/Commission/Clauses/Request/Processing/Summary/More/Vessel/Fixture) — bulk | sub5 | 2-3 дня |
| **R5f** | Landing public page + Settings | sub6 | 1-2 дня |

Wave может стартовать параллельно после R1-R4 merged. ≤3 active dispatch на root@.

## 3. Pattern reference (из главного spec §5a)

| Page | Pattern | Key elements |
|---|---|---|
| Dashboard | Agenda-first + KPI strip | 4 KPI tiles top + 3 sections (To-do/Matches/Inbox) |
| Matches | Table-first + Cards/Table toggle | LiveStrip (R4) + filter chips + sort + density toggle |
| Match detail | Split + sticky AI side-panel | Tabs Overview/Economics/Quote/Conversation + 220px right-panel |
| Cargo+Vessels | Table + AI-add bar + side-modal | AI parse-bar top + table + click→side panel |
| Charterers | Table + Last-snippet + HOT/WARM/COLD | Table-style same as Cargo + colored status column |
| Market | Multi-section digest + drill-down | KPI tiles + Routes + Fixtures + Knowledge; click → focused chart |
| Recap | Form-first + AI assist + Sources panel | Structured form + AI fill + sources side-panel + "Generate full text" |
| Email | Stream of action-cards + 📄 Original button | Card per email + parsed fields + Accept/Edit/Reject + modal |
| Onboarding | Pre-loaded demo + banner + auto-detect mode | DEMO badge + sticky "Connect Gmail" + auto-mode |
| Upgrade | Usage-aware inside + landing for "See all plans" | current plan + usage bars + contextual upgrade + link to /upgrade/plans |
| Landing public | Product-demo hero + features + pricing pill | Live LiveStrip demo embed + 3 feature cards + 3 pricing pills |
| Settings | Sidebar + content | 10 sections, default = Integrations, anchor URLs |
| Notifications | Bell dropdown only (MVP) | Bell in TopNav → popup; full page YAGNI |
| Help/Docs | AI chat-help floating (R3 уже сделал HelpFAB) | — R3 |
| Laytime | Form-first + AI assist | Apply Recap pattern (forms+sources panel) |
| PSC | Table-first | Apply Cargo pattern |
| Commission | Table + side-modal | Apply Cargo pattern |
| Clauses | Table + side-modal (rich edit) | Apply Cargo pattern |
| Request | Form-first + AI suggests | Apply Recap pattern |
| Processing | LiveStrip-like full-page | Apply LiveStrip variant |
| Summary | Read-only digest | Apply Market section pattern |
| More | Simple drawer-style links | Native list |
| Vessel detail | Split + AI side-panel (read-only) | Apply Match-detail pattern |
| Fixture | Read-only Recap view | Apply Recap pattern (no edit) |

## 4. Claude Design user-loop (опционально)

**При желании user может полировать pixel-perfect ДО кода:**
1. User открывает Claude Design (claude.ai web)
2. Промпт: "Quantika /matches Maritime Deep palette navy+amber, table 12 rows, LiveStrip top, ..."
3. Итерирует 2-3 раза → export PNG
4. Кидает PNG в чат
5. Orchestrator добавляет PNG в handover для R5x subagent'а
6. Subagent ships pixel-perfect против reference

Loop: ~30 мин на page вместо blind-imp ~3ч.

**Без user-loop:** subagent работает по spec text-only — окей для большинства pages, для ключевых (Dashboard, Match detail) рекомендуется loop.

## 5. Migration rules

- НЕ ломать существующие routes/URLs
- НЕ удалять старые `components/ui/*` пока (R5 финал удалит после миграции последней страницы)
- НЕ менять backend API
- Existing tests must continue PASS (jest + Playwright regression)
- Each page migration = own commit + own visual baseline

## 6. Per-page checklist (для каждого subagent на page)

- [ ] Read current page file, document existing components/imports
- [ ] Replace `components/ui/*` → `design-system/primitives/*` где есть аналог
- [ ] Apply layout pattern из §3 этого spec'а
- [ ] Add Maritime Deep tokens (`bg-ds-*`, `text-ds-*`)
- [ ] Apply useMode() для mode-aware copy/sort/columns
- [ ] Add mobile variant (768px breakpoint)
- [ ] Empty-state per §5a (или Skeleton + sample-fixture)
- [ ] Visual regression baseline updated
- [ ] axe a11y 0 violations
- [ ] Existing tests still green
- [ ] Commit `feat(r5x): polish /pagename to design-system`

## 7. Files (per page ~3-5 modifications)

**Modified:**
- `app/<page>/page.tsx` / `<page>Client.tsx`
- Component files specific to page
- Page-level test files (если требуется update)
- `tests/visual/pages/<page>.spec.ts` (new visual baseline)

**No deletes** — старые `components/ui/*` removed только в R5-final.

## 8. R5-final task (после всех waves)

- Identify pages still using `components/ui/*`: `grep -rl 'components/ui/' app/`
- If 0 left → delete `components/ui/*`, `git rm`, commit `chore(r5-final): remove deprecated shadcn ui components`
- If >0 left → file QUESTIONS.md, escalate

## 9. Out of scope

- New layout decisions (зафиксированы в §5a)
- Backend API changes
- Bus logic, matching, parsers
- Admin pages (low priority, defer)
- Dark mode (R6)

## 10. Risks

| Risk | Mitigation |
|---|---|
| Migration breaks page silently | Each page = own visual snapshot baseline; CI diff catches |
| Parallel waves conflict в `package.json` / `tailwind.config` | R5 не меняет shared config (только R1 могла) |
| Subagent over-zealous «cleanup» (см. R1 lessons) | Explicit constraint в handover: "ONLY apply token swap + pattern; NO other refactor" |
| Different subagents inconsistent results | Pattern table (§3) — ground truth; QA gate per wave |

## 11. Success criteria

- All 22 pages use design-system primitives + tokens
- Every page имеет mobile variant
- Visual regression baselines for all migrated pages
- axe 0 violations per page
- `components/ui/*` deleted (R5-final)
- Existing tests + new visual all green
