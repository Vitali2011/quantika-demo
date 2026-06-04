# QA-Walker Report — 2026-06-04

**Source:** `/qa-walker` full run, prod `https://demo.quantika.org` (fresh session, deep-verified via browser).
**For:** orchestrator-day intake. Open issues are labelled `qa-walker` → pick up via `gh issue list --label qa-walker --state open`.

**Snapshot:** 14 open · 15 closed today · no critical/blocker. Remaining = 3 substantive (root + downstream) + polish.

---

## Recommended dispatch order (root-first, ≤3 per activation)

| Wave | Issues                              | Why first                                                                                                                                              | Gates                                                                                                                                                              |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | **#791** (ROOT) → unblocks **#792** | parsed cargo weight dropped before fit/economics → cascades into bad fits + false "not stated" → false overload verdicts (#792). Fix the wire-up once. | Gate-0 TRACE (`parsed-weight → fit/economics consumers`), risk-override #5 (data) ⇒ ≥Tier M + `/test-skill`. HIGH-RISK (parse/economics) → founder hold on accept. |
| 2    | **#665**                            | match-detail laycan wrong (detail `Jul 4-9` vs cargo/list `Jun 2-7`) — data-correctness, broker-facing.                                                | Gate-0 TRACE laycan source. Likely display/parse.                                                                                                                  |
| 3    | **#810 #811 #812** (polish bundle)  | low-sev display/i18n, safe to batch.                                                                                                                   | standard pre-merge-check; non-high-risk → auto-accept eligible.                                                                                                    |

After each merge → auto-deploy + smoke → park in `## Pending User Prod-Check` → qa-walker deep-verifies → `сдано <pr#>` / `не работает <pr#>`.

---

## OPEN (14)

### 🔴 High — root / data correctness

- **#791** — ROOT: parsed cargo weight not wired into fit/economics (shows "weight not stated" though it IS parsed). _Confirmed vividly 2026-06-04: quote draft + `/cargo` both carry the weight (186 MT / 1920 CBM); fit breakdown says "not stated, scored conservatively" on 3 factors._
- **#665** — `/match/[id]` laycan dates wrong (detail `Jul 4-9` vs cargo/list `Jun 2-7`). _Reproduced 2026-06-04._
- **#792** — size-infeasible match shown as "Possible" (cargo weight > vessel DWT). _Downstream of #791._

### 🟡 Medium — matching logic / navigation

- **#784** — commercially absurd pairings scored "Possible" (tiny ship, war-zone reposition, transatlantic).
- **#787** — duplicate match on main board (SEAGULL 48 shown twice). _May already be deduped on the board — re-verify before fixing._
- **#671** — `/match/[id]` map panel missing from left column (spec: Vessel/Cargo/Map).
- **#667** — landing `/` "Try with sample data" POST redirects to `/login` instead of seeding.

### 🟢 Low — polish

- **#810** 🆕 — `/vessels` OPEN POSITION truncates port names to 4 chars (MARM/TEIG/CONT) while detail shows full name. _abbrPort fix #794/#808 missed this column; data is correct._
- **#811** 🆕 — `/match` Economics "Rate (USD/mt)" input shows comma decimal `1731,18` (label above uses dot).
- **#812** 🆕 — `/match` Quote draft greeting "Dear contact1," leaks anonymization token into customer-facing text.
- **#793** — parse-quality outlier (81 CBM on 2,570 DWT; weight shown unit-less).
- **#673** — `/matches` empty state missing LiveStrip hint / sample-data fallback.
- **#668** — Sentry POSTs on every page load without user action (2-3 per navigation).
- **#666** — Generate Quote **works** now ✓; "Explain this deal" not click-tested → kept open until verified (partial).

🆕 = filed in this run (2026-06-04).

---

## CLOSED today (15) — verified fixed on prod

- **Loop (night):** #804 #805 #806 #807 — list-TCE÷detail divergence, −$102,352, null vessel name, list polish.
- **Matching campaign:** #782 #783 #785 #786 #788 #790 — negative TCE, fit-vs-economics, abbrPort, hash-as-name, Russian text, session durability.
- **This run:** #664 (market loads) · #669 (⌘K English) · #670 (EUA present) · #672 (cargo/vessels tables render) · #789 (Fit≥60 floor on board).

---

## Candidates — founder decision (NOT filed; need broker judgment)

1. **War-risk ignores ballast leg** — SEAGULL 12 open at Hodeidah (Yemen / Red Sea), ballasts ~1978 nm to Marmara; Economics shows "No JWC war risk zones · War Risk $0". Defensible if only the laden leg (Marmara→Veracruz) counts; a broker would weigh the Red-Sea ballast transit.
2. **Daily TCE $774 vs Net Voyage $151,479** — implied denominator ≈195 days for this voyage. Possibly round-trip/ballast inflation, possibly a TCE-days bug. Low confidence.

---

_Filed by /qa-walker. Loop: orchestrator fixes/merges/deploys (gated) → qa-walker deep-verifies on prod → сдано/не работает. High-risk (#791 parse/economics) holds for founder on accept._
