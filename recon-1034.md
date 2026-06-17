# RECON-1034: Draft Quote picks wrong cargo item from multi-cargo email

**Date**: 2026-06-17  
**Severity**: HIGH — Class B (provenance / wrong commercial document)  
**Status**: ROOT CAUSE IDENTIFIED, no code changed

---

## ROOT CAUSE

`scripts/quote-workshop/worker.ts:40` — the worker resolves `parsedCargo` from session
using **emailId alone**, not `emailId + itemIndex`:

```typescript
// BUGGY (worker.ts:40)
const parsedCargo = (session?.parsedCargos ?? []).find(
  (r: { emailId: string }) => r.emailId === job.email_id,
);
```

For a multi-cargo email, `session.parsedCargos` contains **two entries with the same
`emailId`** but different `itemIndex`. The `.find()` always returns the **first array
element** — which is `itemIndex=0`, the Djibouti/Tadjourah ~8-9k MT sibling —
regardless of which item the match is for.

The match IS for `itemIndex=1` (Berbera 2800 MT), but the prompt gets `itemIndex=0`
data. The LLM generates a quote for the wrong cargo.

---

## CONFIRMED DATA (demo session)

Two emails both carry the dual-cargo pattern:

| emailId             | itemIndex | dest                    | weight     |
|---------------------|-----------|-------------------------|------------|
| `19e07cd18529fb77`  | 0         | Djibouti or Tadjourah   | None (8-9k)|
| `19e07cd18529fb77`  | **1**     | **Berbera**             | **2800 mt**|
| `19e0f50b19f0c25b`  | 0         | Djibouti or Tadjourah   | None (6.5-9k)|
| `19e0f50b19f0c25b`  | **1**     | **Berbera**             | **2800 mt**|

Source: `lib/sample-data/demo-parsed-cargoes.json` confirmed with `cargo-inquiries.json`
(BA Chartering email `19e07cd18529fb77` and Niavigrains email `19e0f50b19f0c25b`).

---

## FULL CALL PATH

```
[browser] QuoteTab.tsx (user clicks Generate)
  → useQuoteJob.ts: start()
  → POST /api/ai/draft-quote { emailId, matchId }
  → app/api/ai/draft-quote/route.ts
      • DraftQuoteBodySchema: { emailId, matchId }            [api-schemas.ts:3-6]
      • session.parsedCargos.find(r => r.emailId === emailId) [route.ts:21] — existence check only
      • enqueueQuoteJob(db, { sessionId, emailId, matchId })  [store.ts:33-62]
          INSERT ai_quote_jobs (id, session_id, email_id, status, match_id)
          ── job.match_id = matchId (correct)
          ── job.email_id = emailId (correct — shared between items)
  → ensureWorker()                                            [ensure-worker.ts]
  → npm run quote:workshop → scripts/quote-workshop/worker.ts

[worker] worker.ts:35-73
  1. claimNextJob(db)                                         [store.ts:64-73]
  2. session = store.getSession(job.session_id)
  3. parsedCargo = session.parsedCargos.find(r => r.emailId === job.email_id)
     ↑↑↑ BUG HERE — returns itemIndex=0 (Djibouti), not itemIndex=1 (Berbera)
  4. buildQuotePrompt({ parsedCargo, email, matchId: job.match_id, db })
     • parsedCargo (item 0) → "Parsed cargo inquiry data" block in user prompt
     • buildMatchQuoteContext(db, matchId) → MATCH ECONOMICS block (correct route)
     LLM gets: parsedCargo=Djibouti|8-9kMT + economics=Berbera (confusing signal)
  5. callClaudeCliRaw(system, user, MODEL)
     → LLM generates for Djibouti/8-9k (parsedCargo drives the subject/route/qty)
```

---

## THE DATA SEAM

`ParsedCargo.itemIndex` (`lib/types.ts:207`) exists and is populated in every
multi-cargo email. The matching layer already keys correctly by `emailId|itemIndex`:

```typescript
// persist-session-matches.ts:50 — CORRECT
const cargoMap = new Map(parsedCargos.map(c => [`${c.emailId}|${c.itemIndex}`, c]));
const cargo = cargoMap.get(`${m.cargoEmailId}|${m.cargoItemIndex}`);

// app/match/[id]/page.tsx:85-88 — CORRECT
const cargo = session.parsedCargos.find(
  c => c.emailId === sessionMatch.cargoEmailId && c.itemIndex === sessionMatch.cargoItemIndex
);
```

The match DB row stores `cargo_item_index` (migration 051, `persist-session-matches.ts:195`).
The job row stores `match_id` (migration 049). The worker has `job.match_id` available.
`getMatch(db, matchId)` returns the stored match with `cargo_item_index`.

The seam is: **the worker ignores `job.match_id` when resolving `parsedCargo`**.

---

## SECONDARY BUG (store-level dedup)

`lib/quote-jobs/store.ts:38-41` deduplicates active jobs on `(session_id, email_id)`:

```typescript
// store.ts:38-41
const existing = db.prepare(
  `SELECT * FROM ai_quote_jobs WHERE session_id=? AND email_id=? AND status IN ('queued','processing')
   ORDER BY created_at DESC LIMIT 1`,
).get(input.sessionId, input.emailId);
if (existing) return existing;
```

And the unique index (migration 048):
```sql
CREATE UNIQUE INDEX idx_quote_jobs_active_dedupe ON ai_quote_jobs(session_id, email_id)
WHERE status IN ('queued','processing');
```

If a user generates a quote for item 0 (Djibouti), then navigates to item 1 (Berbera)
and generates — the API returns the **existing wrong-item job** without creating a new one.
This blocks the correct quote even if the worker bug were fixed.

Requires: migration to add `cargo_item_index` column + dedup on `(session_id, email_id, cargo_item_index)`.

---

## RECOMMENDED FIX

### Fix 1 — worker.ts (PRIMARY, surgical, no migration needed)

File: `scripts/quote-workshop/worker.ts`, line 40

```typescript
// BEFORE (broken):
const parsedCargo = (session?.parsedCargos ?? []).find(
  (r: { emailId: string }) => r.emailId === job.email_id,
);

// AFTER (correct):
import { getMatch } from '@/lib/matching/matches-repository';

let targetItemIndex = 0;
if (job.match_id && /^\d+$/.test(job.match_id)) {
  const m = getMatch(db, Number(job.match_id));
  if (m?.cargo_item_index != null) targetItemIndex = m.cargo_item_index;
}
const parsedCargo = (session?.parsedCargos ?? []).find(
  (r: { emailId: string; itemIndex: number }) =>
    r.emailId === job.email_id && r.itemIndex === targetItemIndex,
);
```

Requires no new migration. `job.match_id` is already stored (migration 049).
`getMatch` already called in `buildMatchQuoteContext` — same pattern.

### Fix 2 — store.ts (SECONDARY, dedup key repair)

Requires migration to add `cargo_item_index INTEGER DEFAULT 0` to `ai_quote_jobs`.
Update dedup query and unique index to include `cargo_item_index`.
Update `enqueueQuoteJob` signature, `INSERT` statement, and pass `cargo_item_index`
from the API route (extract from stored match via `matchId`).

### Not needed

- No changes to `DraftQuoteBodySchema`
- No changes to `QuoteTab.tsx` or `MatchTabs.tsx` or `use-quote-job.ts`
- `buildMatchQuoteContext` already resolves correct route — only `parsedCargo` is wrong

---

## TRACE_READ

Primary files to read before implementing:
- `scripts/quote-workshop/worker.ts:30-75` — fix location
- `lib/quote-jobs/store.ts:33-62` — secondary dedup fix
- `lib/migrations/048-ai-quote-jobs.ts` + `049-quote-jobs-match-id.ts` — migration context
- `lib/matching/matches-repository.ts:515-518` — getMatch signature
- `lib/types.ts:205-250` — ParsedCargo with itemIndex

Test to add: `__tests__/api/draft-quote.test.ts` or `lib/quote-jobs/__tests__/prompt.test.ts` —
multi-cargo scenario where parsedCargos has item 0 (Djibouti) AND item 1 (Berbera) for same
emailId, job.match_id → match with cargo_item_index=1, assert worker resolves Berbera not Djibouti.

---

## ACCEPTANCE CRITERIA (from #1034)

| Issue | Criterion | Status | Evidence |
|-------|-----------|--------|----------|
| #1034 | Quote subject uses cargo from matched item (Berbera 2800 MT), not sibling | ✗ | worker.ts:40 finds itemIndex=0 always |
| #1034 | Quantity in quote is 2800 MT (Berbera), not 8-9k MT (Djibouti) | ✗ | Same root cause |
| #1034 | Route in quote is Nemrut→Berbera, not Nemrut→Djibouti/Tadjourah | ✗ | parsedCargo dest drives subject line |

All three ✗ because they share the same root cause. Fix worker.ts:40 to resolve all three.
