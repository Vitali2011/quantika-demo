# Wave D1 — list display: null vessel name + polish bundle (#806, #807)

**Branch off `origin/main`.** Tier **M**, **risk-override** only for the name-normalizer part (#806) → `/test-skill` real shapes for that. Independent of E1 (E1 = economics engine; D1 = display/render). qa-walker loop handoff 2026-06-03.

## #806 — null vessel_name renders blank (cf #786)
- **Root:** #786 normalized raw-hash vessel names but a literal `null`/empty `vessel_name` slips through the same path → renders blank/"M/V". The seed stores `vessel_name = null` for some rows (resolved at hydration via vessel_id → name; that resolution misses the null case). Match 41865 visible with `vessel_name = null`.
- **Fix:** in the same name-normalization used by #786 (grep `vessel_name` + the A1 #794 TBN fallback in `app/matches/MatchesClient.tsx` ~1036-1038), ensure `null`/empty/whitespace → the **TBN** fallback (or a resolved name from vessel_id), never a blank cell. Also check the hydration/name-resolution site (`lib/demo-mode/hydrate-demo-session.ts` / wherever vessel_name is set) so the seed itself carries a name where resolvable. Render-side TBN fallback is the defensive floor; prefer a resolved name when vessel_id maps to one.
- Verify (risk-override real shapes): vessel_name = null / '' / '   ' / a raw hash / a real name → renders TBN for the empty cases, the real name otherwise. Never blank.

## #807 — polish bundle (MED M1 + LOW L1–L4)
- **M1 (MED): column header "SCORE" shows fit_percent.** The header reads SCORE but the values are fit% (41.8–73.8), not the legacy score (65–100). Fix: rename the header to **"FIT %"** (the product moved to fit% — align the label with the value). `app/matches/MatchesClient.tsx` table header + the card view if it mirrors.
- **L1: counts disagree** — filter pill "27" vs heading "13 results" vs visible(fit≥60) vs API 28. #802 fixed the heading to the floor-filtered count; the **"All" quick-filter pill** still shows the pre-floor count. Make the All-pill, the heading, and the visible rows all use the SAME floor-filtered count (`fit_percent >= 60`). One number everywhere.
- **L2: rate input "5,75"** (comma decimal) in Economics → Freight Rate Override. Should be **"5.75"** (en-US, consistent with #788 locale). Find the rate input value formatting (`components/match/EconomicsTab.tsx`) → use `.` decimal.
- **L3: bunker port shown as LOCODE** "TRIST"/"ROCND" instead of human "Istanbul"/"Constanta" (TRIST misreads as Trieste). Resolve the LOCODE → port display name in the bunker/economics table (use the existing port resolver `resolvePort`/port-master). Show the human name; keep LOCODE as a tooltip/secondary if useful.
- **L4: cargo weight inconsistency** on 41847 — "2,000 mt" (Weight row) vs "2,200 mt" (Class-fit note). One match shows two weights. Trace which field each reads (`weightMt` vs `weightMtMax`/breakdown) → display ONE consistent weight (prefer the same field the fit/economics use).

## Verify
- #806 name-normalizer: real-shape unit test (null/''/ws/hash/real). FULL `npm test` 0 failures; `tsc` clean; `git status` clean. Grep `__tests__/` for matches-table / vessel-name / count guards first (v3.18.0 sweep — #802 touched the count, #794/#799 touched the table).
- UI change → preview after merge (matches auth-gated locally → founder prod-verify, same as prior matches waves).

## Out of scope
- TCE economics divergence (#804/#805) → E1. The actual seed regen → orchestrator post-merge.

Auto-PR to main on QA PASS. Emit `<<TESTSKILL=PASS|FAIL findings=N>>`.
