# Plan: patch existing demo-seed vessels with speed/consumption (#740 unblock)

## Context
The voyage P&L (#740) needs vessel speedLaden + consumption. #736 (commit c396093b) seeds these in scripts/demo-seed/build.ts ("realistic speedLaden+consumption defaults in demo vessel"), BUT the prod demo-seed.db is frozen from BEFORE #736 -> existing parsed_results vessel rows lack speed/consumption -> EconomicsTab shows "Missing: vessel speed, fuel consumption" -> no P&L chart. build.ts CANNOT re-run on prod (raw emails + LLM cache are local-only, not in git). So we patch the existing seed in place.

## Goal
A targeted, IDEMPOTENT patch script that adds #736's exact speedLaden + consumption defaults to existing parsed_results vessel rows that lack them, so the voyage P&L renders. The orchestrator applies it on prod afterwards (--dry first).

## Scope
- NEW `scripts/demo-seed/patch-vessel-speed-consumption.ts`.
- It must mirror build.ts's EXACT #736 speed/consumption default logic — READ build.ts (the #736 lines that set speedLaden+consumption on demo vessels) and reuse the SAME values/formula (by DWT / vessel type). Do NOT invent numbers.
- Reads each parsed_results vessel (parse_type='vessel'); if speedLaden/consumption (the fields EconomicsTab reads) are absent/empty -> add the same default build.ts would produce. Idempotent (skip if already present). `--db <path>` flag (default data/demo-seed.db). `--dry` mode: report counts + 2-3 sample before/after, NO write.

## Steps
1. Read scripts/demo-seed/build.ts #736 logic — find the exact speedLaden + consumption defaults + how EconomicsTab reads them (field names on the parsed vessel: confirm via components/match/EconomicsTab.tsx — it does parseLeadingNumber(vessel?.consumption) etc.).
2. Write patch-vessel-speed-consumption.ts mirroring it; UPDATE parsed_results.result_json for vessels to add the fields.
3. Unit-test the patch logic (mock a vessel row lacking the fields -> patched correctly; a vessel already having them -> unchanged/idempotent). Since the real demo-seed.db is local-only (may be absent on this worktree), test the LOGIC with mock rows, not a real DB.
4. tsc --noEmit + lint clean.

## Out-of-scope
- Do NOT re-parse / run build.ts / touch raw emails or the LLM cache.
- Do NOT change EconomicsTab or the P&L calc (only the seed vessel data via the patch).
- Do NOT change matches/cargo data — only vessel speed/consumption fields.
- Do NOT apply to any real demo-seed.db yourself — the orchestrator applies on prod.

## Risk-override -> /test-skill
This feeds the financial P&L. /test-skill MUST verify: the defaults exactly match build.ts #736; idempotency (re-run = no-op); the patch does not corrupt other vessel fields; vessels that already have speed/consumption are untouched. Require explicit <<EXIT_STATUS=PASS|FAIL>>.

## Acceptance
- patch-vessel-speed-consumption.ts exists; --dry reports N vessels would get speed/consumption matching build.ts defaults; idempotent; unit tests + /test-skill PASS; tsc + lint clean. Commit + push + PR. (Orchestrator runs it on prod after merge.)
