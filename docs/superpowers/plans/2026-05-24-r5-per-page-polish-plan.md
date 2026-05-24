# R5 — Per-Page Polish Pass · Master Plan

> **For agentic workers:** Этот plan — **master coordinator**, конкретные waves R5a-R5f имеют свои task'и (генерируются динамически orchestrator'ом из §3 main spec'а). Каждая wave = отдельный dispatch с `subagent-driven-development`.

**Goal:** Применить design-system + fixed layouts (§5a) на все ~22 страницы. ~6 wave'ов × 2-3 дня = ~10-15 рабочих дней с параллелизмом.

**Spec:** [r5-per-page-polish-design.md](../specs/2026-05-24-r5-per-page-polish-design.md)
**Depends:** R1, R2, R3, R4 (все merged)
**Tier:** L (master) / M (per wave) · ~22 страниц + ~80 файлов суммарно

---

## Pre-flight (orchestrator)

- [ ] **0.1** Verify R1-R4 merged: `git log --oneline origin/main | grep -E 'R[1-4]:' | head`
- [ ] **0.2** Create master branch для tracking: `git checkout -b design/r5-master`
- [ ] **0.3** Run grep audit для current usage: `grep -rl 'components/ui/' app/ | sort > /tmp/r5-pages-to-migrate.txt`

---

## Wave R5a — Dashboard + Matches

**Branch:** `design/r5a-dashboard-matches`
**Subagent prompt:**

```
Goal: Migrate app/dashboard/* and app/matches/* to design-system + Maritime Deep tokens + chosen patterns (Agenda-first + KPI for Dashboard, Table-first toggle for Matches).

CONSTRAINTS:
- Use ONLY design-system/primitives/* and design-system/patterns/* (no shadcn for new code).
- Maritime Deep tokens (bg-ds-*, text-ds-*).
- LiveStrip уже работает в Matches (R4) — НЕ переделывать, только применить новые tokens + filter chips + sort + density toggle.
- Dashboard: KPI strip 4 tiles top (Open matches / Active cargoes / BDI / HSS rate) + 3 sections (To-do / Recent matches / Inbox).
- Matches: Cards/Table toggle in filter bar; Table default desktop, Cards default mobile.
- Mode-aware via useMode() (charterer vs owner column order).
- Mobile variants: Dashboard stacked sections, Matches Cards.
- Visual baseline per page; axe a11y 0 violations.
- Existing tests must stay green.
- NO bus logic changes.

OUTCOME: 2 PRs (one for dashboard, one for matches) OR 1 combined PR. Each with visual baseline + a11y test.
```

ETA ~2-3 дня. NO auto-merge.

---

## Wave R5b — Match detail + Cargo + Vessels

**Branch:** `design/r5b-match-cargo-vessels`
**Subagent prompt:**

```
Goal: Migrate /match/[id], /cargo, /vessels.

PATTERNS:
- Match detail (/match/[id]): Split layout + sticky AI side-panel (220px right). Tabs Overview/Economics/Quote/Conversation. Mobile → bottom-sheet for side-panel.
- Cargo + Vessels: Table-first + AI-add bar top + click-row → side-panel detail. SAME pattern for both, differ only in columns/fields.

CONSTRAINTS same as R5a. AI-add bar wires to existing /api/email/parse or /api/cargo/parse.

3 pages migrated. ETA 2-3 дня.
```

---

## Wave R5c — Charterers + Market + Recap

**Branch:** `design/r5c-charterers-market-recap`

```
Goal: 3 pages.

PATTERNS:
- Charterers: Table (как Cargo) + extra cols Last-snippet + HOT/WARM/COLD coloring (cell-bg).
- Market: Multi-section digest (KPI tiles + Routes + Fixtures + Knowledge) + click → drill-down focused chart.
- Recap: Form-first + AI assist (fill/missing-highlight) + Sources panel right + "Generate full text" button.

ETA 2-3 дня.
```

---

## Wave R5d — Email + Onboarding + Upgrade

**Branch:** `design/r5d-email-onboarding-upgrade`

```
Goal: 3 pages.

PATTERNS:
- /email: Stream of action-cards с parsed fields, Accept/Edit/Reject/📄 Original, low-confidence highlighted amber.
- /onboarding: Pre-loaded demo data + persistent banner "Connect Gmail (1 OAuth)" + mode auto-detect on first real email.
- /upgrade: Usage-aware inside product (current plan + usage bars + contextual upgrade prompt). Plus separate /upgrade/plans for classic 3-tier landing (linked from "See all plans").

ETA 2-3 дня.
```

---

## Wave R5e — Apply patterns (bulk minor pages)

**Branch:** `design/r5e-bulk-pattern-apply`

```
Goal: 10 pages — apply already-decided patterns без brainstorm.

| Page | Pattern |
|---|---|
| /laytime | Recap-style (form + AI + sources) |
| /psc | Table-first (как Cargo) |
| /commission | Table + side-modal (Cargo) |
| /clauses | Table + rich-text side-modal |
| /request | Form-first + AI suggests |
| /processing | LiveStrip-like full-page |
| /summary | Read-only digest (Market mini) |
| /more | Simple drawer-style links |
| /vessel/[id] | Split + AI side-panel (Match-detail read-only) |
| /fixture | Read-only Recap view |

CONSTRAINTS: bulk-style, не пиши full custom UI — copy-and-adapt из other R5 waves. 10 pages × ~30 min each = ~5h.
```

ETA 2-3 дня.

---

## Wave R5f — Landing + Settings (NEW route)

**Branch:** `design/r5f-landing-settings`

```
Goal: 2 large new pages.

LANDING (app/page.tsx, public):
- Product-demo hero: live LiveStrip demo embedded (DEMO badge)
- Features strip (3 icons)
- Pricing pills (3, link to /upgrade)
- Trust logos
- Footer

SETTINGS (app/settings/* — NEW route):
- Sidebar (~10 разделов): Profile / Password & 2FA / Notifications / Integrations / Team / API & webhooks / Plan & usage / Payment / Invoices / Export / Danger
- Default = Integrations
- URL anchors: /settings/integrations, /settings/billing, etc.
- Each section = own component (extract to design-system/patterns/settings/* OR app/settings/_components/*)

ETA 1-2 дня.
```

---

## R5-final: Cleanup deprecated components

**Branch:** `design/r5-final-cleanup`

- [ ] Audit: `grep -rl 'from .components/ui/' app/`. Expected: 0 lines.
- [ ] If 0: `git rm -r components/ui/`. Commit `chore(r5-final): remove deprecated shadcn ui components — design-system fully adopted`.
- [ ] If >0: file QUESTIONS.md per remaining usage, escalate.
- [ ] Update `tailwind.config.ts`: remove old `--background`, `--primary` etc. token colors (keep only `ds.*`).
- [ ] Smoke test main pages. PR + admin-merge.

---

## Success criteria

- All 22 pages use design-system primitives + Maritime Deep tokens
- Mobile variants for each
- Visual regression baselines updated for all pages
- axe 0 violations
- `components/ui/*` deleted
- Existing tests + new visual all green
- Living docs/ROADMAP-CURRENT-STATE.md updated

## Out of scope

- Bus logic changes
- Backend API changes
- Admin pages (defer)
- Dark mode (R6)
