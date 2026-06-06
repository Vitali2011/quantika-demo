# QA-Walker Matches Audit — Root-Cause & Fix Program (2026-06-03)

Source audit: `/tmp/qa-walker-matches-audit-2026-06-03.md` · Issues #782–#790 + #665.
Investigation: 5 read-only root-cause traces (list-render, economics, seed, i18n, session). Gate 0 (TRACE-BEFORE-FIX) — done.

> **STATUS: PLAN ONLY. No code, no dispatch yet.** Founder said "не рвись в бой — сделать один раз качественно".

---

## 0. Three operational facts that shape everything

1. **Target branch = `main`, NOT `feat/bunker-oilmonster-med-blacksea`.** The Russian bunker panel (`components/economics/BunkerComparisonTable.tsx`) and the comma-decimal sites do **not exist** on the current checkout — they were added on `main` by #758 (`9f16fc4e`) / #762 (`deb39305`). Prod deploys from `main`. **All fixes branch off `main`.** The audit's named commit `c8165aac` is docs-only (a red herring).
2. **Local `data/demo-seed.db` is 0 bytes.** The prod-shape DB (725 total / 28 main, matches prod) is `/Users/jarvis/work/qd-reparse/data/demo-seed.db`. A _different, clean_ generation exists at `/Users/jarvis/work/qd-opus-seed/data/demo-seed.db` (1379 main, all `M/V SEAGULL N`, DWT<10k=0, neg-TCE=0). **The audit hit a transitional seed state** — what prod displays now (clean SEAGULL) ≠ the garbage the report found. → A reality-check on the live prod seed is mandatory before any seed work.
3. **Engine is fine; DATA + DISPLAY + a few CODE gaps are broken.** Confirmed by traces. The report's "garbage seed is the #1 lever" is only half right: #782/#784 are part seed-quality, but #786/#787/#789 and all laycan/port/weight display issues are **code bugs that survive any reseed**.

**Do NOT touch (verified working):** Fit-Breakdown surface (per-factor bars + rationale), transit/timing math (nm/days/ETA), economics constants (commission 2.5%, bunker Piraeus for Med, EUA €77.15), per-pair engine pairing where inputs are good. Surgical changes only.

---

## Root-cause map (finding → mechanism → file → data|code → effort)

| #            | Symptom                                | Root cause                                                                                                                                                                                                                                                                                             | File:line                                                                                                                                                                           | Driver                          | Effort             |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ |
| **#790**     | Demo data vanishes mid-session         | Session TTL **1h** (`constants.ts:62`) hard-expires & DELETEs row on read; auth cookie `demo_auth` lives **7d** → no redirect, page renders empty. `hydrateDemoSession` is **login-only** → navigation never re-seeds. (NOT in-memory/LRU — SQLite-backed.)                                            | `session-store.ts:128,139-142`; `auth/config.ts:20`; login route:87; `matches/page.tsx:22-35`                                                                                       | code+config                     | S–M                |
| **#785**     | List ports `THIS→MONF` (detail = real) | `abbrPort` chops single-word ports to 4 chars; applied **only in table view**                                                                                                                                                                                                                          | `abbr-port.ts:22`; `MatchesClient.tsx:1046,1048`                                                                                                                                    | list-render                     | **S**              |
| **#665/H5**  | List laycan `Apr25–Jan1` (backwards)   | **Unit mismatch**: laycan stored in **ms** at 5 write sites; sole reader `fmtLaycan` does `new Date(ts*1000)` (expects **seconds**). Detail header+panel also broken; only sane laycan = raw `cargo.preferredDates` via SourceAttribution. `created_at` has the **mirror** bug (ms stored, read as s). | `fmt-laycan.ts:4`; writes: `persist-session-matches.ts:74-75`, `compute-matches.ts:114-115`, `session-buckets.ts:77-78`, `regenerate-matches.ts:242-243`, `real-matches.ts:209-210` | code (unit contract)            | **M**              |
| **#786**     | Vessel name = raw hash `19e07d…`       | UI fallback `vessel_name ?? vessel_id` where `vessel_id` = gmail hash. #688 only fixed empty→null, not the fallback **target**. Seed mirror `?? m.vesselEmailId`.                                                                                                                                      | `MatchesClient.tsx:1036,1038`; `regenerate-matches.ts:130`                                                                                                                          | code (fallback)                 | **S**              |
| **#787**     | Duplicate row (SEAGULL 48 ×2)          | Render-side content-dedup (#723) added to cargo/vessels pages but **NOT matches page**; build-time dedup (#722) lives only in seed script with a fragile key; live list reads per-session copies with **no** content-dedup.                                                                            | `app/matches/page.tsx:53,80-90`; `persist-session-matches.ts:21-88`; `regenerate-matches.ts:127-135`                                                                                | code (missing dedup)            | **S–M**            |
| **#789**     | Board shows fit down to 42%            | fit≥60 floor (#721) is a **seed-build bucketing** decision (`regenerate-matches.ts:195`), never a render guard; #721's UI change only added a **sort**, no filter. Served seed not floored → leaks.                                                                                                    | `regenerate-matches.ts:195-199`; `MatchesClient.tsx:54,871,877` (color only)                                                                                                        | data+code (no defensive floor)  | **S**              |
| **#782 (a)** | TCE −$96.3k/day                        | `parseLeadingNumber` regex grabs first number → `"IFO 180 M/E 3.7MT/D"` → **180** mt/day consumption → bunker 180×25×600=$2.7M. Correct ~4 mt/day → +$7k/day.                                                                                                                                          | `tce-calculator.ts:58-67`                                                                                                                                                           | **code bug**                    | **S**              |
| **#782 (b)** | TCE absurdly high ($53k/$109k)         | (1) null cargo weight → `safeQty = dwt×0.9` fabrication; (2) `durationDays` = **laden leg only** (no ballast/port/idle) → full freight ÷ ~1–4 days.                                                                                                                                                    | `tce-calculator.ts:110,113`; `voyage-calculator.ts:121,194`                                                                                                                         | code design + null data         | **M**              |
| **#783**     | Fit% ignores economics                 | Fit = **9 non-economic factors**; economics computed **after** the realism partition, explicitly display-only ("can never affect score"). Architecturally decoupled.                                                                                                                                   | `fit-breakdown.ts:433-481`; `pair-analyzer.ts:698-700`                                                                                                                              | code (by design)                | **M** (after #782) |
| **#784**     | Absurd pair scored 65%                 | `runHardFilters` (8 checks) has **no** gate for war-position / size-vs-laden-distance / long ballast. War-risk is **cost-only**, keyed on cargo ports not vessel open position → $0. Ballast cap only fires >2×radius (3000nm); audit's 1978nm escapes.                                                | `match-filters.ts:299-336`; `war-risk.ts:56`; `fit-breakdown.ts:465-473`                                                                                                            | code gap + vague data           | **M–L**            |
| **#788**     | Russian on English demo                | **No i18n system** — 20 hardcoded RU literals across 3 files. `21,56` = bare `.toLocaleString()` (no `'en-US'`) → resolves to prod VPS system locale. Fix = route through existing `formatNumber()` (`utils.ts:54`, pinned en-US).                                                                     | `MatchesClient.tsx:380-382`; `EconomicsTab.tsx:483`; `BunkerComparisonTable.tsx` (16 strings); ~12 bare `toLocaleString`                                                            | code (literals) — **on `main`** | **S**              |

**Minor L-findings:** L1 (zero/backwards laycan) = same unit bug as #665. L4 (comma) = #788. L2 ("ideal timing" on 24d idle) + L6 (gap-note 1978>1500 incoherence) = economics-surface labels → fold into #784 wave. L5 (AI "Explain" dates contradict fields) = LLM hallucination, separate backlog. L3 (cargo weight "—") = render binding, only **1/79** sources actually lack weight → not a data gap.

---

## The program — 3 phases (founder-readable)

### PHASE A — "The demo stops disappearing" (#790)

The single most demo-critical bug. An investor clicking around for >1h (or starting partway into the session's hour) sees everything vanish to "No emails yet".

- **A1 — Session durability.** Recommended fix = **re-hydrate on empty** (middleware/`getSession`: if DEMO_MODE and session is null, recreate+hydrate from the durable `user_id IS NULL` seed rows) **+ align lifetimes** (raise `SESSION_TTL_MS` to ≥ `demo_auth` days; bump the two `Max-Age=3600`). Smallest viable = align lifetimes only (S); robust = re-hydrate (M).
- **Risk-override**: touches session/auth request path → Tier **M**, mandatory `/test-skill`, verify against `lib/__tests__/session-expiry.test.ts`. Verify on **real prod env** (`DEMO_AUTH_COOKIE_DAYS`, `SESSION_TTL_MS`, `SESSIONS_DB_PATH`) — repo only shows defaults.
- **Latent hazard to flag**: `SESSIONS_DB_PATH = data/demo-seed.db` in demo mode — login writes per-session match copies into the **same file** as the seed snapshot. If a prod re-seed swaps that file under the open SQLite handle, reads go empty/stale — a _second_, independent way the demo could empty. Worth designing around.

### PHASE B — "Every match looks right" (display + integrity)

The report's headline: engine is fine, but the list mangles good data so a buyer sees nonsense. Cheap, huge visual win, mostly low-risk.

- **B1 — Cosmetic display (low risk, fast):** #785 (stop `abbrPort` on real names / fit-by-width), #786 (vessel name placeholder `TBN`/`Unnamed` instead of hash), #788 (20 RU literals → English + `'en-US'` number format). All on **`main`**. Tier **M** (3+ files, mechanical). Note: update test guard `__tests__/matches-buckets.test.tsx:130` (asserts `/Матчи/`).
- **B2 — Laycan unit contract (#665/H5, L1):** pick ONE canonical unit (ms or s), make it coherent across `fmtLaycan` + 5 writers + `isLaycanExpired`/`isFreshMatch`/`effectiveScore` + the mirror `created_at` bug. **Risk-override** (date normalizer) → Tier **M**, mandatory `/test-skill` covering real shapes (ms, s, null, backwards). Do as its own careful task — it's the only "display" bug that can regress sorting/freshness/expiry.
- **B3 — Render-side guards (defense-in-depth, #787 + #789):** add a content-dedup pass + a `fit≥60` floor **on the matches list render path** (`app/matches/page.tsx`/`MatchesClient.tsx`), mirroring #723's dedup helper. Durable architectural fix: the served data can't bypass the floor/dedup regardless of how the seed was built. Tier **M**.

### PHASE C — "The numbers are honest" (economics + seed) — the brain

The deepest, highest-value, needs the most care. The existing untracked design — `docs/superpowers/specs/2026-06-02-matching-gates-cap-clean-data-design.md` + 3 plans `docs/superpowers/plans/2026-06-02-matching-{gates-engine,cap,clean-data}.md` — already scopes most of this. **Reuse it, don't redo.**

- **C0 — Reality check (read-only, orchestrator-side):** confirm what the **live prod** seed actually shows now (which generation), and capture prod env. Avoids fixing a seed that's already been replaced (parity old-vs-new). Blocks all seed work.
- **C1 — TCE consumption parse fix (#782a):** one-line — skip `IFO 180/380/500` fuel-grade tokens in `parseLeadingNumber`. Kills the −$96k case. Tier **S** but risk-override (parser) → `/test-skill`. Quick, high-value, do early.
- **C2 — TCE duration/weight redesign (#782b):** round-trip duration incl. ballast + port days; reconsider `dwt×0.9` weight fabrication. Touches a tested formula → Tier **M**, expectations move with code (RC1: don't bend tests to impl — fix impl).
- **C3 — Fold economics into fit (#783):** add a loss-making demotion/cap so a negative-TCE voyage can't rank as a good match. Depends on C1/C2 (folding broken TCE = ranking by garbage). Tier **M**.
- **C4 — Voyage-realism gates (#784, L2, L6):** war-risk-position gate (key on vessel open position, not just cargo ports), size-vs-laden-distance factor, tighter ballast cap for tiny vessels; fix "ideal timing" mislabel on long idle + gap-note incoherence. Tier **M–L** — this is the gates-engine spec. brainstorm+writing-plans required.
- **C5 — Seed cleanup/regen (the lever):** clean the source fixtures `lib/sample-data/demo-parsed-{cargoes,vessels}.json` (remove/replace the ~6–10 absurd tiny-ship transatlantic pairs) and regenerate through the **fixed** engine so garbage self-filters. **Local-execution lane** (raw/LLM cache is local-only per `seed-prod-apply-mechanics`): orchestrator runs inline with Gate 0 + `--dry`-first + visual-after-apply (Rule #22). Tier **M**.

---

## Recommended sequencing & the one real fork

**Dependencies:** A is independent (do first). B1/B2/B3 independent of each other and of A. C0 blocks C5. C1→C2→C3 (ordered). C4 independent-ish. C5 depends on C1–C4 for durability.

**THE FORK (founder decides) — how deep on Phase C now:**

- **Option 1 (Recommended): Solid+clean demo fast, deep brain done properly.**
  Ship **A → B1/B3 → C1 + a C3-lite "demote loss-makers off the board"** now (≈4–5 waves, mostly S–M, low risk). The demo becomes stable, clean, and shows no embarrassing negative/absurd numbers within days. Then tackle the **full economics/gates/seed (C2/C4/C5)** as a separate, carefully-planned project reusing the 2026-06-02 gates spec.
  _Why:_ the cheap high-impact wins (looks + stability + no-loss-makers-shown) land fast without being held hostage to the multi-day engine rebuild; the hard brain work gets the care "сделать один раз качественно" demands instead of being rushed next to cosmetics.

- **Option 2: Everything at once, maximum depth before shipping anything.**
  All of A/B/C including the full gates rebuild + seed regen before any merge. Most thorough end-state, but longest, and the engine work blocks the visual wins. Higher risk of a long branch.

I recommend **Option 1**. B2 (laycan) slots into whichever option — it's independent and worth doing in the first display pass.

---

## DECISION (2026-06-03): Option 2 LOCKED — max depth, full program before shipping

Founder chose **Option 2** (everything at once, maximum depth, honest end-state). Locked execution order (dependency- + unblocked-first; dispatch in waves, NOT all-parallel):

| #   | Wave                          | Findings                                  | Tier           | Risk-override             | Blocked by                                    | Dispatch lane                  |
| --- | ----------------------------- | ----------------------------------------- | -------------- | ------------------------- | --------------------------------------------- | ------------------------------ |
| 1   | **B1 — cosmetic display**     | #785 ports, #786 hash-name, #788 RU+comma | M (mechanical) | no                        | — (in-repo, off `main`)                       | dev-vps                        |
| 2   | **A1 — session durability**   | #790                                      | M              | **yes** (session/auth)    | prod-env confirm (C0)                         | dev-vps                        |
| 3   | **B2 — laycan unit contract** | #665, L1                                  | M              | **yes** (date normalizer) | —                                             | dev-vps                        |
| 4   | **B3 — render-side guards**   | #787 dedup, #789 floor                    | M              | no                        | —                                             | dev-vps                        |
| 5   | **C1 — TCE parse fix**        | #782a (IFO180)                            | S              | **yes** (parser)          | —                                             | dev-vps                        |
| 6   | **C2 — TCE duration/weight**  | #782b                                     | M              | **yes** (calc)            | C1                                            | dev-vps                        |
| 7   | **C3 — fold econ into fit**   | #783                                      | M              | **yes**                   | C1,C2                                         | dev-vps                        |
| 8   | **C4 — voyage-realism gates** | #784, L2, L6                              | M–L            | **yes**                   | brainstorm+plan (reuse 2026-06-02 gates spec) | dev-vps                        |
| 9   | **C5 — seed cleanup + regen** | seed lever (#782/#784 data)               | M              | data-apply                | C1–C4 + C0 prod-read                          | **local-execution** (Rule #22) |

Parallelizable: B1 ∥ A1; B2, B3 independent; C1→C2→C3 ordered; C4 independent-ish; C5 last.
**C0 reality-check (read-only prod) is a prerequisite for C5 + an A1 verification input — awaiting founder authorization (safety classifier blocked the prod env dump 2026-06-03).** Unblocked waves (B1, B2, B3, C1–C4) proceed without it; only C5 and A1's final env-confirm wait on C0.

## When we dispatch (not now) — discipline checklist

- Branch every wave off **`main`** (worktrees on dev-vps `root@`), not the bunker branch.
- Risk-override waves (A1, B2, C1, C2, C4) → min Tier M + mandatory `/test-skill` with **real input shapes**, not happy-path.
- C5 seed = local-execution lane → Gate 0 trace + `--dry` on real prod target + visual-after-apply.
- Per-wave: `ROADMAP_READ`, `TRACE_READ`, `CHAIN_<topic>`, `BUNDLE_TIER` (if ≥2 issues), then Gate 2/3/5 at merge/deploy.
- Preserve the untracked 2026-06-02 gates spec/plans (commit them — they're the Phase C design).
