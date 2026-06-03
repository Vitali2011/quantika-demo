# Wave E1 — Canonical TCE: list and detail must agree (#804 root, #805)

**Branch off `origin/main`.** Tier **M**, **risk-override** (economics engine + seed regen) → mandatory `/test-skill` real shapes + Gate-0 TRACE done (below). qa-walker loop handoff 2026-06-03. **HIGH-RISK: changes the stored tce → requires a C5-style --dry regen before prod-apply (founder gate).**

## Gate-0 TRACE (REVISED 22:30 — the real root is the LIVE RE-COMPUTE, not the seed)
- **THREE tce computations, not two; the LIVE LIST does NOT read the seed.** The /matches list does NOT display the seed's stored `tce_usd_per_day`. On every demo hydration, `app/matches/page.tsx` calls `persistSessionMatches(...)` (`lib/matching/persist-session-matches.ts`) which **RE-COMPUTES economics** for each pair (`computeEstimatedTce` + `resolveFreightRate`) and writes `user_id=<sessionId>` copies; `listMatches` then reads THOSE. So the seed regen (C1/C2/C5) never reaches the list — the list shows persist's recompute.
- **PROVEN divergence, same pair, same distance:** cargo `19d5de87` × vessel `19e07cf8`, dist 6601nm → **NULL seed (real-matches.ts) = +$774** but **persist recompute = −$102,352** (the catastrophic value the founder sees on a FRESH session, post-reset). Same `computeEstimatedTce`, divergent inputs in persist (consumption and/or `resolveFreightRate` vs `estimateFreightRate`).
- The detail (`/api/matches/[id]` → EconomicsTab) is a THIRD recompute. All three must reconcile to ONE value.

## Fix (REVISED — single source of truth = the stored seed tce; stop the recompute drift)
1. **`persist-session-matches.ts` must PREFER the stored `tce_usd_per_day` from `sessionMatches[i]` when present** (the demo seed already carries the canonical, C1/C2/C5-correct value) and only recompute when it is null/absent (real non-demo user sessions whose `session.matches` have no economics). This single change makes the LIST show the seed value (+$774, not −$102,352). Mirror the same for `freight_rate_usd_per_mt`/`distance_nm` where the stored value exists.
2. **Detail (`/api/matches/[id]` economics + EconomicsTab/VoyageBreakdownChart)** must display the SAME stored `tce_usd_per_day` (not its own recompute), so list == detail to the dollar. If it needs the breakdown, recompute with byte-identical inputs to the seed.
3. **Why not "fix the recompute to match"?** Because three independent recomputes WILL drift again (this is the third time). Read-through to the one stored value the seed computed. Keep the recompute path ONLY as the fallback for sessions with no stored economics, and make that fallback share ONE input-builder with the seed.
- **#805 −$102,352** is THIS bug (persist recompute), not merely a stale session — it reproduces on a fresh session. Fixed by step 1.
- Also check `lib/matching/session-buckets.ts` + `compute-matches.ts` — same recompute pattern; if they feed the review/insufficient buckets shown to the user, apply the same prefer-stored rule.

## Goal
ONE canonical TCE, shown IDENTICALLY on the list and the detail. A small parcel on a long ballast leg may legitimately be negative — that is HONEST (C3 then demotes it); the requirement is that **list == detail**, not that everything is positive.

## Design (locked — reconcile, do not invent a 3rd formula)
1. **Pick the canonical computation = the full `calculateTCE` with round-trip duration + all real voyage costs** (bunker + port DA + canal + war + ETS), the methodology the seed already uses (C2 round-trip). The detail's "Daily TCE" must show the SAME number.
2. **Single source of truth.** Make the detail (`/api/matches/[id]` economics + `EconomicsTab`/`VoyageBreakdownChart`) display the **stored `tce_usd_per_day`** (or recompute with byte-identical inputs to the seed). Eliminate the divergent recompute. If the detail needs the full breakdown, recompute via the SAME inputs the seed used (same distance, same freight rate, same durationDays = `ladenDays*2+2`, same bunker price) so the headline daily TCE matches the stored column to the dollar.
3. **Trace the input divergence and remove it:** diff the inputs the two paths feed `calculateTCE` (durationDays, freightRate source, quantity = real vs `dwt*0.65`, distanceNm, bunker price). Make them one shared helper so they cannot drift again. `buildMatchEconomics` already claims "tceUsdPerDay identical to the persisted column" — verify that's true and route the detail through it.
4. **#805:** once the canonical TCE + a fresh regen run, the −$102k cannot recur in the seed. Add a regen-time **sanity clamp/guard is NOT wanted** (no hiding) — instead ensure the inputs are sane; if a real input genuinely yields an extreme, surface it as low-confidence, but the −$102k specifically was the pre-C1/C2 path which is already fixed in the engine.

## Verify (risk-override — real shapes)
- A unit/integration test: for a representative match, the value returned by the list path (`computeEstimatedTce`/stored) EQUALS the value the detail path (`/api/matches/[id]`) reports, to the dollar. Property: list_tce === detail_tce for N sample matches.
- 41847-class (small parcel, long voyage): list and detail agree; if negative, both negative, same number.
- FULL `npm test` (all ~9051) 0 failures; `npx tsc --noEmit` clean; `git status` clean. Grep `__tests__/` for tce/economics guards first.

## Out of scope (other waves)
- Display polish (SCORE header, counts, comma, LOCODE, weight) → D1 (#807). Null vessel_name → D1 (#806).
- The actual prod **regen** (C5-style --dry → apply) is done by the ORCHESTRATOR after merge+deploy (local/prod exec, Rule #22), NOT in this wave. This wave ships the CODE + a passing test.

Auto-PR to main on QA PASS. Emit `<<TESTSKILL=PASS|FAIL findings=N>>`. Orchestrator HOLDS regen until founder reviews the --dry before/after.
