# Recon: EUA Carbon Price Freshness Gate

> **Audit-2 finding**: `getLatestEuaPrice` has no max-age check — it returns any
> row regardless of how old the `price_date` is. This recon maps all call-sites,
> analyses the blast radius, documents the existing bunker sibling pattern, and
> proposes a fix plan.

---

## 1. ROOT — why there is no gate

`lib/market/eua-repository.ts:11-19` — `getLatestEuaPrice` runs:

```sql
SELECT … FROM eua_prices WHERE contract_type = ? AND price_date <= date('now')
ORDER BY price_date DESC LIMIT 1
```

The `price_date <= date('now')` guard is a **future-row filter** (it drops
forward-dated prices), not a staleness gate. There is no `WHERE price_date >=
date('now', '-N days')` clause. The function returns the single newest row that
exists regardless of age — 1 day, 10 days, 3 months.

The repository itself is designed as a thin DB accessor. Staleness policy is
expected to live in callers — but no caller enforces it for P&L purposes.

---

## 2. All call-sites — `getLatestEuaPrice`

| # | File | Line | Context | Stale behaviour today |
|---|------|------|---------|----------------------|
| 1 | `lib/market/eua-repository.ts` | 11 | Definition | — |
| 2 | `lib/economics/bunker-routing.ts` | 182 | `resolveOnRouteBunkerCandidates` — feeds `euaPriceEur` into `computeBunkerComparison` (effective $/MT carbon surcharge) | Silently uses old price; no log, no skip |
| 3 | `lib/matching/stored-match-economics.ts` | 144–147 | `computeStoredMatchEconomics` — the **canonical write path** for `tce_usd_per_day`; EUA feeds ETS cost in every match created/updated | Silently uses old price for every match write |
| 4 | `app/api/voyage/tce/route.ts` | 354 | GET `/api/voyage/tce` — live TCE calculator for the detail page; `euaTrigger` path (EU endpoint) | Silently uses old price in voyage P&L |
| 5 | `app/api/market/benchmark/route.ts` | 82 | GET `/api/market/benchmark?indicator=EUA` — market KPI panel | **Has** `stale: ageMs > 7d` flag in response JSON but **does not skip or error** |
| 6 | `app/api/market/eua-kpi/route.ts` | 7 | GET `/api/market/eua-kpi` — dashboard EUA widget | Returns data + `period` field; no `stale` flag; no freshness check at all |
| 7 | `lib/knowledge/eua/tradingeconomics-adapter.ts` | 79 | `refreshTradingEconomics` — range guard: calls `getLatestEuaPrice` to log last-good before rejecting out-of-range scraped value | Not a consumer; diagnostic only |
| 8 | `scripts/diag/tce-list-vs-detail-audit.ts` | 84 | Off-line diagnostic script | Not production path |

**P&L-critical sites (ETS cost flows into TCE):** #2, #3, #4.  
**Display-only sites (UI panels):** #5, #6.

---

## 3. What happens today when EUA price is days / weeks stale

### Scenario: cron fails, last EUA row is 10 days old

**Site #3 — stored match economics (every match create/update)**  
`computeStoredMatchEconomics` calls `getLatestEuaPrice` → gets the 10-day-old
row → passes `euaPriceEur` to `buildMatchEconomics` → `calculateEuEts` uses it
→ the computed `etsCostEur` (and therefore `tce_usd_per_day`) is wrong.

No warning is emitted. The match is written to the DB with a silently wrong TCE.
If the EUA price moved 5% (common: EUA is volatile), that's ~$200–$500/day TCE
error on a Supra EU route (rough: 2,000 t fuel × 3.151 CF × 0.7 EUA × €diff ÷
voyage days).

**Site #4 — live TCE route (`/api/voyage/tce`)**  
Same path: stale EUA → wrong ETS line in the breakdown. The UI shows an
incorrect ETS cost and TCE without any staleness indicator.

**Site #2 — bunker routing**  
EUA surcharge is embedded in the "effective $/MT" ranking used to pick the
cheapest on-route bunker hub. Stale EUA slightly distorts port ranking for
EU-route bunker comparison; impact is second-order (port selection changes
only when ports are within margin of each other).

**Site #5 — benchmark API**  
Already sets `stale: true` in the JSON response after 7 days. The API consumer
(UI component) could surface a warning — whether it does depends on the
component; no skip/error.

**Site #6 — eua-kpi API**  
Silently returns old data and `period: row.price_date`; no staleness flag. The
dashboard EUA widget will show an old price with the old date.

### Summary

Stale EUA price **silently corrupts P&L figures** in stored matches and live TCE
calculations. There is no warning logged, no fallback to `FALLBACK_EUA_EUR_PER_TCO2`,
and no UI indicator for the two P&L-critical paths (#3, #4).

---

## 4. Bunker sibling pattern (`bunker-routing.ts:57–58, 127–143`)

```typescript
// lib/economics/bunker-routing.ts:57–58
/** Log a warning if any on-route candidate's price is older than this many days. */
export const BUNKER_STALE_DAYS = 7;

// lines 127–143
const staleThreshold = new Date();
staleThreshold.setDate(staleThreshold.getDate() - BUNKER_STALE_DAYS);
const staleThresholdStr = staleThreshold.toISOString().slice(0, 10);

// …inside per-candidate loop…
if (priceRow.price_date < staleThresholdStr) {
  console.warn(`[bunker-rec] bunker_price_stale: ${candidate} last=${priceRow.price_date}`);
}
```

**Pattern summary:**

- Exported constant `BUNKER_STALE_DAYS = 7` — testable, document-level.
- Date string comparison (ISO `YYYY-MM-DD`), computed once before the loop.
- **Warn-only** on stale: logs `[bunker-rec] bunker_price_stale:` but does NOT
  exclude the candidate or skip the carbon contribution.
- Bunker price also has no hard exclusion — the warn-only choice was deliberate
  (the comment says "no DB write, no exclusion").

The EUA fix can follow the same **log-and-degrade** pattern (warn + return null
from repo, or warn + use FALLBACK in caller) rather than hard-blocking.

---

## 5. Max-age threshold & behaviour recommendation

### Threshold

EEX auctions run weekdays; EUA price is updated 5× per week.

- **7 days** — aligns with `BUNKER_STALE_DAYS`, covers weekends + 1 missed fetch.
- **14 days** — aligns with `eua-icap` bootstrap `stale_threshold_days`.
- **`STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000`** already used in
  `app/api/market/benchmark/route.ts:28` for the EUA display flag.

Recommendation: **7 days** — consistent with bunker sibling, already the UI
contract, matches EEX daily auction cadence.

### Behaviour on stale

Three options:

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A — Warn + use fallback | Return `null` from `getLatestEuaPrice` when stale; callers fall through to `FALLBACK_EUA_EUR_PER_TCO2 = 87.5` | TCE computed with a constant; audit can detect via source flag |
| B — Warn + pass through (bunker pattern) | Add `maxAgeDays` optional param; `getLatestEuaPrice` logs warn but still returns stale row | Mirrors bunker sibling exactly; consumers decide |
| C — Return null + require caller opt-in | Same as A but callers must explicitly pass `allowStale: true` to suppress | Strictest; breaks nothing that already handles `null` |

**Recommendation: Option A** — `getLatestEuaPrice(db, contractType, { maxAgeDays: 7 })` returns `null` when the row's `price_date` is older than `maxAgeDays`. Callers that get `null` already fall back to `FALLBACK_EUA_EUR_PER_TCO2` (site #3 via `tce-calculator.ts:342–344`, site #4 via explicit fallback block at `route.ts:355–358`). This makes staleness visible in `ai_audit` (source becomes the fallback path) without breaking P&L path.

- Log `[eua] eua_price_stale: last=${row.price_date}` at `console.warn`.
- Emit `euaPriceSource.mode = 'auto-fallback'` in the TCE route response (already handled by the `row === null` branch at `route.ts:355–358`).
- `eua-kpi` route: return `stale: true` alongside data when row is returned but old (mirrors benchmark pattern).

---

## 6. Fix plan

### Step 1 — `lib/market/eua-repository.ts`

Add optional `maxAgeDays?: number` param to `getLatestEuaPrice`. When provided,
compute a threshold ISO date and return `null` if `row.price_date < threshold`,
with a `console.warn`. Export a constant `EUA_STALE_DAYS = 7`.

```typescript
export const EUA_STALE_DAYS = 7;

export function getLatestEuaPrice(
  db: Database.Database,
  contractType = 'spot',
  opts?: { maxAgeDays?: number },
): EuaPriceRow | null {
  const row = /* existing query */;
  if (!row) return null;
  const maxAge = opts?.maxAgeDays ?? EUA_STALE_DAYS;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - maxAge);
  const thresholdStr = threshold.toISOString().slice(0, 10);
  if (row.price_date < thresholdStr) {
    console.warn(`[eua] eua_price_stale: last=${row.price_date} threshold=${thresholdStr}`);
    return null;
  }
  return row;
}
```

**Backward-compatible:** all existing callers pass no `opts` — they now get the
7-day gate by default. Callers that genuinely need the raw last-known price can
pass `{ maxAgeDays: Infinity }` or a helper `getLatestEuaPriceUnbounded`.

### Step 2 — callers that need explicit handling

| Call-site | Required change |
|-----------|----------------|
| `lib/matching/stored-match-economics.ts:147` | None — `null` already handled: falls through to `FALLBACK_EUA_EUR_PER_TCO2` via `tce-calculator.ts:342–344` |
| `app/api/voyage/tce/route.ts:354` | None — `null` already handled by `route.ts:355–358` `auto-fallback` branch |
| `lib/economics/bunker-routing.ts:182` | None — `euaPriceEur = euaRow?.price_eur_per_tco2 ?? undefined`; `undefined` → bunker comparison omits ETS surcharge (safe) |
| `app/api/market/benchmark/route.ts:82` | None — `null` → row guard already skips to fallback scraper |
| `app/api/market/eua-kpi/route.ts:7` | Add `stale` field to response: when `null` returned, return `{ stale: true, error: 'EUA price stale or unavailable' }` with 404 or 200 + flag |
| `lib/knowledge/eua/tradingeconomics-adapter.ts:79` | Pass `{ maxAgeDays: Infinity }` — this caller wants the last-good price for range validation, not freshness enforcement |

### Step 3 — tests

Update `__tests__/lib/market/eua-repository.test.ts`:

- Add: `getLatestEuaPrice returns null for row older than maxAgeDays`
- Add: `getLatestEuaPrice returns row when age equals maxAgeDays (boundary)`
- Add: `getLatestEuaPrice returns stale row when maxAgeDays: Infinity`

### Step 4 — eua-kpi staleness flag

`app/api/market/eua-kpi/route.ts` — mirror benchmark pattern: when `getLatestEuaPrice`
returns `null` (stale), return `{ value: FALLBACK_EUA_EUR_PER_TCO2, stale: true, period: null }` or 404.

---

## 7. Files to change (fix scope)

| File | Change |
|------|--------|
| `lib/market/eua-repository.ts` | Add `EUA_STALE_DAYS`, add `maxAgeDays` param + stale null-return |
| `app/api/market/eua-kpi/route.ts` | Handle `null` from updated `getLatestEuaPrice`; add `stale` flag |
| `lib/knowledge/eua/tradingeconomics-adapter.ts:79` | Pass `{ maxAgeDays: Infinity }` to preserve last-good range check |
| `__tests__/lib/market/eua-repository.test.ts` | 3 new test cases |
| `lib/constants.ts` | (optional) move `EUA_STALE_DAYS` here alongside `FALLBACK_EUA_EUR_PER_TCO2` for co-location |

Callers #2, #3, #4 need **no changes** — their `null` handling already degrades
correctly to fallback.

---

## Status

All existing callers handle `null` gracefully for P&L paths. The fix is a
**non-breaking additive param** on the repository function + 3 test cases.
Tier S (1-file core change, 2-file secondary).
