# Plan — parse-prompt hardening against source_text annotations (T3)

**Tier:** M · risk-override (parser/prompt) → mandatory `/test-skill` · creative=no.
**Branch:** off origin/main (`9cfca018`).
**NOTE:** the re-parse that PROVES the fix needs the local-only corpus (`.private` raw emails) → that verification is an orchestrator LOCAL-LANE tail AFTER this code lands. Subagent delivers prompt-hardening + a validator/unit test only.

## Gate 0 — TRACE
- **Target:** `source_text` field emitted by the cargo/vessel parse prompts.
- **Consumers:** `lib/prompts/parse-cargo.ts` + `lib/prompts/parse-vessel.ts` (the LLM prompts); `lib/sample-data/__tests__/source-text-validity.test.ts` (the guard that source_text is a verbatim substring of the email body).
- **Entry:** seed/re-parse (`scripts/build-sample-data.ts` via `AI_PROVIDER=claude-cli`, corpus-driven — LOCAL only).
- **Real failure data:** during the 2026-06-02 re-parse, Opus-4.8 added parenthetical clarifications / ellipsis ("…") into `source_text` despite the prompt saying "verbatim, character-for-character" (L185-187 of parse-cargo.ts) → 46 entries needed a post-hoc "longest verbatim substring" REPAIR in the regen (band-aid). Root fix = strengthen the prompt so future re-parses need no repair.
- **Parity:** n/a.

## Scope
- `lib/prompts/parse-cargo.ts` + `lib/prompts/parse-vessel.ts`: tighten the source_text instruction to be unambiguous and example-driven:
  - "`source_text` MUST be an EXACT, CONTIGUOUS substring copied character-for-character from the email body. Do NOT add ellipsis (`…` or `...`), parentheticals, clarifications, or summaries. Do NOT join non-adjacent fragments. If the relevant text is long, copy a SHORTER exact contiguous substring rather than paraphrasing or eliding."
  - Add a ✓/✗ example pair (✗ `"loads grain (HSS) … 25000mt"` with inserted ellipsis; ✓ `"25000mt HSS"` exact substring).
- Optional: a unit test asserting the prompt CONTAINS the hardening clause (cheap regression guard), since the behavioral proof needs the corpus.

## Acceptance
- Subagent: prompt hardened + prompt-contains-clause unit test green; `/test-skill` cold QA PASS; full jest green (ignore governance path-artifact).
- **Orchestrator local-lane tail (AFTER merge):** re-parse corpus → `source-text-validity.test.ts` passes with ZERO repairs needed (annotations 0). This is the real proof; flagged for orchestrator, not the subagent.

## Out-of-scope
- Do NOT run the re-parse (needs local corpus — orchestrator does it). Do NOT change parse SCHEMAS or other prompt rules. Do NOT touch matching/economics.

## If stuck → QUESTIONS.md + state.md + stop.
