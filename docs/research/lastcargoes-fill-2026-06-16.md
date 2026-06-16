# lastCargoes Backfill Recon — 2026-06-16

**Status:** DRY-RUN ONLY — no prod/seed writes performed  
**DB examined:** `/root/recon-scratch/prod-seed-readonly.db` (prod-shaped seed, 48 vessel rows)  
**Comparison:** `/root/work/qd-golden/data/demo-seed.db` (50 vessel rows)  
**Script:** `scripts/demo-seed/backfill-lastcargoes.ts`  
**Regex source:** `lib/parsing/lastcargoes-fallback.ts`

---

## 1. Extraction Logic

`extractLastCargoesFromBody()` in `lib/parsing/lastcargoes-fallback.ts` uses two regex patterns:

**Pattern 1 — Header-style:**
```
/(?:L\/C|last\s+cargoes?|last\s+loads?|prev(?:ious)?\s*cargoes?|recent\s+cargoes?|recent\s+employment|P\/C|L5C)\s*[:\-–]\s*([\s\S]+?)(?:\n[ \t]*\n|$|...)/gi
```
Matches: `L/C: ...`, `Last cargoes: ...`, `L5C: ...`, `P/C: ...`

**Pattern 2 — Prose-style:**
```
/(?:just\s+completed|previously\s+carried|having\s+carried|last\s+three\s+(?:loads|voyages)\s+(?:were|was|:))\s*[:\-–]?\s*([\s\S]+?)(?:\n[ \t]*\n|$)/gi
```

---

## 2. Coverage — prod-seed-readonly.db

| Category | Count | % of total |
|----------|-------|-----------|
| Total vessel items | 115 | 100% |
| (a) Already have lastCargoes | 3 | 2.6% |
| (b) Would gain from email body regex (dry-run) | **0** | **0%** |
| (c) Still null after backfill | 112 | 97.4% |

**qd-golden (50 rows, 117 items):** same result — 3/117 already set, 0 would gain, 114 still null.

### Dry-run output (prod-seed-readonly):
```
[backfill-lastcargoes] 48 vessel rows | email id → extracted → items touched
  19d5e79432c6caf9 → "GENERAL CARGO/TAPIOCA CHIPS/COAL/COAL/BAUXITE, I.ORE ..." → 0 (already set)
[backfill-lastcargoes] done (dry) — rows-patched=0 items-patched=0
  no-lc-in-body=47 already-set=1 missing-email=0
```

---

## 3. Email Body Analysis

Only **2 of 48 emails** contain any recognizable L/C pattern:

### Email A: `19d5e79432c6caf9` — L5C header (matched by regex)
```
L5C: GENERAL CARGO/TAPIOCA CHIPS/COAL/COAL/BAUXITE, I.ORE
```
- Regex extracts: ✅ "GENERAL CARGO/TAPIOCA CHIPS/COAL/COAL/BAUXITE, I.ORE"
- Vessel item: SEAGULL 11 (1 item in this row)
- **Already set** by LLM parser → backfill patches 0 items

### Email B: `19e0f544fba5e7ab` — parenthetical format (NOT matched by regex)
```
(LAST CARGO CORN IN BULK)
...
M/V SEAGULL 58  DWT 27,239 MTS  (EX DD)   ← no cargo listed
...
M/V SEAGULL 76  DWT 27,308 MTS
(LAST CARGO WHEAT IN BULK)
```
- Regex extracts: ❌ None (parenthetical `(LAST CARGO X)` not in regex patterns)
- 3 vessel items in this row: SEAGULL 74, SEAGULL 58, SEAGULL 75
- LLM extracted 2/3 (SEAGULL 74 → "corn in bulk", SEAGULL 75 → "wheat in bulk")
- SEAGULL 58 has no L/C info → null, not addressable

**46 remaining emails:** No L/C pattern of any kind in email body.

---

## 4. Sample Extractions (items that already have lastCargoes)

These are REAL extractions — either by LLM parser or regex (already done before backfill):

| # | Email ID | Vessel | lastCargoes | Source | Email snippet |
|---|----------|--------|-------------|--------|---------------|
| 1 | `19d5e79432c6caf9` | SEAGULL 11 | general cargo, tapioca chips, coal, coal, bauxite, iron ore | LLM+regex | `L5C: GENERAL CARGO/TAPIOCA CHIPS/COAL/COAL/BAUXITE, I.ORE` |
| 2 | `19e0f544fba5e7ab` | SEAGULL 74 | corn in bulk | LLM only | `(LAST CARGO CORN IN BULK)` |
| 3 | `19e0f544fba5e7ab` | SEAGULL 75 | wheat in bulk | LLM only | `(LAST CARGO WHEAT IN BULK)` |

**Why regex missed Email B:** The parenthetical `(LAST CARGO X)` format is not in `LC_PATTERNS`. The LLM was smarter — it assigned per-vessel (SEAGULL 74 gets corn, SEAGULL 75 gets wheat). If regex were extended to match parentheticals, it would extract the FIRST match ("corn") and assign it to ALL 3 vessels in the email — producing wrong data for SEAGULL 75.

---

## 5. Regex Gap Analysis

**Pattern not covered:** `(LAST CARGO {cargo name})`

**Why not trivial to add:**
- This format is per-vessel within a multi-vessel email
- Regex is email-wide: assigns same extracted value to all vessel items in the email
- Multi-vessel emails with different cargo per vessel → regex would assign first match to all → wrong
- Safe only for single-vessel emails

**Potential extension (single-vessel emails only):**
```typescript
/\(LAST\s+CARGOE?S?\s+([^)]+)\)/gi
```
- Would correctly fill SEAGULL 11 if not already set (but it is)
- Would fill SEAGULL 58's email — but SEAGULL 58 has no `(LAST CARGO X)` itself, neighbors do
- Net new items from this extension: **0** (Email B items: 2 already set, 1 genuinely null)

---

## 6. Apply Plan

### Current state: --apply gains NOTHING
Running `npx tsx scripts/demo-seed/backfill-lastcargoes.ts --apply` on any seed DB produces 0 changes.
The script is correct and safe, but the source data (email bodies) lacks the patterns.

### What would be needed for real lift

**Option A: LLM re-parse of email bodies (recommended for quality)**
- Run LLM extraction specifically for lastCargoes on all 48 vessel emails
- Assign per-vessel (not email-wide like regex)
- Estimated yield: unknown without running — best effort given most emails don't mention past cargoes
- Cost: ~48 LLM calls at email body length
- Script needed: new `scripts/demo-seed/llm-backfill-lastcargoes.ts`

**Option B: Extend regex + re-run (limited gain)**
- Add `(LAST CARGO X)` parenthetical to `extractLastCargoesFromBody()`
- Only safe for single-vessel emails (guard: skip if row has >1 vessel item)
- Estimated yield from 48 vessel rows: likely 0 new (only Email B has the pattern, and its items either already set or truly null)
- Does NOT require founder decision (regex improvement is non-destructive if guarded)

**Option C: Synthetic data generation (REQUIRES FOUNDER DECISION)**
- Generate plausible lastCargoes for 112 null vessels based on vessel type/size
- Data is invented, not from emails — synthetic
- Risk: demo shows artificial data presented as real
- Must be clearly flagged if done

### Match regen required
`lastCargoes` feeds `applyHoldCleanliness()` → `matchLevel` / bucket change.  
Any change to lastCargoes **must** trigger match regen:
```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db <seed.db>
```

### Prod apply steps (REQUIRES FOUNDER EXPLICIT GO)
1. Backup: `cp /root/recon-scratch/prod-seed-readonly.db /root/recon-scratch/prod-seed-backup-$(date +%Y%m%d).db`
2. Dry-run verify: `npx tsx scripts/demo-seed/backfill-lastcargoes.ts --db <path>`
3. Apply: `npx tsx scripts/demo-seed/backfill-lastcargoes.ts --apply --db <path>`
4. Regen: `npx tsx scripts/demo-seed/regenerate-matches.ts --db <path>`
5. Deploy seed to prod: via deploy workflow / systemctl restart quantika-demo

---

## 7. Founder Decisions Required

### Decision 1: How to fill the 112 null vessels
| Option | Gain | Risk | Effort |
|--------|------|------|--------|
| Accept null (status quo) | 0 | hold-cleanliness skipped for 97% | none |
| Regex extension | ~0 new (already captured by LLM) | low | 1h |
| LLM re-parse email bodies | unknown, likely low given sparse data | medium | 1 day |
| Synthetic data | 112 vessels filled | data integrity risk | 2h |

**Recommendation:** Accept null for now OR LLM re-parse if demo impression matters. Synthetic data only if founder explicitly opts in knowing data is invented.

### Decision 2: Synthetic data policy
For the 112 vessels with NO L/C in email body:
- **Option A:** Leave null → hold-cleanliness check silently skipped → matchLevel unaffected
- **Option B:** Generate synthetic data → hold-cleanliness check activates → bucket changes
- **Must decide:** Is it acceptable to show synthetic lastCargoes in the demo?

---

## 8. Honesty Statement

- **3/115 vessels** have REAL lastCargoes extracted from actual email content
- **0 additional** would gain real lastCargoes from running the backfill script
- **2 email bodies** contain L/C hints; LLM already extracted what it could (2 of them)
- **Generating values for 112 vessels = synthetic data** — separate founder decision, NOT done in this recon
- The backfill script (`backfill-lastcargoes.ts`) is correct; the limitation is data sparsity in source emails
