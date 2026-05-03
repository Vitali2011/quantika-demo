# progonq run — quantika-demo MATCH_PROMPT hardening

**Skill:** `/progonq` ([SKILL.md](~/claude/skills/progonq/SKILL.md))
**Worktree:** `.claude/worktrees/progonq-matching` (branch `feature/progonq-matching-hardening`)
**Target:** `lib/prompts/match.ts` (`MATCH_PROMPT`) + `lib/prompts/glossary.ts`
**Model under test:** `AI_MODEL_LIGHT` = gpt-4o-mini
**Budget cap:** 20 rounds, $30 OpenAI tokens
**Exit criteria:** 2 consecutive PASS rounds + anti-overfit fresh-corpus PASS + jest regression tests

## Layout

| File | Purpose | Committed? |
|---|---|---|
| `config.yaml` | run config — categories, expert role, budget, exit | ✅ |
| `severity-rubric.md` | matching-domain CRITICAL/HIGH/MEDIUM/LOW | ✅ |
| `design-decisions.md` | inherited from email-parser run + matching-specific | ✅ |
| `schema-gaps.md` | what is intentionally NOT in matcher output | ✅ |
| `corpus/<category>/sample-NNN.json` | LLM input payloads (black-box generated) | ✅ |
| `corpus/manifest.md` | one-line summary per sample | ✅ |
| `state.json` | round counter, consecutive passes | ❌ gitignored |
| `budget.json` | tokens / $ / trajectory | ❌ gitignored |
| `results/run-NNN.json` | parser output for round N | ❌ gitignored |
| `results/qa-NNN.json` | QA verdicts for round N | ❌ gitignored |
| `results/round-NNN-decisions.md` | what was fixed / classified per round | ❌ gitignored |

## Loop entry

Phase 0 (this dir + corpus) → Phase 1 (parse) → Phase 2 (QA) → Phase 3 (decide)
→ Phase 4 (fix prompt) → loop or Phase 5 (harden + regression).
