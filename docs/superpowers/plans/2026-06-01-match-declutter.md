# Plan: match-page declutter + laycan-source unify (founder tasks 1+2 folded)

## Context
The /match/<id> page repeats the same fields 3-4x across layers: top VESSEL/CARGO cards + Svodka(worksheet) + KEY FACTS + AI SUMMARY + SOURCE ATTRIBUTION + FIT SCORE. The Svodka (worksheet, shipped earlier) is now the richest view -> make it the single source; remove the duplicating layers. ALSO the CARGO card shows TWO different laycans: page.tsx L254 uses the correct computed `laycanDisplay`, but L297 uses raw `cargo.preferredDates` (old wide window, no year, e.g. "Jan 19-Apr 7") -> unify to `laycanDisplay`.

## Goal
Declutter so each fact appears once (in Svodka/tabs); top cards become compact identity-only; KEY FACTS removed; AI SUMMARY removed-or-real-insight; SOURCE ATTRIBUTION collapsed; utilisation number consistent between Svodka and FIT SCORE; CARGO-card laycan uses the same computed window everywhere.

## Files (probed on origin/main @ today)
- `app/match/[id]/page.tsx`:
  - L74-75 `laycanDisplay = fmtLaycan(laycan_start, laycan_end)` (in scope — KEEP, it is correct).
  - L209-213 VESSEL card "DWT ... MT" -> REMOVE (DWT lives in Svodka/Vessels tab). Keep Name + Fit% + Status only.
  - CARGO card: keep route (Load->Discharge) + Laycan one line. L297 `...(cargo.preferredDates ? [{label:'Laycan', value: cargo.preferredDates}] : [])` -> replace source with `laycanDisplay` (this is folded task 1). Remove cargo fields already shown in Svodka.
  - L84 + L100-101 `keyFacts` array (incl. laycanDisplay) passed to the panel -> becomes DEAD once Key Facts block removed -> delete the dead array + prop.
- `components/match/MatchDetailPanel.tsx`:
  - L130+ "Key Facts" block -> REMOVE (100% duplicate of Svodka: Load/Discharge/Cargo/DWT/Laycan/Status all in worksheet).
  - L71-81 "AI Summary" (`Fit X% — vzvesheno po faktoram nizhe`) -> REMOVE the filler card; OR replace with ONE real insight (top watch-items from gap-notes/vetting) IF that data is readily available on the match object; if not readily available, just REMOVE.
- `components/match/SourceAttributionSection.tsx`:
  - Collapse by default (expandable "Istochniki" disclosure). KEEP the unique [*] citations inside. Do NOT delete the section.
- utilisation sync (step 5): Svodka(Weight) shows "85% utilisation" (DWT-based); FIT SCORE shows "Size/utilisation 100%" (capacity/DWCC-based). Make the Svodka utilisation render the SAME capacity-based value the fit-engine uses (read it from fit_breakdown / the same source FIT SCORE uses, at render time).
  - HARD CONSTRAINT: if the 85% value is baked into `worksheet_json` (demo-seed DB) and cannot be made consistent at render time without REGENERATING the seed -> STOP, write QUESTIONS.md, report it. Do NOT regenerate demo-seed.db (separate founder-gated task).

## Steps (subagent-driven-development)
1. Read page.tsx + MatchDetailPanel.tsx + SourceAttributionSection.tsx + the worksheet/Svodka component to map EVERY field render and where utilisation comes from.
2. Remove KEY FACTS (panel) + the now-dead keyFacts array/prop (page). Grep to confirm nothing else consumes it.
3. AI Summary: real insight if trivially available, else remove the card.
4. Slim VESSEL card (Name+Fit+Status) and CARGO card (route + laycanDisplay one line). Fix L297 laycan source -> laycanDisplay.
5. Collapse SOURCE ATTRIBUTION (default-collapsed; preserve citations).
6. Utilisation: Svodka utilisation == fit-engine capacity-based value (render-time). If blocked by seed -> STOP + QUESTIONS.md.
7. Build; visual self-check that every removed field is STILL present in Svodka/tabs (zero data loss). `npx tsc --noEmit` + `npm run lint` clean.

## Out-of-scope (orchestrator-set)
- Do NOT touch `fmtLaycan` / structural dates (they are correct).
- Do NOT touch FIT SCORE / "pokazat raschet", Vessels/Economics/Passport/Quote tabs, Quick Actions, or the Svodka's own internal content.
- Do NOT regenerate demo-seed.db. If utilisation requires it -> report, do not do it.
- Do NOT touch `components/match/EconomicsTab.tsx` (in-flight PR) or `tests/fixtures/voyage-tce/*` (in-flight PR).

## Acceptance (founder, on prod)
1. No KEY FACTS block; ports/DWT/laycan not repeated 3-4x.
2. Top cards compact (name/Fit/status + route/laycan).
3. SOURCE ATTRIBUTION collapsed, expands on click.
4. utilisation in Svodka == FIT SCORE (one number).
5. CARGO-card laycan == Svodka laycan == everywhere (format "2026-06-03-06-06"; no "Jan 19-Apr 7").
6. No real data lost — everything still in Svodka/tabs.
UI-PR -> Gate 3 (before/after screenshot of /match/<id>) MANDATORY + Gate 5.
