# Plan: Econ #1 — bunker port "on-route" recommendation + savings (wire optimizeSplitBunker)

## Context
Economics tab, Bunker price section. `BUNKER_PORTS` (components/match/EconomicsTab.tsx ~L48) = 5 global ports, default SGSIN (Singapore). For routes like Nemrut Bay -> Liverpool, Singapore is NOT on the voyage path. The engine ALREADY EXISTS: `lib/economics/split-bunker.ts` `optimizeSplitBunker` — picks the cheapest on-route port + computes savings — but it is NOT wired to the UI. Distance is now available in Economics (route distance landed via the prior Economics task that is already merged): `getPortDistance` / port-master + `distanceNm` are in scope on main.

## Goal
Replace the static 5-port / default-Singapore picker with an ON-ROUTE recommendation: pick the cheapest bunker port actually on the voyage path, show a recommendation line "Bunker: <port> — save ~$<N> vs <port2>", default the TCE bunker input to that port+price (manual override stays), and an HONEST fallback if none on-route.

## Scope (Tier M, <= ~5 files)
- `components/match/EconomicsTab.tsx` — bunker section: replace default-Singapore logic with the on-route recommendation; render the recommendation line; feed recommended port+price as the TCE bunker default.
- `lib/economics/split-bunker.ts` — `optimizeSplitBunker` (exists; WIRE it; extend ONLY if strictly needed to surface a single-port recommendation + savings).
- distance: `getPortDistance` / port-master (READ distances; NO hardcoded coordinates).
- bunker prices: `getLatestBunkerPrice` (per candidate port).
- one small helper for the on-route filter IF it keeps EconomicsTab clean.

## Logic
1. On-route filter: detour = dist(from->port) + dist(port->to) - dist(from->to). Port is "on-route" if detour < ~15% of the direct distance (or an absolute cap). Distances from getPortDistance/port-master ONLY (no hardcoded coords).
2. Candidates = BUNKER_PORTS that have an available price (getLatestBunkerPrice), filtered by on-route.
3. Run candidates through optimizeSplitBunker -> recommendation string "Bunker: <port> — save ~$<N> vs <port2>".
4. Recommended port+price = DEFAULT bunker input to TCE (not Singapore). Manual override remains functional.
5. If NO port is on-route -> honest fallback message (NOT a silent Singapore default).

## Out-of-scope (orchestrator-set)
- NOT multi-point split (Variant C) — single recommended port only.
- Do NOT change TCE logic beyond the bunker-price SOURCE/default.
- estimateVoyageDays — use the real distance (already in Economics), not the "20 days" placeholder — ONLY if trivially in scope; otherwise leave it.
- Do NOT touch the P&L chart code or voyage fixtures or the match-page declutter files (page.tsx, MatchDetailPanel.tsx, SourceAttributionSection.tsx) — those are other in-flight PRs.

## Risk-override (financial: distance thresholds + savings calc) — MANDATORY /test-skill
After impl passes, run /test-skill cold-session adversarial QA. Tests must cover: (a) a clearly off-route port is EXCLUDED; (b) the cheapest on-route port is chosen; (c) savings vs the alternative matches optimizeSplitBunker; (d) the no-on-route fallback path (no silent Singapore). Require an explicit <<EXIT_STATUS>> PASS|FAIL in the QA report.

## Acceptance
- Bunker section recommends an ON-ROUTE port with savings vs an alternative, not a static Singapore default.
- TCE bunker input defaults to the recommended port+price; manual override still works.
- No-on-route case shows an honest fallback.
- All distances come from port-master (no hardcoded coords).
- /test-skill PASS; npx tsc --noEmit + npm run lint clean.
UI-PR -> Gate 3 (founder prod Gate 5).
