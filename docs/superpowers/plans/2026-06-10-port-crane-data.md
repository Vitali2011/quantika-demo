# Plan: Port Crane Data Enrichment (WPI SWL + top-20 operators)

> Date: 2026-06-10 · Branch: `plan-port-data` · Founder-approved (variant A)
> Research: `~/orchestrator-state/research-cranes-i.md` · Recon: `recon-fb-fitui.md` Item I

## Goal

Enrich port-master data so the **Cranes** fit-factor can show *how much* a gearless
vessel can lean on shore cranes, not just *whether* it can:

1. **`craneSWL` for all 483 ports** — automated one-off ingestion from World Port Index
   (NGA Pub 150, free). Numeric max safe-working-load (tonnes).
2. **`terminalOperator` for top-20 demo-relevant ports** — manual curation (this plan
   carries the list + per-port citation). Datalastic API is an optional fallback only;
   founder has no subscription, so the manual path is **primary**.
3. **Extend `PortMaster`** with optional fields: `craneSWL?`, `craneType?`,
   `terminalOperator?`, `craneDataAsOf?`.
4. **Surface in match rationale** — the Cranes factor names SWL + operator with a date
   and a "confirm with port agent" disclaimer.

## Founder decisions (locked — do not relitigate)

- Variant A (minimum) from research, NOT variant B (no Datalastic subscription, no quarterly sync job).
- **NO `stevedoreNames`** field — research flagged it as risk-over-value (stevedores churn,
  no public source, legal exposure). Excluded by decision.
- Disclaimer mandatory on every surfaced operator/SWL string: date + "confirm with port agent".

## Out of scope

- Real-time / per-call crane operator (does not exist as a source — research §"Что существует").
- Datalastic implementation, subscription, or any quarterly auto-sync (variant B).
- `stevedoreNames` — explicitly excluded.
- Changing the **scoring math** of `scoreCranes` (the 100/85/55/0 ladder stays). This plan
  only adds *descriptive* SWL/operator detail to the rationale string, not new score buckets.

## Dependency on Task I (discharge cranes)

Recon Item I + `2026-06-10-partner-feedback-pack.md` Task I change `scoreCranes` from a
2-arg `(geared, loadPort)` to a 3-arg `(geared, loadPort, dischargePort)` and name *which*
port has cranes. As of this worktree's HEAD that change is **not yet merged** (`scoreCranes`
at `lib/sailing/fit-breakdown.ts:338` still takes 2 args).

**Sequencing rule:** Stage 4 (rationale wiring) builds **on top of** the Task I 3-arg
signature. If Task I is merged first, wire into its final shape. If this plan reaches Stage 4
before Task I merges, Stage 4 implements the 3-arg signature itself (per partner-feedback-pack
Task I design) so the two changes are mergeable in either order. Stages 1–3 are independent of
Task I and can proceed regardless.

## Current-state facts (verified in worktree, 2026-06-10)

- `PortMaster` interface: `lib/sailing/port-master.ts:25-60` (already has optional v2 fields
  `maxLOA?`, `cargoBerthTypes?`, `sourceNote?`, etc. — new fields follow the same pattern).
- Loader `PortMasterIndex` (`lib/sailing/port-master-loader.ts`) **spreads/stores whole
  entries** — new optional fields flow through with **no loader change**. Validation only
  checks `unlocode`/`name`/`lat`/`lon`. (Confirm with a passthrough test in Stage 1.)
- Data file: `data/ports/port-master.json`, committed, **483 port entries** (`getPortMaster`
  reads it via `loadPortMasterFromJson`). 415 `hasShoreCranes:true`, 68 `false`.
- Generator precedent: `scripts/generate-port-master.ts` is staged, idempotent, caches the
  source download in `scripts/.cache/`, source CSVs are `.gitignore`d/regenerable, final JSON
  committed. **The WPI script mirrors this discipline.**
- Rationale surfaces as `c.rationale` text in `components/match/MatchDetailPanel.tsx:165,194`.
  No structural UI change needed — the disclaimer lives inside the rationale string.

---

## Stage 1 (S) — Schema extension + passthrough tests

**Branch:** `plan-port-data` (this plan's stages land as separate commits / sub-PRs as the
orchestrator decides; each stage is independently revertible).

**Files:**
- Modify: `lib/sailing/port-master.ts` (`PortMaster` interface, after line 57 `sourceNote`).
- Test: `lib/sailing/__tests__/port-master-crane-fields.test.ts` (new).

**Schema (append to `PortMaster`, all optional, JSDoc each):**
```ts
  /** Max crane safe-working-load in tonnes (from World Port Index / NGA Pub 150). */
  craneSWL?: number;
  /** Shore-crane type, when known. */
  craneType?: 'mobile' | 'gantry' | 'floating' | 'STS';
  /** Terminal operator company name (manual curation, top-20 demo ports). */
  terminalOperator?: string;
  /** As-of date for crane/operator data, e.g. "2025-Q4" or "2025-10". */
  craneDataAsOf?: string;
```

**TDD:**
1. RED: test asserts a fixture entry carrying `craneSWL`/`terminalOperator`/`craneDataAsOf`
   round-trips through `loadPortMasterFromJson` → `getPortMaster(name)` unchanged (behavioral:
   real loader call, not type-only). Also assert an entry *without* the fields still loads
   (back-compat). Fails to compile/typecheck until interface extended.
2. GREEN: add the four fields.
3. Assert `clearPortMasterCache()` + reload yields the new fields (no stale cache).

**Data-quality gate:** none (no data yet). **Rollback:** revert the interface commit; optional
fields are additive, nothing reads them yet → zero runtime impact.

---

## Stage 2 (M) — WPI ingestion script for `craneSWL` (all 483 ports)

**Files:**
- New: `scripts/ports/ingest-wpi-cranes.ts` (staged, idempotent, `--dry` default-safe).
- New: `scripts/ports/__tests__/ingest-wpi-cranes.test.ts`.
- Source: WPI dataset fetched into `scripts/.cache/` (gitignored) **with a committed
  SHA-256 checksum** in `scripts/ports/wpi-source.sha256`; OR, if the upstream URL is
  unstable, the parsed WPI subset (UNLOCODE → SWL) checked into
  `data/ports/wpi-crane-swl.json` with a `sourceNote` header. Decide at implementation by
  download reliability; **default to committing the parsed subset** so the build is
  reproducible offline (matches repo "source committed / regenerable" discipline).

**Source:** World Port Index, NGA Pub 150 — https://msi.nga.mil/Publications/WPI
(free, downloadable). WPI provides crane presence + type + SWL keyed by port; join to our
ports by **UNLOCODE first**, fall back to normalized name (reuse `normalizePortName`).

**Stages (mirror `generate-port-master.ts`):**
- `download` — fetch WPI dataset into `scripts/.cache/`, verify against committed checksum;
  skip if cached + checksum matches.
- `parse` — extract `{ unlocode, craneSWL, craneType }` rows; print coverage stats.
- `apply --dry` (**default**) — compute the diff against `data/ports/port-master.json`,
  print counts, write **nothing**.
- `apply --write` — apply the merge (explicit flag required, per repo `--dry` discipline).

**Merge rules (NO silent overwrites):**
- Only **add** `craneSWL`/`craneType` to entries that lack them.
- If an entry already has a `craneSWL` (e.g. hand-curated in Stage 3), **do not overwrite** —
  log it to a `--report` skip-list and leave the existing value. Script exits non-zero if any
  conflict is found in `--write` mode without an explicit `--allow-overwrite`.
- Set `craneDataAsOf` to the WPI edition (e.g. `"WPI-2025"`) on every row the script touches.
- Never touch `maxDraftM`, `hasShoreCranes`, `berthType`, or any non-crane field.

**TDD (script logic, not network):**
1. RED: unit-test the **merge function** with a small in-memory fixture (3 ports: one missing
   SWL → gets it; one with existing SWL → preserved + reported; one not in WPI → untouched).
2. GREEN: implement merge.
3. Test `--dry` returns the diff object and writes nothing (assert file mtime / no write call).
4. Test idempotency: running merge twice yields identical output (no churn, `craneDataAsOf`
   stable).
5. Test UNLOCODE-miss → name-fallback path with a known alias.

**Data-quality gate (mandatory before any `--write` lands):**
- Run `apply --dry` and **record in the PR description**: how many of 483 ports got `craneSWL`
  (expected partial — WPI doesn't cover every entry), how many were skipped (already had a
  value), how many WPI rows found no match. Reviewer eyeballs the diff. No `--write` commit
  merges without this count table.
- Spot-check 5 known ports (Constanta, Rotterdam, Singapore, Novorossiysk, Houston) against
  WPI values manually.

**Rollback:** the `--write` produces a single JSON diff commit; `git revert` it. Script + tests
are inert (never run in prod). The cached WPI source is gitignored.

---

## Stage 3 (S) — Top-20 `terminalOperator` manual curation

**Files:**
- Modify: `data/ports/port-master.json` (add `terminalOperator` + `craneDataAsOf` +
  per-port `sourceNote` to ≤20 entries).
- New: `docs/ports/terminal-operators-sources.md` — citation per port (operator name,
  source URL, date checked). One row per port; this is the audit trail.
- Test: extend `port-master-crane-fields.test.ts` — assert the curated ports load with
  `terminalOperator` present and `craneDataAsOf` set (behavioral spot-check on 3 of the 20).

**Top-20 demo-relevant ports** (Black Sea / Med / Atlantic handysize contour — the seeded
demo set; final list confirmed against `scripts/port-targets.ts` `PORT_TARGETS` at
implementation). Candidate list to curate operators for:
Constanta, Odesa, Novorossiysk, Istanbul, Mykolaiv, Rotterdam, Hamburg, Antwerp,
Houston, New Orleans, Singapore, Gibraltar, Algeciras, Piraeus, Iskenderun,
Alexandria, Tuzla, Ravenna, Ghent, Casablanca.

**Curation discipline:**
- Operator name from port-authority site or WPI terminal listing only. Each gets a
  `sourceNote` (e.g. `"operator: APM Terminals — port authority site, checked 2025-10"`)
  and `craneDataAsOf` (e.g. `"2025-Q4"`).
- If an operator can't be confidently sourced for a port → **leave it blank**, note in the
  sources doc as "not found". Do not guess. Coverage <20 is acceptable; fabrication is not.
- These hand-set `terminalOperator`/`craneDataAsOf` must survive Stage 2 re-runs (Stage 2
  never writes `terminalOperator`; if Stage 3 also set a `craneSWL`, Stage 2's no-overwrite
  rule protects it).

**Data-quality gate:** every `terminalOperator` in the diff has a matching row in
`terminal-operators-sources.md`. Reviewer cross-checks 3 at random against the cited URL.

**Rollback:** single data commit; `git revert`. Docs file is additive.

---

## Stage 4 (M) — Rationale wiring (surface SWL + operator + disclaimer)

**Depends on:** Task I 3-arg `scoreCranes` (see "Dependency on Task I" above).

**Files:**
- Modify: `lib/sailing/fit-breakdown.ts` (`scoreCranes` body — append descriptive detail to
  the gearless rationale strings; **no score-ladder change**).
- Modify (if trivial): `lib/matching/reason-enricher.ts` gearless case — else note follow-up.
- Test: `lib/sailing/__tests__/score-cranes-rationale.test.ts` (new).

**Behavior:** when a gearless vessel leans on a port's shore cranes and that port has
`craneSWL`/`terminalOperator` data, the rationale appends a clause:
> "…port has shore cranes (SWL 80 t, operator PSA International, data 2025-Q4 — confirm
> with port agent)."

Rules:
- Pull crane data via `getPortMaster(port)` for whichever port(s) provide the cranes.
- Only append fields that exist (`craneSWL` present → "SWL N t"; `terminalOperator` present →
  "operator X"; always include `craneDataAsOf` if any field shown + the disclaimer).
- **Disclaimer "confirm with port agent" is mandatory** whenever operator OR SWL is shown.
- If no crane data → rationale unchanged (today's string). No regression for the 463 ports
  without operator data.

**TDD:**
1. RED: gearless vessel, discharge port = Constanta seeded with `craneSWL` + `terminalOperator`
   → assert rationale contains "SWL", the operator name, the as-of date, AND
   "confirm with port agent". Use a real seeded port (behavioral, via `scoreCranes`).
2. RED: gearless vessel, port with cranes but **no** SWL/operator data → rationale must NOT
   contain "SWL" or "operator" and must NOT contain a dangling disclaimer.
3. GREEN: implement the append.
4. Assert score unchanged vs. Task I baseline (the ladder math is untouched — guard against
   accidental score drift).

**PI3 guard:** do not rewrite Task I's existing `score-cranes-discharge.test.ts` expectations.
If Stage 4's string changes break a Task I assertion, that's a STOP → scope decision, not a
silent edit.

**Data-quality gate:** none (logic). **Rollback:** revert the `fit-breakdown.ts` commit;
rationale falls back to Task I strings. Score math never changed → no economic impact.

---

## Cross-stage rollback summary

| Stage | Artifact | Rollback | Blast radius if reverted |
|-------|----------|----------|--------------------------|
| 1 | interface fields | revert commit | none (nothing reads them) |
| 2 | `craneSWL` data + script | revert data commit | cranes show no SWL (today's behavior) |
| 3 | `terminalOperator` data + sources doc | revert data commit | no operator names (today's behavior) |
| 4 | rationale wiring | revert commit | rationale = Task I strings |

Each stage is independently revertible; Stage 4 is the only one with a hard upstream dep
(Task I). Stages 1→2→3 are additive data/schema and safe to land in any order after Stage 1.

## Test commands (VPS, maxWorkers=1)

```
npx tsc --noEmit
npx jest port-master-crane-fields --maxWorkers=1 --ci --forceExit --no-coverage   # S1, S3
npx jest ingest-wpi-cranes --maxWorkers=1 --ci --forceExit --no-coverage          # S2
npx jest score-cranes-rationale --maxWorkers=1 --ci --forceExit --no-coverage     # S4
```

## Open questions for founder (non-blocking)

- WPI source form: commit parsed subset (`data/ports/wpi-crane-swl.json`, reproducible offline)
  vs. fetch-with-checksum at build. Plan defaults to **committed parsed subset**; flag if the
  founder prefers a live fetch.
- Top-20 list: confirm against final `PORT_TARGETS`; swap any port not in the demo contour.
