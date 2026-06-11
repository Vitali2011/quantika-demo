# Quantika-Demo — Logic Inventory
*Recon branch: `recon/logic-inventory-20260611` · Read-only, no code changes.*

---

## 1. Matching Pipeline — Vessel vs Cargo

### 1.1 Hard Filters (deterministic, run before LLM)

All 14 gates live in `lib/sailing/match-filters.ts` (called from `runHardFilters`, line 531).
Missing input → **graceful pass** (conservative).

| Gate | Inputs | Rule / Formula | Threshold | Outcome | Code |
|------|--------|----------------|-----------|---------|------|
| **draft (load)** | `vessel.dwtSummer`, cargo weight, `port.draftMax` | Estimate laden draft: `0.4991 × DWT^0.2991` × `(cargo/DWT)^0.3`; compare to port limit | `ladenDraftM > portLimitM` → fail | pass/fail | `match-filters.ts:52` + `laden-draft.ts` |
| **destDraft (discharge)** | same, discharge port | Same formula, discharge port limit | same | pass/fail | `match-filters.ts:547` |
| **crane (load)** | `vessel.geared`, `port.hasShoreCranes` | geared → pass; gearless → need shore cranes; unknown → pass; BREAK_BULK + no cranes + unverified → amber warning | `geared===false && portCranes===false` → fail | pass/fail/warning | `match-filters.ts:80` |
| **destCrane (discharge)** | same, discharge port | Same | same | pass/fail/warning | `match-filters.ts:548` |
| **volume** | `cargo.weightMt`, `cargo.stowageFactor`, `vessel.grainCapacity` | `requiredM3 = weight × SF`; SF lookup: explicit > keyword (STOWAGE_FACTORS dict) > 1.35 default; 5 % margin | `requiredM3 > grainCapacity × 1.05` → fail | pass/fail | `match-filters.ts:165` |
| **cargoWeight** | `cargo.weightMt`, `vessel.dwcc`, `vessel.dwtSummer` | Prefers DWCC; else `DWT × 0.90`; 5 % margin | `cargoMax > capacity × 1.05` → fail | pass/fail | `match-filters.ts:~196` |
| **cargoVessel** | `cargo.cargoType`, `vessel.vesselType` | CONTAINER↔container, RORO↔roro, BULK↔bulk family, etc. | type mismatch → fail | pass/fail | `match-filters.ts:~230` |
| **imsbc** | `cargo.cargoDescription`, `vessel.restrictions` | IMSBC group B (chemical hazard) AND vessel restricts DG → hard fail. Group A caution surfaced as issue, not block. | `verdict === 'incompatible'` | pass/fail; caution = issue | `match-filters.ts:470`, `imsbc-check.ts` |
| **vesselAge** | `vessel.built`, `cargo.maxVesselAgeYrs`, `refYear` | `refYear - built > maxVesselAgeYrs` → fail | explicit age cap from cargo | pass/fail | `match-filters.ts:~280` |
| **dimensions** | `vessel.beam`, `vessel.loa`, `cargo.maxBeamM`, `cargo.maxLoaM` | beam or LOA exceeds cargo explicit max | numeric comparison | pass/fail | `match-filters.ts:399` |
| **gearRequired** | `cargo.gearRequired`, `vessel.geared`, ports | cargo requires gear → vessel must be geared OR port has shore cranes | `gearRequired && !geared && !portCranes` | pass/fail | `match-filters.ts:372` |
| **voyage** | `vessel.restrictions[]`, origin/destination ports | Vessel restrictions list checked against port/basin | restriction matches | pass/fail | `match-filters.ts:574`, `voyage-restriction.ts` |
| **flagClass** | `vessel.flag`, `vessel.classSociety`, `cargo.flagRequired`, `cargo.classRequired` | Exact string match (upper-cased) | mismatch → fail | pass/fail | `match-filters.ts:335` |
| **warPositionVoyage** | `vessel.openPosition`, `vessel.dwtSummer`, origin/dest | Sub-handy (<25 000 DWT) vessel open in JWC HRA AND intercontinental voyage (≥3 basin hops) | DWT < 25 000 + HRA + basins ≥ 3 | pass/fail | `match-filters.ts:444` |

### 1.2 Readiness / Laycan Gap

File: `lib/sailing/readiness-gap.ts`, function `calculateReadinessGap` (line 178).

| Step | Formula | Threshold | Verdict |
|------|---------|-----------|---------|
| Arrival date | `openDate + (portDistance / speed) / 24h` | — | ISO date |
| Gap days | `laycanStart − arrivalDate` | >5 → idle; 0.5–5 → ideal; -1..0.5 → tight; `< -(1 + laycanWindowDays)` → late | `ReadinessVerdict` |
| Spot vessel override | arrival date from today | `gapDays ≥ 0.5 → ideal`; `[-1, 0.5) → tight`; `< -1 → late` | skip 'idle' for spot |
| IDLE hard exclusion | `gapDays > IDLE_HARD_MAX_GAP_DAYS (21)` | demote to `lowConfidenceMatches` bucket | bucket routing |

Verdict enum: `'ideal' | 'tight' | 'idle' | 'late' | 'unknown'`

### 1.3 Sanctions Gate

`lib/validation/sanctions.ts`, called via `checkSanctions`.
- `vesselFlag` in blocked-flag list → `blocking=true`
- Port in sanctioned-port list → `blocking=true`
- `vessel.restrictions` contain sanction keyword → blocking
- MEDIUM risk (≤ secondary concern) → issue, not block

Blocking sanctions → `blockedMatches` bucket; MEDIUM risk → warning in `match.issues`.

### 1.4 IMSBC / Hold Cleanliness

**IMSBC** (`lib/sailing/imsbc-check.ts`):
- Group lookup JSON (`lib/cargo/imsbc-groups.json`): keyword → A/B/C
- Group B + vessel DG-restricted → `incompatible` (hard gate)
- Group A → `caution` (issues list, not block)
- Group C / unknown → `ok`

**Hold Cleanliness** (`lib/matching/hold-cleanliness.ts`):
- Matrix: `lastCargoes` vs new cargo compatibility
- Applies `applyHoldCleanliness(match, cargo, vessel)` → adds issue to `match.issues` when incompatible

### 1.5 LLM Scoring (AI scorer)

Called from `computeAndPersistMatches` / `analyzePairs` (`lib/matching/pair-analyzer.ts:404`).
- Input: `{cargoData, vesselData, readinessData}` — pairs that passed hard filters
- Prompt: `MATCH_PROMPT` from `lib/prompts.ts`
- Output: `RawMatch[]` — `{score, matchLevel, matchReasons, issues}` per pair
- score 0–100; matchLevel default fallback: `>70 → 'good'`, `>40 → 'possible'`, else `'weak'`
- Pairs not returned by LLM → sweep path (`pair-analyzer.ts:490`) with score 25, level `'weak'`

---

## 2. Fit-% Scoring

### 2.1 Weights

File: `lib/sailing/fit-breakdown.ts:51`, function `computeFitBreakdown` (line 612). Sum = 100.

| Factor | Weight | Scorer function | Key rule |
|--------|--------|-----------------|----------|
| utilisation | 19 | `scoreUtilisation` | cargo/capacity ratio; peak [0.85, 1.05]; part-cargo floor 0.85 |
| timing | 15 | `scoreTiming` | verdict-shaped: ideal=1.0, tight=0.7, idle→continuous 0.1–0.65, late=0.05 |
| ballast | 15 | `scoreBallast` | sqrt-decay inside class radius; hard 0 at 2× radius |
| classFit | 9 | `scoreClassFit` | DWT/cargo ratio; peak [1.05, 1.35]; part-cargo ≥0.95 |
| cargoType | 6 | `scoreCargoTypeQuality` | vessel type + last-cargoes keyword match |
| cranes | 6 | `scoreCranes` | geared=100%; gearless→port cranes check; includes SWL/operator detail |
| volume | 3 | `scoreVolume` | stowage ratio vs grain capacity |
| draft | 2 | `scoreDraft` | passes hard-filter result; borderline = marginal |
| vetting | 7 | `scoreVetting` | 5-factor: flag/class/age/P&I/CII via `computeVesselVetting` |
| economics | 18 | `scoreEconomics` | tanh gradient: `0.5 + 0.5×tanh((tce−breakeven)/breakeven)` |

### 2.2 Sanctions + Charterer Penalty

- MEDIUM sanctions → `-8 pts`
- Charterer tier `weak` → `-4 pts`; `second` → 0; `blue-chip` → 0

### 2.3 Gating Caps

Applied after linear sum — can only lower fit:

| Cap trigger | Ceiling |
|-------------|---------|
| `readiness.verdict === 'late'` | 38 |
| non-part-cargo utilisation < 40 % | 54 |
| `ballastNm > 2× classRadius` | 54 |
| vessel age ≥ 25 yr + EU discharge port | 55 |

### 2.4 matchLevel Derivation

From `lib/sailing/match-scoring.ts:169`:
- `fitPercent ≥ 70 → 'good'`
- `fitPercent ≥ 60 → 'possible'`
- else `'weak'`

Legacy LLM path (`deriveMatchLevel`): score ≥70 → good, ≥40 → possible, else weak.

### 2.5 Ballast Class Radii (BALLAST_GOOD_MAX_NM)

`lib/sailing/match-scoring.ts:192`

| Class | Max nm for 'good' |
|-------|------------------|
| handysize | 1 500 |
| supramax | 2 000 |
| panamax | 2 500 |
| capesize | 4 000 |

### 2.6 Realism Bucket Partition

`pair-analyzer.ts:788`

1. `verdict === 'unknown'` → `insufficientData`
2. `verdict === 'idle' && gapDays > 21` → `lowConfidenceMatches`
3. `matchLevel === 'weak'` → `lowConfidenceMatches`
4. deadfreight (issue starts `'SIZE:'`) → `lowConfidenceMatches`
5. `tceUsdPerDay < breakevenTceByDwt(dwt)` → `lowConfidenceMatches`
6. else → `mainMatches`

Breakeven thresholds (`lib/economics/breakeven-thresholds.ts`):
- DWT ≤ 15 000 → $1 500/day
- DWT ≤ 40 000 → $3 000/day
- DWT ≤ 65 000 → $5 500/day
- DWT > 65 000 → $7 500/day

---

## 3. Economics Chain (TCE)

### 3.1 Entry Points

| Caller | Function | File |
|--------|----------|------|
| pair-analyzer (pre-fit loop) | `computeMatchEconomicsFor` → `computeStoredMatchEconomics` | `pair-analyzer.ts:256` |
| compute-matches (persist) | `computeStoredMatchEconomics` | `compute-matches.ts:11` |
| persist-session-matches | `computeStoredMatchEconomics` | `persist-session-matches.ts` |

### 3.2 Freight Rate Waterfall

`lib/matching/freight-resolver.ts`, function `resolveFreightRate`:

| Tier | Source | Confidence |
|------|--------|-----------|
| 0 | Broker manual override (`manualRateUsdPerMt`) | 1.0 |
| 1 | Parsed from cargo email (`cargo.freightRateUsd`) | 0.9 |
| 2 | Baltic TC day-rate: `($/day × voyageDays) ÷ tonnes` | 0.5 |
| 3 | Estimate: `BASE_RATE[cargoType] × distanceFactor × dwtFactor` | 0.3–0.6 |

Base rates (tier 3): BULK=$20, GRAIN=$18, COAL=$12, IRON_ORE=$10, STEEL=$28, …
Distance factor: <3 000 nm → 1.0; <6 000 nm → 1.3; else 1.6
DWT factor: <20 k → 1.4; <40 k → 1.2; <65 k → 1.0; <120 k → 0.9; else 0.8

### 3.3 computeTce Formula

`lib/economics/compute-tce.ts`, function `computeTce` (line 130). Pure, synchronous, no defaults.

```
grossFreight = quantityMt × freightRate
durationDays = ballastDays + ladenDays + 2   (or round-trip = ladenDays×2+2 if no ballast)
bunkerUsd    = consumption × durationDays × bunkerPrice
canalUsd     = Suez + Bosporus dues (pre-resolved)
daUsd        = load + discharge port disbursement (pre-resolved)
warRiskUsd   = hull + crew + P&I premium (JWC zones)
etsUsd       = EU ETS cost (EUA × emissions × euLegPercent × EUR→USD)
totalCosts   = bunkerUsd + canalUsd + daUsd + warRiskUsd + etsUsd
netVoyage    = grossFreight − totalCosts
tceUsdPerDay = dailyNet / durationDays

Convention: excludeWarRiskFromDailyTce=true in stored path
  → dailyNet = grossFreight − (bunker + canal + da + ets)   [war-risk shown as separate line]
```

### 3.4 Canal Detection

`lib/matching/tce-calculator.ts:307`
- Basin classification: indian/eastafrica/med/blacksea/atlantic/westafrica
- Suez: `(east ↔ west)` pair — triggers both laden and ballast legs
- Bosporus: `(med ↔ blacksea)` pair

Suez quote: `lib/economics/canals/index.ts` (`quoteSuez`)
Bosporus quote: `lib/economics/canals/bosporus.ts` (`quoteBosporus`)
NT approximation: `DWT × 0.65`

### 3.5 EU-ETS Coverage

`tce-calculator.ts:244`, `deriveEtsCoverage`:
- Resolve port → check EU/EEA country via `isEuCountry`
- `euLegPercent = (originEu || destEu) ? 1.0 : 0`

### 3.6 War-Risk Premium

`lib/economics/war-risk.ts`, `calculateWarRiskPremium`:
- JWC HRA zone lookup by port
- Computed separately for laden and ballast legs
- `warRiskTotalCombined = laden + ballast`
- Excluded from `tceUsdPerDay` numerator (stored convention) — shown as breakdown line

### 3.7 Port Disbursement (DA)

`lib/port-da/match-da.ts`, `sumMatchPortDaUsd`:
- Sum for load + discharge port
- Passed as `daUsd` to `computeTce`

---

## 4. Other Chains

### 4.1 Match Dedup

`pair-analyzer.ts:681`:
- `pairKey = cargoEmailId|cargoItemIndex|vesselEmailId|vesselItemIndex`
- `filteredOutKeys` (hard-blocked) → removed from LLM input + output
- `blockedKeys` (final) → ensures no pair in both `matches` and `blockedMatches`
- `matchedKeys` → sweep path skips pairs already returned by LLM

### 4.2 Quote Generation

`lib/quote-jobs/prompt.ts:16`, function `buildQuotePrompt`:

Inputs:
- `parsedCargo` (emailId, cargoType, cargoDescription)
- Original email (from, subject, body up to 1500 chars)
- `ragEnabled` flag
- Optional `matchId` → appends real TCE/freight numbers from `buildMatchQuoteContext`

RAG retrieval (when `ragEnabled=true`):
- `imsbc_vec/fts` → top-3 IMSBC safety context chunks
- `igc_vec/fts` → top-3 IGC grain/gas context chunks
- Prepended to system prompt

System prompt: `DRAFT_QUOTE_SYSTEM_PROMPT` from `lib/prompts.ts`
Output: professional indicative freight quote email text (async job via `ai_quote_jobs` table)

### 4.3 RAG Knowledge Bases

`lib/knowledge/embeddings/retriever.ts` — dispatches by `KNOWLEDGE_BACKEND`:
- `"vertex"` → Vertex AI retriever
- else → SQLite vec0 retriever (`retriever-sqlite.ts`)

Tables (SQLite): `imsbc_vec/fts`, `igc_vec/fts`, `jwc_vec/fts`, `bimco_vec/fts`
Guard: `KNOWLEDGE_RAG_ENABLED=true` required; empty query → `[]`

**Where RAG verdicts affect matching:**
- IMSBC: `checkImsbcLoadability` uses the static JSON (`lib/cargo/imsbc-groups.json`), NOT the vec/fts tables — it is a pure in-memory lookup, not RAG.
- RAG (`imsbc_vec`) is used only in quote prompt injection for human-readable context.
- JWC: `calculateWarRiskPremium` uses a hardcoded port/zone table (`lib/economics/war-risk.ts`) — NOT RAG.
- RAG (`jwc_vec`) is available but not yet wired into the matching gate.
- BIMCO RAG: not yet wired into matching logic.

---

## 5. UI Map

### 5.1 Draft Accordion Pattern (Existing)

Component: `components/match/DraftCalcBreakdown.tsx:59`
- Accordion toggle (`useState(false)`, ChevronDown/ChevronRight icons)
- Shows laden draft formula steps: `fullLoadDraft = 0.4991 × DWT^0.2991`, ratio scaling
- Port rows: estimated draft vs port limit (pass/fail with colour)
- Used in: `app/matches/MatchesClient.tsx:19` (match list cards — DraftCalcBreakdown) and `components/match/MatchWorksheet.tsx:109`

### 5.2 UI Surfaces — Logic Visibility

| UI Surface | Route | Chains currently visualised | Chains NOT yet visualised |
|-----------|-------|---------------------------|--------------------------|
| Match list card | `/matches` | fit-%, fitBreakdown toggle (Show Fit Breakdown button), DraftCalcBreakdown accordion | IMSBC details, JWC/war-risk breakdown, sanctions details, individual hard-filter explanations |
| Match detail — MatchDetailPanel | `/match/[id]` (right panel) | AI Summary (worst-fit rationale one-liner), fit-% headline, fit breakdown table (all 10 factors with rationale) | charterer tier penalty, cap reason, bucket placement explanation |
| Match detail — MatchWorksheet | `/match/[id]` | DraftCalcBreakdown (load + discharge), laycan timing row | ballast distance scoring, utilisation bar, IMSBC group, vetting badges |
| Match detail — EconomicsTab | `/match/[id]` tab | Full TCE waterfall (bunker/canal/da/war-risk/ETS/freight), freight source badge, ballast leg, Baltic index badge | breakeven floor line, cargo stowage assumptions |
| Match detail — VesselsTab | `/match/[id]` tab | Raw vessel data | vetting factor breakdown (flag/class/age/P&I/CII) |
| Compare routes | `/compare-routes` | port distances, canal detection | — |
| Dashboard | `/` | match counts | — |

### 5.3 Recommended Accordion Additions

Following `DraftCalcBreakdown` as pattern (useState toggle + ChevronDown):

| Section to add | Natural location | Chain source |
|---------------|-----------------|-------------|
| Utilisation breakdown | MatchWorksheet or fit breakdown | `scoreUtilisation` + `resolveCargoWeight` |
| Timing / readiness detail | MatchWorksheet (Time row) | `calculateReadinessGap` |
| IMSBC / hold cleanliness | MatchWorksheet or VesselsTab | `checkImsbcLoadability`, `hold-cleanliness.ts` |
| Vetting factors | VesselsTab | `computeVesselVetting` |
| Sanctions explanation | MatchDetailPanel issues section | `checkSanctions` |
| Freight rate waterfall | EconomicsTab (already partially shown) | `resolveFreightRate` tiers 0–3 |
| Breakeven floor | EconomicsTab | `breakevenTceByDwt` |
| Hard filter gate list | New "Filters" accordion on match card or detail | `runHardFilters` |
| Bucket placement reason | MatchDetailPanel | `pair-analyzer.ts:788` partition logic |

---

## 6. Master Table

| Chain | Inputs | Rule / Formula | Output | File:line | In UI now | Suggested addition |
|-------|--------|---------------|--------|-----------|-----------|-------------------|
| **Draft (load)** | DWT, cargo wt, load port | laden draft = `0.4991×DWT^0.2991 × (w/DWT)^0.3`; vs port max | pass/fail + estimatedLadenDraftM | `match-filters.ts:52` | DraftCalcBreakdown accordion on list + worksheet | existing |
| **Draft (discharge)** | DWT, cargo wt, discharge port | Same formula, discharge port | pass/fail | `match-filters.ts:547` | DraftCalcBreakdown accordion | existing |
| **Crane (load)** | vessel.geared, load port | gearless → need shore cranes; BREAK_BULK unverified → amber | pass/fail/warn | `match-filters.ts:80` | fit factor "Cranes" rationale | detailed accordion |
| **Crane (discharge)** | vessel.geared, discharge port | same | pass/fail/warn | `match-filters.ts:548` | fit factor "Cranes" rationale | detailed accordion |
| **Volume** | cargo wt, stowage factor, grainCap | `vol = wt × SF; vol / (grainCap × 1.05)` | pass/fail | `match-filters.ts:165` | fit factor "Volume / hold fit" | detailed accordion |
| **Cargo weight** | cargo wt, DWCC/DWT | `cargoMax ≤ DWCC (or DWT×0.9) × 1.05` | pass/fail | `match-filters.ts:~196` | fit factor "Size / utilisation" | detailed accordion |
| **Cargo↔vessel type** | cargoType, vesselType | hardcoded compat matrix | pass/fail | `match-filters.ts:~230` | fit factor "Cargo type quality" | detailed accordion |
| **IMSBC** | cargo desc, vessel restrictions | JSON group lookup; B + DG-restricted → fail | pass/fail/caution | `imsbc-check.ts` | issues list | IMSBC group accordion |
| **Vessel age** | built, maxVesselAgeYrs | `refYear − built > maxVesselAgeYrs` | pass/fail | `match-filters.ts:~280` | fit factor "Vessel vetting" | detailed accordion |
| **Dimensions** | beam, LOA vs cargo max | numeric comparison | pass/fail | `match-filters.ts:399` | — | hard-filter list accordion |
| **Gear required** | cargoGearRequired, geared, ports | gearRequired + gearless + no cranes → fail | pass/fail | `match-filters.ts:372` | fit factor "Cranes" | detailed accordion |
| **Voyage restriction** | vessel restrictions, ports | restriction matches route | pass/fail | `voyage-restriction.ts` | — | hard-filter list accordion |
| **Flag/Class** | vessel flag/class, cargo requirements | exact match (upper-cased) | pass/fail | `match-filters.ts:335` | — | hard-filter list accordion |
| **War position/voyage** | openPosition, DWT, route | sub-handy in HRA + intercontinental → fail | pass/fail | `match-filters.ts:444` | — | hard-filter list accordion |
| **Laycan / readiness** | openDate, laycan, port distance, speed | `arrival = open + dist/speed/24; gap = lcStart − arrival` | verdict: ideal/tight/idle/late/unknown | `readiness-gap.ts:178` | MatchWorksheet Time row (text) | timing detail accordion |
| **Sanctions** | flag, ports, restrictions | hardcoded blocked list | blocking/MEDIUM/none | `sanctions.ts` | issues list | sanctions accordion |
| **utilisation fit** | cargo wt, DWCC/DWT | piecewise curve; peak [0.85, 1.05]; part-cargo floor 0.85 | score 0–19 | `fit-breakdown.ts:99` | fit breakdown table | utilisation bar |
| **timing fit** | readiness.verdict + gapDays | verdict-shaped + continuous idle penalty | score 0–15 | `fit-breakdown.ts:158` | fit breakdown table | timing detail |
| **ballast fit** | distanceNm, vesselDwt | sqrt-decay by class radius; 0 at 2× radius | score 0–15 | `fit-breakdown.ts:210` | fit breakdown table | ballast accordion |
| **classFit** | cargo wt, DWT | DWT/cargo ratio piecewise | score 0–9 | `fit-breakdown.ts:253` | fit breakdown table | class fit note |
| **cargoType fit** | cargoType, vesselType, lastCargoes | type match + history keywords | score 0–6 | `fit-breakdown.ts:298` | fit breakdown table | — |
| **cranes fit** | geared, loadPort, dischargePort | geared=100%; gearless→port crane check incl. SWL/operator | score 0–6 | `fit-breakdown.ts:364` | fit breakdown table | detailed cranes |
| **volume fit** | cargo wt, grain cap, stowage | stowage ratio vs grain cap | score 0–3 | `fit-breakdown.ts:403` | fit breakdown table | — |
| **draft fit** | hardFilters.draft | reuses hard-filter result | score 0–2 | `fit-breakdown.ts:449` | fit breakdown table | — |
| **vetting fit** | vessel (flag, class, built, P&I, CII), PSC detentions | 5-factor `computeVesselVetting`; score 0–1 | score 0–7 | `fit-breakdown.ts:472` | fit breakdown table | vetting factors accordion |
| **economics fit** | tceUsdPerDay, vesselDwt | `tanh((tce−breakeven)/breakeven)` gradient | score 0–18 | `fit-breakdown.ts:511` | fit breakdown table | breakeven line in EconomicsTab |
| **sanctions penalty** | sanctions.risk | MEDIUM → −8 pts | penalty | `fit-breakdown.ts:639` | fit breakdown table | sanctions note |
| **charterer tier** | charterer tier | weak → −4; second/blue-chip → 0 | penalty | `fit-breakdown.ts:70` | fit breakdown table (notes) | charterer accordion |
| **gating caps** | verdict, utilisation, ballast, age+EU | late→ceil 38; util<40%→ceil 54; ballast>2×r→ceil 54; age25+EU→ceil 55 | fitPercent cap | `fit-breakdown.ts:650` | fit breakdown (appliedCap) | cap reason callout |
| **matchLevel** | fitPercent | fit ≥70 good; fit ≥60 possible; else weak | matchLevel | `match-scoring.ts:169` | match card colour badge | — |
| **bucket partition** | verdict, gapDays, matchLevel, econ | unknown→insufficient; idle>21d→lowConf; weak→lowConf; deadfreight→lowConf; tce<breakeven→lowConf | bucket | `pair-analyzer.ts:788` | — | bucket reason accordion |
| **freight waterfall** | manualRate / parsedRate / balticRate / estimate | 4-tier priority; tier-2: `($/day × days) / qty` | freight $/mt + source | `freight-resolver.ts:55` | EconomicsTab source badge | waterfall steps accordion |
| **Suez canal** | load/discharge port basins | east↔west basin pair → transit | canalUsd | `tce-calculator.ts:307` | EconomicsTab canal line | — |
| **Bosporus canal** | port basins | med↔blacksea | canalUsd | `tce-calculator.ts:312` | EconomicsTab canal line | — |
| **War risk (laden)** | load/discharge ports, vesselValue | JWC zone lookup + hull+crew+P&I premium | warRiskUsd | `war-risk.ts`, `tce-calculator.ts:366` | EconomicsTab war-risk line | — |
| **War risk (ballast)** | openPosition, loadPort | JWC zone lookup for reposition leg | warRiskUsd (ballast) | `tce-calculator.ts:372` | EconomicsTab (limited) | ballast war-risk line |
| **EU-ETS** | ports, euLegPercent, EUA price | `euaPrice × emissionMt × euLeg × EUR→USD` | etsUsd | `ets.ts`, `compute-tce.ts:206` | EconomicsTab ETS line | — |
| **breakeven floor** | tceUsdPerDay, DWT | DWT-tiered floor; below → lowConfidence | bucket gate | `breakeven-thresholds.ts` | — | line in EconomicsTab |
| **TCE summary** | all above | `(grossFreight − costs) / durationDays` | tceUsdPerDay | `compute-tce.ts:130` | EconomicsTab headline | — |
| **IMSBC RAG** | cargo description | vec/fts retrieval imsbc_vec, topN=3 | system prompt context | `quote-jobs/prompt.ts:34` | Quote tab (injected context) | — |
| **IGC RAG** | cargo description | vec/fts retrieval igc_vec, topN=3 | system prompt context | `quote-jobs/prompt.ts:39` | Quote tab (injected context) | — |
| **JWC RAG** | (not wired to matching) | jwc_vec available but not used in gate | — | `retriever.ts` | — | future: JWC gate accordion |
| **Hold cleanliness** | lastCargoes, cargoType | L5C matrix | issue in match.issues | `hold-cleanliness.ts` | issues list | hold cleanliness accordion |
| **Dedup** | pairKey | filteredOutKeys + blockedKeys + matchedKeys sets | no cross-bucket duplicates | `pair-analyzer.ts:229–690` | — | — |
| **Quote job** | parsedCargo, email, matchId | DRAFT_QUOTE_SYSTEM_PROMPT + RAG context + match economics | draft email text | `quote-jobs/prompt.ts:16` | Quote tab | — |

---

*Inventory complete. No files modified.*
