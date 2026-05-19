# match parser eval — round R6

**Scenarios:** 25
**Generated:** 2026-05-19T10:06:05.258Z

## Summary by category

| Category | Scenarios | Pass checks | Warn | Fail |
|---|---|---|---|---|
| no-match | 11 | 10 | 0 | 1 |
| strong | 3 | 8 | 3 | 0 |
| marginal | 5 | 10 | 7 | 0 |
| weak | 6 | 19 | 4 | 0 |

## Per-scenario detail

### etms-match-001-strong-marmara-bsea (no-match)

**Cargo:** `etms-parse-cargo/scenario-042` | **Vessel:** `etms-parse-vessel/scenario-004` | **Duration:** 2266ms

**Expected:** hard-filter drop. Reason: DWCC 2000 mt < cargo 2500 mt — cargo exceeds vessel cargo capacity (overload)

**Got:** 0 matches (blocked=2)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=2)

### etms-match-002-strong-eastmed-bulk (strong)

**Cargo:** `etms-parse-cargo/scenario-024` | **Vessel:** `etms-parse-vessel/scenario-048` | **Duration:** 19313ms

**Expected:** level=`possible` score=40-60

**Got:**
- score=47 level=`possible` readiness=`idle` gap=16.83d
- breakdown: Geographic proximity=16/20, Cargo type match=12/20, Cargo handling (cranes)=12/15, Volume / hold fit=12/15, Laycan fit=10/20, DWT class fit=10/10

**Verdict:** pass=3 warn=1 fail=0

- ✓ All 1 match scores 47 in expected [40,60]
- ✓ All match_level = possible
- ⚠ 3/4 must-cite facts present
    MISSING: "Both spot dates"
- ✓ No hallucinations from 4 guards

### etms-match-003-strong-aegean-bsea (strong)

**Cargo:** `etms-parse-cargo/scenario-030` | **Vessel:** `etms-parse-vessel/scenario-028` | **Duration:** 16668ms

**Expected:** level=`good` score=65-80

**Got:**
- score=73.6 level=`good` readiness=`ideal` gap=0.87d
- breakdown: Geographic proximity=8/20, Cargo type match=11.2/20, Cargo handling (cranes)=15/15, Volume / hold fit=8.399999999999999/15, Laycan fit=14/20, DWT class fit=7/10

**Verdict:** pass=4 warn=0 fail=0

- ✓ All 1 match scores 73.6 in expected [65,80]
- ✓ All match_level = good
- ✓ All 3 must-cite facts present (semantic)
- ✓ No hallucinations from 4 guards

### etms-match-004-marginal-med-atlantic-gearless-bb (marginal)

**Cargo:** `etms-parse-cargo/scenario-018` | **Vessel:** `etms-parse-vessel/scenario-020` | **Duration:** 372133ms

**Expected:** level=`null` score=15-75

**Got:** 0 matches (blocked=9)

**Verdict:** pass=1 warn=2 fail=0

- ⚠ No matches in output (expected null score 15-75)
- ⚠ 0/3 must-cite facts present
    MISSING: "DWT 3827 mt vs cargo 2720 mt (71% utilization)"
    MISSING: "Vessel open Skikda 18/19 May, cargo Nemrut laycan 15/18 May — vessel arrives AFTER laycan close"
    MISSING: "Gearless vessel for break-bulk cargo — depends on load/disch port crane availability"
- ✓ No hallucinations from 4 guards

### etms-match-005-marginal-oversize-vessel (no-match)

**Cargo:** `etms-parse-cargo/scenario-054` | **Vessel:** `etms-parse-vessel/scenario-036` | **Duration:** 2263ms

**Expected:** hard-filter drop. Reason: Vessel draft 10.55m exceeds Sfax port max 10m — cannot berth at load port

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-006-marginal-redsea-eastmed-tight (marginal)

**Cargo:** `etms-parse-cargo/scenario-060` | **Vessel:** `etms-parse-vessel/scenario-012` | **Duration:** 18054ms

**Expected:** level=`possible` score=40-70

**Got:**
- score=40.6 level=`possible` readiness=`unknown` gap=?d
- breakdown: Geographic proximity=2/20, Cargo type match=16/20, Cargo handling (cranes)=15/15, Volume / hold fit=12/15, Laycan fit=5.6/20, DWT class fit=10/10

**Verdict:** pass=4 warn=0 fail=0

- ✓ All 1 match scores 40.6 in expected [40,70]
- ✓ All match_level = possible
- ✓ All 3 must-cite facts present (semantic)
- ✓ No hallucinations from 4 guards

### etms-match-007-weak-idle-months (weak)

**Cargo:** `etms-parse-cargo/scenario-066` | **Vessel:** `etms-parse-vessel/scenario-040` | **Duration:** 43689ms

**Expected:** level=`weak` score=10-40

**Got:**
- score=37.8 level=`weak` readiness=`idle` gap=12.91d
- score=36.6 level=`weak` readiness=`unknown` gap=?d
- score=33 level=`weak` readiness=`idle` gap=67.65d
- score=33 level=`weak` readiness=`idle` gap=54.57d
- score=32.6 level=`weak` readiness=`unknown` gap=?d
- score=28 level=`weak` readiness=`unknown` gap=?d
- breakdown: Geographic proximity=4/20, Cargo type match=12/20, Cargo handling (cranes)=15/15, Volume / hold fit=12/15, Laycan fit=7/20, DWT class fit=2.8/10

**Verdict:** pass=4 warn=0 fail=0

- ✓ All 6 match scores 37.8,36.6,33,33,32.6,28 in expected [10,40]
- ✓ All match_level = weak
- ✓ All 3 must-cite facts present (semantic)
- ✓ No hallucinations from 4 guards

### etms-match-008-weak-oversize-late-gearless-bb (no-match)

**Cargo:** `etms-parse-cargo/scenario-006` | **Vessel:** `etms-parse-vessel/scenario-052` | **Duration:** 2631ms

**Expected:** hard-filter drop. Reason: DWCC 1600 mt << cargo 4800 mt — vessel only carries 33% of cargo (severe under-lift)

**Got:** 0 matches (blocked=2)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=2)

### etms-match-009-weak-months-late (weak)

**Cargo:** `etms-parse-cargo/scenario-036` | **Vessel:** `etms-parse-vessel/scenario-008` | **Duration:** 17633ms

**Expected:** level=`weak` score=10-30

**Got:**
- score=25.799999999999997 level=`weak` readiness=`idle` gap=222.1d
- breakdown: Geographic proximity=12/20, Cargo type match=11.2/20, Cargo handling (cranes)=15/15, Volume / hold fit=8.399999999999999/15, Laycan fit=10/20, DWT class fit=4.199999999999999/10

**Verdict:** pass=4 warn=0 fail=0

- ✓ All 1 match scores 25.799999999999997 in expected [10,30]
- ✓ All match_level = weak
- ✓ All 3 must-cite facts present (semantic)
- ✓ No hallucinations from 4 guards

### etms-match-010-no-match-undersized-wrong-region (no-match)

**Cargo:** `etms-parse-cargo/scenario-012` | **Vessel:** `etms-parse-vessel/scenario-036` | **Duration:** 2325ms

**Expected:** hard-filter drop. Reason: DWT 32131 mt < cargo 55000 mt (vessel cannot lift cargo)

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-011-no-match-tiny-vessel (no-match)

**Cargo:** `etms-parse-cargo/scenario-054` | **Vessel:** `etms-parse-vessel/scenario-004` | **Duration:** 1698ms

**Expected:** hard-filter drop. Reason: DWT 2570 mt << cargo 12000 mt (vessel can carry ~21% of cargo)

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-012-no-match-sanctions-ukraine-odesa (no-match)

**Cargo:** `etms-parse-cargo/scenario-091` | **Vessel:** `etms-parse-vessel/scenario-011` | **Duration:** 1776ms

**Expected:** hard-filter drop. Reason: vessel restriction "No Ukraine trading" matches Odesa origin (Ukraine) — HIGH sanctions risk, blocking

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-013-no-match-sanctions-ukraine-soya-odesa (no-match)

**Cargo:** `etms-parse-cargo/scenario-088` | **Vessel:** `etms-parse-vessel/scenario-049` | **Duration:** 16106ms

**Expected:** hard-filter drop. Reason: vessel restriction "no Ukraine voyage for now" matches Odesa origin (Ukraine) — HIGH sanctions risk, blocking

**Got:**
- score=25.9 level=`weak` readiness=`idle` gap=633.77d
- breakdown: Geographic proximity=16/20, Cargo type match=8.399999999999999/20, Cargo handling (cranes)=12/15, Volume / hold fit=10.5/15, Laycan fit=7/20, DWT class fit=7/10

**Verdict:** pass=0 warn=0 fail=1

- ✗ EXPECTED hard-filter but got 1 match(es). Hard-filter reason: vessel restriction "no Ukraine voyage for now" matches Odesa origin (Ukraine) — HIGH sanctions risk, blocking
    Match: score=25.9 level=weak

### etms-match-014-no-match-draft-izmail-shallow (no-match)

**Cargo:** `etms-parse-cargo/scenario-009` | **Vessel:** `etms-parse-vessel/scenario-036` | **Duration:** 1856ms

**Expected:** hard-filter drop. Reason: vessel draft 10.55 m exceeds Izmail port max draft 7.1 m — cannot load

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-015-no-match-draft-reni-river (no-match)

**Cargo:** `etms-parse-cargo/scenario-078` | **Vessel:** `etms-parse-vessel/scenario-027` | **Duration:** 4250ms

**Expected:** hard-filter drop. Reason: vessel draft 9.573 m exceeds Reni port max draft 7.0 m (Danube river port) — cannot load

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-016-marginal-multi-cargo-black-sea-fanout (marginal)

**Cargo:** `etms-parse-cargo/scenario-037` | **Vessel:** `etms-parse-vessel/scenario-027` | **Duration:** 14787ms

**Expected:** level=`weak` score=25-65

**Got:**
- score=31 level=`weak` readiness=`unknown` gap=?d
- breakdown: Geographic proximity=0.8/20, Cargo type match=16/20, Cargo handling (cranes)=15/15, Volume / hold fit=8.399999999999999/15, Laycan fit=8/20, DWT class fit=2.8/10

**Verdict:** pass=3 warn=1 fail=0

- ✓ All 1 match scores 31 in expected [25,65]
- ✓ All match_level = weak
- ⚠ 3/4 must-cite facts present
    MISSING: "Multiple items have null/unspecified weights → confidence penalty"
- ✓ No hallucinations from 4 guards

### etms-match-017-weak-multi-cargo-sparse-asia-fanout (weak)

**Cargo:** `etms-parse-cargo/scenario-059` | **Vessel:** `etms-parse-vessel/scenario-046` | **Duration:** 38916ms

**Expected:** level=`weak` score=5-35

**Got:**
- score=33 level=`weak` readiness=`unknown` gap=?d
- score=33 level=`weak` readiness=`unknown` gap=?d
- score=28.200000000000003 level=`weak` readiness=`unknown` gap=?d
- score=25.800000000000004 level=`weak` readiness=`unknown` gap=?d
- score=23.4 level=`weak` readiness=`unknown` gap=?d
- breakdown: Geographic proximity=2/20, Cargo type match=16/20, Cargo handling (cranes)=15/15, Volume / hold fit=7/15, Laycan fit=8/20, DWT class fit=5/10

**Verdict:** pass=3 warn=1 fail=0

- ✓ All 5 match scores 33,33,28.200000000000003,25.800000000000004,23.4 in expected [5,35]
- ✓ All match_level = weak
- ⚠ 3/4 must-cite facts present
    MISSING: "A few items in same region (Ras Al Khaimah→Shuaiba 50000 mt, Fujairah→Mogadishu 50000 mt) overload vessel — should hard-filter individually"
- ✓ No hallucinations from 4 guards

### etms-match-018-marginal-multi-vessel-east-med-fanout (marginal)

**Cargo:** `etms-parse-cargo/scenario-024` | **Vessel:** `etms-parse-vessel/scenario-020` | **Duration:** 3087ms

**Expected:** level=`possible` score=35-70

**Got:** 0 matches (blocked=8)

**Verdict:** pass=1 warn=2 fail=0

- ⚠ No matches in output (expected possible score 35-70)
- ⚠ 0/4 must-cite facts present
    MISSING: "Vessel email contains 8 GULF-series vessels, cargo matched against each (fanout)"
    MISSING: "Cargo Mersin→Tartous 5000 mt bulk spot — East Med short-haul"
    MISSING: "Several vessels open in Med region (EMED, CMED, Aegean, Marmara) — 1-3 day repositioning"
    MISSING: "Vessel DWT range 3827-5244 — closest fit MV GULF EXPRESS 5244 (95% utilization)"
- ✓ No hallucinations from 4 guards

### etms-match-019-weak-multi-vessel-mixed-region-fanout (weak)

**Cargo:** `etms-parse-cargo/scenario-022` | **Vessel:** `etms-parse-vessel/scenario-018` | **Duration:** 2050ms

**Expected:** level=`weak` score=10-40

**Got:** 0 matches (blocked=10)

**Verdict:** pass=1 warn=2 fail=0

- ⚠ No matches in output (expected weak score 10-40)
- ⚠ 0/4 must-cite facts present
    MISSING: "Vessel email contains 10 SKY/SEA-series vessels, cargo matched against each (fanout)"
    MISSING: "Cargo Savona→Samsun 10000 mt bulk 11/14 May — Med→Black Sea via Bosphorus"
    MISSING: "Vessel DWT range 3662-6795 — all under-lift cargo 10000 mt (smallest 36%, largest 68% utilization)"
    MISSING: "Most SKY vessels are 3662-5128 dwt — physical impossibility for 10000 mt as single carry"
- ✓ No hallucinations from 4 guards

### etms-match-020-no-match-cargo-vessel-project-on-bulker (no-match)

**Cargo:** `etms-parse-cargo/scenario-001` | **Vessel:** `etms-parse-vessel/scenario-011` | **Duration:** 2307ms

**Expected:** hard-filter drop. Reason: cargo type PROJECT (14 oversized storage tanks) incompatible with vessel category bulk (MV GLORY TOM is BULK CARRIER) — needs MPP/heavy-lift

**Got:** 0 matches (blocked=2)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=2)

### etms-match-021-no-match-cargo-vessel-breakbulk-on-bulker (no-match)

**Cargo:** `etms-parse-cargo/scenario-002` | **Vessel:** `etms-parse-vessel/scenario-011` | **Duration:** 3986ms

**Expected:** hard-filter drop. Reason: cargo type BREAK_BULK (cement in sling, 30000 mt) incompatible with vessel category bulk (MV GLORY TOM is BULK CARRIER) — needs MPP/general-cargo

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=0 fail=0

- ✓ Hard-filtered as expected (matches=0, blocked=1)

### etms-match-022-weak-russia-route-no-flag-block (weak)

**Cargo:** `etms-parse-cargo/scenario-083` | **Vessel:** `etms-parse-vessel/scenario-026` | **Duration:** 12108ms

**Expected:** level=`possible` score=40-65

**Got:**
- score=51.2 level=`possible` readiness=`unknown` gap=?d
- breakdown: Geographic proximity=6/20, Cargo type match=12/20, Cargo handling (cranes)=15/15, Volume / hold fit=8.399999999999999/15, Laycan fit=5.6/20, DWT class fit=4.199999999999999/10

**Verdict:** pass=3 warn=1 fail=0

- ✓ All 1 match scores 51.2 in expected [40,65]
- ✓ All match_level = possible
- ⚠ 3/4 must-cite facts present
    MISSING: "Vessel flag Liberia (LR) — not RU/IR/BY → checkSanctions returns risk=NONE, no hard-filter"
- ✓ No hallucinations from 4 guards

### etms-match-023-strong-perfect-spot-med-black-sea (strong)

**Cargo:** `etms-parse-cargo/scenario-022` | **Vessel:** `etms-parse-vessel/scenario-035` | **Duration:** 3479ms

**Expected:** level=`good` score=70-90

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=2 fail=0

- ⚠ No matches in output (expected good score 70-90)
- ⚠ 0/4 must-cite facts present
    MISSING: "DWT 10074 mt vs cargo 10000 mt (99% utilization — near-perfect fit)"
    MISSING: "Vessel open Gibraltar, cargo loads Savona — Western Med ~3 days ballast to Italian Riviera"
    MISSING: "Cargo laycan 11/14 May 2026 — vessel spot, dates align tightly"
    MISSING: "Vessel geared MPP (2×30T cranes + 1×30T derrick) suitable for bulk loading"
- ✓ No hallucinations from 4 guards

### etms-match-024-marginal-spot-aligned-long-ballast (marginal)

**Cargo:** `etms-parse-cargo/scenario-015` | **Vessel:** `etms-parse-vessel/scenario-026` | **Duration:** 2564ms

**Expected:** level=`possible` score=35-70

**Got:** 0 matches (blocked=1)

**Verdict:** pass=1 warn=2 fail=0

- ⚠ No matches in output (expected possible score 35-70)
- ⚠ 0/4 must-cite facts present
    MISSING: "DWT 18930 mt vs cargo 10500 mt (55% utilization)"
    MISSING: "Cargo Varna West → Alexandria 10500 mt bulk laycan 14/16 May 2026"
    MISSING: "Vessel MV LADY HATICE open Agadir, geared, draft 8.49 m fits Varna (11.5 m) and Alexandria (12.5 m)"
    MISSING: "Long ballast Agadir → Varna (~10-12 days via Gibraltar + Bosphorus)"
- ✓ No hallucinations from 4 guards

### etms-match-025-weak-sparse-cargo-null-weight (weak)

**Cargo:** `etms-parse-cargo/scenario-026` | **Vessel:** `etms-parse-vessel/scenario-013` | **Duration:** 14759ms

**Expected:** level=`possible` score=35-55

**Got:**
- score=43.6 level=`possible` readiness=`unknown` gap=?d
- breakdown: Geographic proximity=6/20, Cargo type match=12/20, Cargo handling (cranes)=8/15, Volume / hold fit=7/15, Laycan fit=5.6/20, DWT class fit=5/10

**Verdict:** pass=4 warn=0 fail=0

- ✓ All 1 match scores 43.6 in expected [35,55]
- ✓ All match_level = possible
- ✓ All 4 must-cite facts present (semantic)
- ✓ No hallucinations from 4 guards
