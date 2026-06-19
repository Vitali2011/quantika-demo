# RECON: Last Cargoes — LLM Extraction via Claude Subscription

**Date:** 2026-06-19  
**Worktree:** `recon-lc-llm`  
**Status:** RECON_DONE

---

## Q1 — Where are raw email bodies?

### DB schema

```
data/demo-seed.db  (empty placeholder; production copy: /root/work/qd-golden/data/demo-seed.db)

Table: emails
  account_id       TEXT NOT NULL  (always 'demo' for seed)
  gmail_message_id TEXT NOT NULL  (PK component; matches parsed_results.gmail_message_id)
  body             TEXT           ← raw anonymised email body, plain text
  ...
  PRIMARY KEY (account_id, gmail_message_id)

Table: parsed_results
  account_id       TEXT NOT NULL
  gmail_message_id TEXT NOT NULL
  parse_type       TEXT NOT NULL  ('vessel' | 'cargo' | ...)
  result_json      TEXT NOT NULL  (JSON array of ParsedVessel items per email)
  ...
  PRIMARY KEY (account_id, gmail_message_id, parse_type, parser_version)
```

Migration source: `lib/migrations/031-email-cache.ts`

### Corpus numbers (from LLM cache + golden DB)

| Metric | Count |
|---|---|
| Raw email files in `.private/raw-emails/` | 153 |
| Emails in `emails` table | 153 |
| Classified as `VESSEL_POSITION` | 53 |
| Rows in `parsed_results WHERE parse_type='vessel'` | **50** |
| Total vessel items across those 50 rows | **117** |
| 3 emails classified vessel but with no parsed items | 3 (parse failures/skipped) |

The task reference to "48 vessel emails" is the count of emails where **all vessel items have `lastCargoes = null`** — confirmed by DB:
```sql
SELECT COUNT(*) FROM parsed_results WHERE parse_type='vessel';  -- 50
-- 2 emails have ≥1 item with lastCargoes set → 48 are fully null
```

### Reading body for a vessel email

```sql
SELECT e.body
FROM emails e
JOIN parsed_results pr
  ON e.account_id = pr.account_id
  AND e.gmail_message_id = pr.gmail_message_id
WHERE pr.parse_type = 'vessel'
  AND e.account_id = 'demo'
  AND e.gmail_message_id = '<target_id>';
```

Source scripts:
- `scripts/demo-seed/analyze.ts` — `extractTextBody()` decodes base64url from Gmail JSON → `emails.body`
- `scripts/demo-seed/build.ts` — inserts anonymised body (`anonBody`) into `emails`

---

## Q2 — Reliable per-vessel cargo attribution in multi-vessel emails

### The problem

`extractLastCargoesFromBody(body)` in `lib/parsing/lastcargoes-fallback.ts` returns **one string per email**, not per vessel. For a multi-vessel email with 3 ships, applying this one result to all items assigns the same (possibly wrong) cargo to every vessel in the email.

### Pattern that works (email `19e0f544fba5e7ab`, 3 vessels)

```
MV YA HUSSEIN    DWT 24,290 MTS    ALEXANDRIA, EGYPT 04-05 JULY
(LAST CARGO CORN IN BULK)          ← per-vessel inline, no label "L/C:"

MV AYA           DWT 27,239 MTS    MARMARA, TUZLA - REVERTING
(EX DD)                            ← ex-drydock, NOT cargo

MV ARTICULATE    DWT 27,308 MTS    CANAKKALE, 05 JULY
(LAST CARGO WHEAT IN BULK)         ← different cargo per vessel
```

LLM result (confirmed in DB):
```
item 0: vesselName=SEAGULL 75  lastCargoes="corn in bulk"
item 1: vesselName=SEAGULL 59  lastCargoes=null   (EX DD correctly excluded)
item 2: vesselName=SEAGULL 76  lastCargoes="wheat in bulk"
```

### Pattern that works (email `19d5e79432c6caf9`, 1 vessel)

```
L5C: GENERAL CARGO/TAPIOCA CHIPS/COAL/COAL/BAUXITE, I.ORE

M/V "GLORY TOM"
VESSEL (IMO): 9701360
...
```

LLM result: `lastCargoes="general cargo, tapioca chips, coal, coal, bauxite, iron ore"`.  
Regex fallback also catches this (`L5C:` pattern). For single-vessel emails with header-style markers, regex and LLM converge.

### Attribution rules

| Pattern | Single-vessel email | Multi-vessel email |
|---|---|---|
| Header `L5C: X` / `L/C: X` / `Last cargo: X` | ✅ LLM + regex both work | ⚠️ Regex assigns to ALL items. LLM assigns to the vessel whose block immediately precedes the marker (if email layout allows) |
| Inline `(LAST CARGO X)` per vessel line | ✅ trivial (only one vessel) | ✅ LLM reads per-vessel block structure; correctly assigns different cargoes to different ships |
| Prose `Just completed X` / `Previously carried X` | ✅ LLM + regex both work | ⚠️ Regex: email-level only. LLM: depends on whether prose is inside per-vessel block |

**Key invariant for LLM extraction:** the vessel parse prompt returns a JSON **array** (one item per vessel). The LLM reads each vessel's block independently and fills `last_cargoes` per item. `parse-vessel-helpers.ts:parseVesselAIResponse()` maps `item.last_cargoes` → `item.lastCargoes`. This is the only path that achieves true per-vessel attribution.

**Binding key is NOT IMO** — of 117 vessel items in the LLM cache, only 34 have `imo` set. The LLM binds cargo to vessel via positional context within the email (the block structure). IMO is available as secondary confirmation, not as the primary attribution key.

---

## Q3 — DB patch path for `lastCargoes` by IMO

### Existing pattern (email-level, from `backfill-lastcargoes.ts`)

```typescript
// 1. Reads body from emails JOIN parsed_results
// 2. Calls extractLastCargoesFromBody(body) → one string
// 3. Calls patchResultJsonLastCargoes(result_json, lastCargoes)
//    → stamps SAME value on ALL items where lastCargoes is null
// 4. UPDATE parsed_results SET result_json = ? WHERE account_id=? AND gmail_message_id=? AND parse_type='vessel'
```

This is **correct for single-vessel emails**. For multi-vessel emails it's wrong — see Q2.

### LLM-extraction patch path (IMO-keyed, per-vessel)

For LLM-extracted cargoes, the result comes as `parsedVessels[n].lastCargoes` keyed by `emailId + itemIndex`. Since IMO is absent in many items, the canonical key is `(emailId, itemIndex)` or `(emailId, vesselName.value)`.

```typescript
// Pseudocode for IMO-keyed or index-keyed patch
function patchResultJsonByImo(
  resultJson: string,
  patches: Array<{imo?: string | null, vesselName?: string, lastCargoes: string}>
): { json: string; patched: number } {
  const raw = JSON.parse(resultJson);
  const items = Array.isArray(raw) ? raw : [raw];
  let patched = 0;
  for (const item of items) {
    for (const p of patches) {
      const imoMatch = p.imo && item.imo === p.imo;
      const nameMatch = p.vesselName && item.vesselName?.value === p.vesselName;
      if ((imoMatch || nameMatch) && item.lastCargoes == null) {
        item.lastCargoes = p.lastCargoes;
        patched++;
      }
    }
  }
  return { json: JSON.stringify(Array.isArray(raw) ? items : items[0]), patched };
}
```

SQL update (same as existing backfill pattern):
```sql
UPDATE parsed_results
SET result_json = ?
WHERE account_id = ? AND gmail_message_id = ? AND parse_type = 'vessel';
```

### Does regen need to run after patching?

**Yes**, if you care about match correctness. `lastCargoes` flows into two places:

1. `lib/matching/hold-cleanliness.ts` — **gates** matches (can BLOCK a send if previous cargo is incompatible with new cargo). Affects `match.status` and `match.reason`.
2. `lib/matching/due-diligence.ts` — scores the DD panel (hold-cleanliness score). Affects match ranking.

After patching `parsed_results.result_json`, run:
```bash
npx tsx scripts/demo-seed/regenerate-matches.ts --db data/demo-seed.db [--dry]
```

Pattern: `scripts/demo-seed/apply-to-prod.md` for the full runbook.

---

## Q4 — Real yield: how many of 50 vessel emails have last-cargo data?

### Result: **2 out of 50 vessel emails (4%)** contain real last-cargo information.

| Email ID | Subject | Pattern | Vessels affected |
|---|---|---|---|
| `19d5e79432c6caf9` | FW: DWT 63695 - OPEN CASABLANCA END AUG/EARLY SEP | `L5C: GENERAL CARGO/TAPIOCA CHIPS/COAL/COAL/BAUXITE, I.ORE` | 1 vessel (GLORY TOM, IMO 9701360) |
| `19e0f544fba5e7ab` | FW: EXCLUSIVE HANDIES - 24K DWT EGYPTMED 04-05 JULY | `(LAST CARGO CORN IN BULK)` / `(LAST CARGO WHEAT IN BULK)` | 2 of 3 vessels (YA HUSSEIN + ARTICULATE); AYA correctly null |

### What the regex fallback misses vs what LLM already caught

The **regex fallback** (`lib/parsing/lastcargoes-fallback.ts`) would catch:
- `L5C: ...` — YES (pattern `L5C` in `LC_PATTERNS`)
- `(LAST CARGO X)` — **NO** (no inline parenthetical pattern in the regex)

The **LLM** already caught both cases correctly when the LLM cache was built.

**The regex fallback was wired as a safety net (`parse-vessel-helpers.ts:347`):**
```typescript
if (!lc) return emailBody ? extractLastCargoesFromBody(emailBody) : null;
```
This fires only when LLM returns null. For `19d5e79432c6caf9`, the LLM got `L5C:` directly.
For `19e0f544fba5e7ab`, the LLM got the inline pattern directly. The regex fallback never needed to fire for these 2 emails — and correctly fires for 0 of the 48 null emails (confirmed by scan: no regex patterns found in those bodies).

### False positives in broader scan

Running the regex patterns against all 154 corpus emails found `L/C:` in 14 emails — but 12 of those are **cargo inquiry emails** where `L/C:` means **Laycan**, not Last Cargo. Two vessel emails had `L/C` as part of reference numbers (`SSL/CHT/2026`). Zero false-positive extractions in actual `parsed_results`.

---

## Q5 — Honesty contract: extract only explicitly stated

### Current behavior

The vessel parse prompt (`lib/prompts/parse-vessel.ts:427`) already states:
> "Only leave last_cargoes null if the email contains NO references to past cargo"

The LLM obeyed this correctly:
- AYA vessel: `(EX DD)` = ex drydock → LLM returned `null` (correct, drydock is not a cargo)
- 48 emails with zero LC text → all return `null` (correct)

### What the panel should do

For the `lastCargoes` display in the DD panel:
- **`lastCargoes != null`** → show the cargo list
- **`lastCargoes == null`** → show "No data" (not "0 cargoes", not a blank)

The 48/50 emails where this is null are genuinely not disclosing past cargo — it is honest to show "No data". No fabrication should be attempted.

### Scope of LLM extraction gain

If a new LLM pass were run on the raw email bodies (using the existing `parse-llm-direct.ts` infrastructure with `claude-opus-4-8` via our Claude subscription), the **expected gain is 3 vessel items** across 2 emails. The remaining 48 vessel emails truly lack any last-cargo signal. This matches the existing LLM cache output — re-running would not improve yield.

---

## Summary

| Question | Answer |
|---|---|
| Q1 Body column | `emails.body` TEXT, joined via `(account_id, gmail_message_id)` |
| Q1 Vessel row count | 50 rows in `parsed_results WHERE parse_type='vessel'`; 117 items total |
| Q2 Reliable attribution | LLM array-per-vessel is the only correct path for multi-vessel emails; regex is email-level and would corrupt multi-vessel cases |
| Q3 Patch path | Extend `lastcargoes-patch.ts` for per-item keying by `(emailId, itemIndex)` or `(emailId, vesselName)`; run `regenerate-matches.ts` after |
| Q4 Real yield | 2 emails / 3 vessel items with real data; 48 emails genuinely null |
| Q5 Honesty | Show "No data" for null; do not fabricate; LLM already extracted all that exists |

---

RECON_DONE: `docs/research/recon-lastcargoes-llm-2026-06-19.md`
