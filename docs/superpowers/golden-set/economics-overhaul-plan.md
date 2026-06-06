# Economics overhaul — true-voyage TCE (plan)

> Goal: make the match-list TCE (`buildMatchEconomics`) honest enough that the engine
> distinguishes a GOOD long-haul voyage (coal Mtwara→Matadi, broker ~$8.5k/day) from a
> BAD one (longballast Kandla→Ravenna, broker ~$2.75k/day). Today it can't — the crude
> round-trip model with no canal/DA + a too-low freight estimate values both ~$13-19k.
> This flips `GS-longballast-kandla` (the lone golden-set `it.failing`) green honestly.
>
> Decided 2026-06-06 after a measured prototype proved reposition-ballast ALONE doesn't
> separate them (it inflates everything, or sinks coal too). See BASELINE-2026-06-06.md.

## The distinguisher (why this works)

coal rounds the Cape → **no canal dues**. longballast transits **Suez twice** (laden
Kandla→Ravenna + ballast Casablanca→Kandla) ≈ $500k, on a 39.5k cargo whose freight
(~$1M) can't absorb it. So **canal dues + reposition ballast together** crush longballast
while leaving coal untouched. Class-based consumption + DA keep the rest honest.

## What already exists (wire it, don't build it)

| Module                                | Function                                               | Use                                                                                       |
| ------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `lib/economics/vessel-consumption.ts` | `consFromDwt(dwt)`, `resolveConsMtPerDay(stored, dwt)` | class-based bunker (fixes small-ship over-bunkering — default 25 mt/d sinks a 8k coaster) |
| `lib/economics/canals/index.ts`       | `quoteCanal(...)` (suez/bosporus/panama/kiel)          | canal dues per leg                                                                        |
| `lib/port-da/repository.ts`           | `getPortDa(...)`                                       | load+disch disbursements (needs DB)                                                       |
| `lib/economics/route-decision.ts`     | `decideRoute(...)`                                     | Suez-vs-Cape routing + which legs transit a canal                                         |
| `lib/matching/freight-resolver.ts`    | `resolveFreightRate(...)` tier-2 Baltic                | real market freight ($/day → $/mt) when DB present                                        |
| `lib/economics/voyage-calculator.ts`  | `calculateTCE(...)`                                    | already accepts `canalUsd`, `daUsd` — just fed 0 today                                    |

The match-list path (`buildMatchEconomics` → `computeEstimatedTce` → `calculateTCE`) feeds
`canalUsd: 0`, `daUsd: 0`, default consumption 25, round-trip days, no reposition. That's the gap.

## Build sequence (each step = full regression gate)

Each increment shifts demo TCE, so each lands with `npm run golden` + the full
`lib/matching + lib/sailing + lib/economics + lib/__tests__/matching + app/api/ai` regression
(≈ the 1564+312+87 set) green. `GS-longballast-kandla` flips green only after steps 1-2 combine;
do NOT expect golden movement until then.

1. **Class consumption** — `buildCanonicalTceInputs` / `computeEstimatedTce`: default
   consumption via `resolveConsMtPerDay(parsed, dwt)` not the flat 25. Foundational: makes TCE
   reliable across sizes (small ships stop being artificially loss-making — this is what broke
   the bucket-test "positive control" when an absolute TCE floor was tried).
2. **Reposition ballast** — fold the open→load leg into the voyage span (the reverted prototype:
   `ballastDistanceNm` through `buildMatchEconomics` → `buildCanonicalTceInputs`; span =
   ballast + laden + port, ballast-unknown → legacy round-trip). Decide A (single-voyage) vs
   B (reposition+round-trip) by which keeps coal green AND sinks longballast once canal is in.
3. **Canal dues** — `buildMatchEconomics`: detect canal transit per leg (laden + ballast) via
   `decideRoute`/route basin, `quoteCanal` the dues, pass `canalUsd` to `calculateTCE`. THE
   distinguisher (Suez×2 on longballast, none on coal).
4. **Port DA** — wire `getPortDa(loadPort)+getPortDa(dischPort)` → `daUsd`. Needs the DB handle
   (analyzePairs already takes `options.db`); skip gracefully when absent (golden runner).
5. **Re-introduce the economic floor** — now that TCE is reliable, demote main matches with
   true-voyage TCE below a vessel-class cash breakeven to review (replaces/augments the current
   util-only deadfreight floor). longballast (thin after 1-4) → review → `verdict` flips green;
   coal/mang/olive stay above → main.
6. **Tighten golden bands** — once TCE is honest, re-peg `expected.tcePerDay` to the broker
   centrals in `verified-pairs.json` with a real ±% band, and the distance band to ±3-5%
   (currently ±90% computability). Then the oracle guards magnitude, not just sign.

## Proven recipe (measured 2026-06-06) — what actually separates coal from longballast

Step 1 (class consumption) is **DONE + clean** (commit dbe1529b; golden 68/68, regression 1903/1903).
A measured prototype then proved the exact combo that flips longballast green while keeping coal green
— but it requires a PREREQUISITE the plan missed:

- **PREREQUISITE — verified freight into the golden runner.** Without a DB the runner uses the crude
  `estimateFreightRate` (~$31/t for coal), which is too low and sinks coal once reposition+canal land.
  Feed the broker's verified $/mt (from `verified-pairs.json`) into the fixture → runner passes it as
  the resolved freight. Then golden TCE reflects reality (coal ~$52/t, longballast ~$26/t).
- With verified freight + reposition (Option B) + Suez dues, the measured outcome is clean:
  - **coal** (freight $52, Cape route → NO canal): TCE ≈ **+$9.1k/day** → stays main ✓
  - **longballast** (freight $26, Suez × 2 ≈ $500k + reposition): TCE ≈ **−$5.1k/day** → demoted ✓
    The distinguisher is exactly the canal: coal pays none, longballast pays Suez twice.
- Then a below-OPEX / negative-TCE floor (step 5) demotes longballast → `verdict` flips green.

So the next LANDABLE unit is the **combo** (verified-freight-into-runner + reposition + Suez canal +
floor) — it cannot land piecemeal, because reposition or canal ALONE sinks coal too. Canal wiring
(per-leg Suez/Bosporus/Panama detection from the route + `quoteCanal`, DB-graceful) is the substantial
sub-piece. DA (step 4) and band-tightening (step 6) follow.

## **DONE (commit a73787bf, 2026-06-06)**: combo landed — golden 68/68, regression 1912/1912

Steps 1–5 (class consumption + verified freight + reposition + Suez canal + economic floor) all landed.
`GS-longballast-kandla` is now a green `it` (removed from `xfail`). No `it.failing` remain.

Remaining: step 4 (port DA — needs live DB handle) and step 6 (tighten TCE/distance bands to broker
centrals once TCE is fully reliable end-to-end in the demo pipeline, not just in the golden runner).

## Risks / notes

- **Broad blast radius**: steps 1-4 shift EVERY demo match's TCE. Matching tests that assert
  specific TCE numbers will need re-baselining (legitimate — the spec improved). Budget regression
  iteration per step.
- **DB-less golden runner**: steps 3-4 need route/DA data; the golden runner passes no DB, so
  guard every DB/lookup path to degrade gracefully (golden uses canal-by-route-geometry where
  possible, skips DA).
- **Multi-session**: this is days, not hours. Land it increment-by-increment, each behind a green
  full-regression gate; never bundle.
