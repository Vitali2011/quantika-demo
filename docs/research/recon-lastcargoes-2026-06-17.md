# lastCargoes RECON — 2026-06-17

**Task 5 of data-fill campaign. RECON only — no code changes.**
**Precursor:** `docs/research/lastcargoes-fill-2026-06-16.md` (PR #1028, merged) — dry-run found 0 new extractions from regex backfill. This doc answers the 5 architectural questions for founder decision.

---

## Q1 — WHERE is lastCargoes stored (exact field, type, format)

### Field definition

| Location | Field | Type |
|----------|-------|------|
| `lib/types.ts:286` | `ParsedVessel.lastCargoes` | `string \| null` |
| `lib/types.ts:480` | `Match.vessel.lastCargoes` | `string \| null` (snapshot in match payload) |
| `parsed_results.result_json` | `.lastCargoes` | JSON string field inside the vessel item object |
| LLM schema `lib/schemas/parse-vessel.ts:71` | `last_cargoes` | snake_case, `Type.STRING, nullable: true` |

### Format

Free-form comma/semicolon/slash/newline/and-delimited string. Examples from prod:
- `"general cargo, tapioca chips, coal, coal, bauxite, iron ore"` (from L5C: header)
- `"corn in bulk"` (from LLM understanding `(LAST CARGO CORN IN BULK)`)
- `"wheat in bulk"`

### Normalization in `lib/parsing/parse-vessel-helpers.ts:347`

1. If `item.last_cargoes` is null → fallback: `extractLastCargoesFromBody(emailBody)` (regex, `lib/parsing/lastcargoes-fallback.ts`)
2. If `item.last_cargoes` is `{value, confidence}` object → unwrap `.value`
3. If array → `.join(', ')`
4. If string → pass through (try JSON.parse first in case it's a stringified array)

### Prod state (confirmed by orchestrator 2026-06-17)

- `parsed_results` table: **48 vessel rows / 115 vessel items**
- Non-null lastCargoes: **3/115 items (2.6%)** — SEAGULL 11, SEAGULL 74, SEAGULL 75
- Null lastCargoes: **112/115 items (97.4%)**

---

## Q2 — HOW hold-cleanliness reads lastCargoes

### Data path: parse → score → DD panel

```
parsed_results.result_json
  ↓  (hydrate-demo-session.ts — reads via safeJsonArray<ParsedVessel>)
session.parsedVessels[].lastCargoes
  ↓  (app/match/[id]/page.tsx — reads vessel from session)
buildDueDiligence({ vessel, ... })
  ↓  lib/matching/due-diligence.ts:149
parseLastCargoes(vessel.lastCargoes)  ←  lib/cargo/l5c-matrix.ts:296
  ↓
checkCompatibility(prevCargoes, cargoName)  →  DDCheck "Чистота трюмов / прошлый груз"
```

### `parseLastCargoes(raw: string | null): string[]` (`lib/cargo/l5c-matrix.ts:296`)

Splits on `/[,;\/\n&]+|\s+and\s+/i`. Returns cargo name array. Empty array → early exit → hold-cleanliness no-op.

### `applyHoldCleanliness()` (`lib/matching/hold-cleanliness.ts:18`)

Called during match scoring (pair-analyzer → analyzePairs). Requires both `vessel.lastCargoes` AND `cargo.cargoDescription`.

- If missing either → **no-op** (match unaffected, hold-cleanliness silently skipped)
- If incompatible pair detected → `matchLevel='weak'`, `confidence.blockSend=true`, issue string added → demoted to **review bucket**
- If requires extra cleaning → caution issue added, no demotion

### DD panel (`lib/matching/due-diligence.ts:buildCargoHolds()`)

Row "Чистота трюмов / прошлый груз":
- `lastCargoes === null` → `INACTIVE('нет данных в письме')` — **current state for 97% of vessels**
- Compatible → `state: 'pass'`
- Extra clean → `state: 'caution'`
- Incompatible → `state: 'caution'` with blocking reason

### Vessel page (`app/vessel/[id]/page.tsx:212`)

```tsx
{vessel.lastCargoes && (
  <div>Last cargoes: {safeRender(vessel.lastCargoes)}</div>
)}
```
Renders only when non-null.

### PATCH recalculate endpoint — important gap

`app/api/matches/[id]/route.ts:97` — `buildVesselProxy()` hardcodes `lastCargoes: null`. When broker triggers "Recalculate" on a match, hold-cleanliness is **always skipped** in the recalculation regardless of stored vessel data. This is a separate issue but means hold-cleanliness is not re-evaluated on TCE override.

---

## Q3 — SOURCE: raw email coverage for lastCargoes

### Confirmed email corpus analysis (48 vessel emails)

| Email pattern | Count | Vessels affected | Extractable by |
|--------------|-------|-----------------|----------------|
| L5C: header format | 1 email | 1 vessel (SEAGULL 11) | Regex ✅ — already set |
| `(LAST CARGO X)` parenthetical | 1 email | 2 vessels (SEAGULL 74, 75) + 1 null | LLM only ✅ — already set |
| No L/C mention | 46 emails | remaining | ❌ — not capturable |

**Result from dry-run (documented in PR #1028):**
- `--apply` gains: **0 new vessel items** (regex already got what it could)
- Already-set by LLM (pre-existing): 3 items
- `no-lc-in-body=47 already-set=1 missing-email=0`

### Why regex misses Email B

`(LAST CARGO CORN IN BULK)` does NOT match `lastcargoes-fallback.ts` Pattern 1 — requires `[:\-–]` after trigger word. The parenthetical `(X)` format has no colon/dash. Extending the regex is technically possible for single-vessel emails, but this email has 3 vessels and the pattern appears per-vessel inline — regex would extract the first match only and assign it incorrectly to all 3 vessels.

### Founder-decision implication

- **46/48 emails (96%) have no L/C data of any kind.** Pure regex backfill is exhausted.
- **Options for real coverage gain:**

| Option | New items filled | Quality | Effort |
|--------|-----------------|---------|--------|
| A: Accept null (status quo) | 0 | Real | None |
| B: LLM re-parse 48 emails for lastCargoes | Unknown (~3-10 estimated) | Real | 48 LLM calls, new script |
| C: Synthetic generation (vessel type + size heuristic) | 112 | Invented | 2h, founder approval required |
| D: Fixture-JSON backfill (patch 3 known vessels from `demo-parsed-vessels.json`) | 0 new (already match prod) | Real | 30min, safe |

**Option D note:** The 3 already-set vessels in `demo-parsed-vessels.json` match the same emailIds as prod. If prod `parsed_results` doesn't yet reflect these 3, a fixture-JSON patch would be additive. But orchestrator confirmed prod has them (3/115 non-null already).

---

## Q4 — HOW lastCargoes reaches the PROD DB

### Build-time flow (NOT prod)

```
.private/raw-emails/ + llmCache
  ↓  scripts/demo-seed/build.ts
  →  parsed_results.result_json (JSON array of ParsedVessel)
     includes lastCargoes from llmCache.parsedVessels[].lastCargoes
  ↓  scripts/demo-seed/regenerate-matches.ts
  →  matches table rebuilt
  ↓  data/demo-seed.db → copied to VPS
```

**`build.ts` does NOT run on prod** (confirmed Equasis lesson #1032). The `data/demo-seed.db` is built locally, then deployed.

### Post-build backfill scripts (prod-safe pattern)

Per analogy with `hydrateCiiRatings` / Equasis backfill:

```
scripts/demo-seed/backfill-lastcargoes.ts
  → reads emails.body from demo-seed.db
  → applies extractLastCargoesFromBody() regex
  → patches parsed_results.result_json in-place
  → yields: 0 new items (as per dry-run)

scripts/demo-seed/regenerate-matches.ts
  → rebuilds matches from current parsed_results
  → required after ANY parsed_results change
```

### What's needed to get real lift (foundation for Task 5 implementation)

**If LLM re-parse chosen (Option B above):**
1. New script: `scripts/demo-seed/llm-backfill-lastcargoes.ts`
   - Reads each vessel email body from `emails` table
   - Calls LLM with vessel-parse prompt scoped to lastCargoes
   - Assigns per-vessel (not email-wide) — critical for multi-vessel emails
   - Patches `parsed_results.result_json` via `patchResultJsonLastCargoes()`
2. Run `regenerate-matches.ts` after backfill
3. Deploy via `ops/scripts/deploy-quantika-demo.sh` (seed DB copy + restart)

**If synthetic data chosen (Option C above):**
1. New script: `scripts/demo-seed/synthetic-lastcargoes.ts`
   - Generates bulk/breakbulk/grain history based on vessel type + DWT
   - Requires explicit founder approval + `--synthetic` flag to prevent accidental run
   - Must set `lastCargoesSource='synthetic'` (new field? or comment in issue) for honesty
2. Same regen + deploy path

---

## Q5 — ALL consumers of lastCargoes + scoring vs display

### Consumers map

| File | Function | Effect | Category |
|------|----------|--------|----------|
| `lib/sailing/fit-breakdown.ts:302` | `scoreCargoTypeQuality()` | cargoType factor, weight=**6/100** — pedigree boost: 1.0 (confirmed history) vs 0.85 (no history) | **SCORING (quantitative)** |
| `lib/sailing/match-scoring.ts:76` | `scoreCargoTypeMatch()` | cargoType points: **+20** (confirmed) vs +16 (unclear) vs +8-12 (other) out of ~100 total | **SCORING (quantitative)** |
| `lib/matching/hold-cleanliness.ts:18` | `applyHoldCleanliness()` | If incompatible: `matchLevel='weak'`, `blockSend=true` → **demoted to review bucket** | **SCORING (qualitative / bucket)** |
| `lib/matching/due-diligence.ts:149` | `buildCargoHolds()` | DD panel row "Чистота трюмов" — pass / caution / inactive | **DISPLAY** |
| `app/vessel/[id]/page.tsx:212` | vessel page | Shows "Last cargoes: ..." when non-null | **DISPLAY** |
| `app/api/matches/[id]/route.ts:97` | `buildVesselProxy()` | Hardcodes null for PATCH recalculate — hold-cleanliness skipped on TCE override | **GAP (display-side only)** |

### Weight analysis

- **cargoType** factor weight = 6 (out of 100 total, Economics=18, Utilisation=19 are largest)
- Without lastCargoes: cargoType score = 0.85×6 = 5.1 max for bulk-class + BULK cargo
- With lastCargoes (confirmed): cargoType score = 1.0×6 = 6.0
- **Delta per match: +0.9 fit points** (small but systematic for all bulk matches)
- **Hold-cleanliness demotion** is high-impact only when prev cargo IS incompatible — with 97% null, this gate never fires, so incompatible pairs silently pass

### Current demo behavior

With 97% null lastCargoes:
1. `scoreCargoTypeQuality`: all bulk vessels get 0.85 share (no pedigree bonus) → fit systematically underscored by 0.9pts
2. `scoreCargoTypeMatch`: all vessels get 16pts instead of 20 for BULK confirmed history
3. `applyHoldCleanliness`: never fires → no pairs demoted to review for cargo incompatibility
4. DD panel: "Чистота трюмов" always shows "нет данных в письме" for 97% of vessels

---

## Summary — Architect Decision Points

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Fill strategy for 112 null vessels | Accept null / LLM re-parse / Synthetic | LLM re-parse if demo impression matters; synthetic requires explicit go |
| 2 | Synthetic data policy | Forbidden / Allowed with flag | Must be explicit founder call |
| 3 | PATCH endpoint gap | Add lastCargoes to buildVesselProxy | Low-priority — affects only "Recalculate TCE" flow, not initial scoring |
| 4 | Regex extension `(LAST CARGO X)` | Add pattern | Safe only for single-vessel emails; zero net gain for current corpus |

## Prod path (when founder decides)

```bash
# 1. Backup
cp /root/work/quantika-demo/data/demo-seed.db /root/work/quantika-demo/data/demo-seed.db.bak.$(date +%Y%m%d)

# 2a. If LLM re-parse:
npx tsx scripts/demo-seed/llm-backfill-lastcargoes.ts --db data/demo-seed.db [--dry]
npx tsx scripts/demo-seed/llm-backfill-lastcargoes.ts --db data/demo-seed.db --apply

# 2b. If synthetic:
npx tsx scripts/demo-seed/synthetic-lastcargoes.ts --synthetic --db data/demo-seed.db [--dry]
npx tsx scripts/demo-seed/synthetic-lastcargoes.ts --synthetic --db data/demo-seed.db --apply

# 3. Regen matches
npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db

# 4. Deploy (GH Actions or manual)
systemctl restart quantika-demo
```

**Note:** backfill-lastcargoes.ts (regex) is already correct and safe but yields 0 gains. No code change needed for it. The LLM re-parse script is the new work required.
