# Parse-Cargo Phase 1.6 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the parse-cargo eval honest (fix eval-script, scorer, corpus), measure the true model score and a controlled Flash-vs-Pro comparison, then improve the model via targeted prompt few-shots.

**Architecture:** Two checkpoints. Checkpoint 1 fixes the _measurement_ without touching the model/prompt (eval-script maxTokens, scorer base-letter folding, full 95-scenario corpus re-audit) and runs R20a on both Gemini models. Checkpoint 2 improves the _model_ via three prompt edits and runs R20b on the Checkpoint-1 winner. Gates between checkpoints catch regressions.

**Tech Stack:** TypeScript, jest (`ts-jest`), `npx tsx` eval runner, Vertex AI Gemini 2.5, Bedrock judge, VPS (`ssh outreach-vps`) for eval runs.

**Source design:** `docs/plans/2026-05-14-parse-cargo-phase1.6-honest-eval-design.md`

---

## Task 0: Create feature branch

**Files:** none (git only)

**Step 1: Create and switch to the branch**

Working dir: `~/work/quantika-demo` (the real repo, currently on `main` at `8923e91`).

```bash
cd ~/work/quantika-demo
git checkout main && git pull origin main
git checkout -b feat/parse-cargo-phase1.6-honest-eval
```

Expected: `Switched to a new branch 'feat/parse-cargo-phase1.6-honest-eval'`

---

## Task 1: Fix eval-script maxTokens (Checkpoint 1a)

**Files:**

- Modify: `scripts/progonq/run-parse-cargo.ts:321`

**Context:** The eval runner caps model output at 4096 tokens; production (`callAiJson` in `lib/ai-provider.ts:73`) uses 16000. Multi-cargo emails (e.g. scenario 059 = 11 cargoes) overflow 4096, the JSON truncates, and the runner records `{items: []}`. This is a measurement bug, not a model weakness.

**Step 1: Make the change**

In `scripts/progonq/run-parse-cargo.ts`, inside `runScenario`, the `callAiText` options object currently reads:

```ts
        maxTokens: 4096,
```

Change to:

```ts
        maxTokens: 16000,
```

**Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

**Step 3: Smoke-test scenario 059 locally**

Run:

```bash
npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round smoke159 --scenario scenario-059
```

Expected: `item_count_model` is **11** (not 0), `duration_ms` well under 90000. If still 0, stop — the cause is not maxTokens; investigate `extractJson`.

**Step 4: Clean up smoke artifact**

```bash
rm -f .progonq/results/etms-parse-cargo-smoke159.json
```

**Step 5: Commit**

```bash
git add scripts/progonq/run-parse-cargo.ts
git commit -m "fix(progonq): parse-cargo eval maxTokens 4096 → 16000 to match production"
```

---

## Task 2: Scorer — fold special base letters (Checkpoint 1b)

**Files:**

- Modify: `scripts/progonq/run-parse-cargo.ts` (function `normalizePort`, ~line 131-174)
- Test: `scripts/progonq/__tests__/score-items.test.ts`

**Context:** `normalizePort` already lowercases, collapses whitespace, and strips _combining_ diacritics via `NFD` + `[̀-ͯ]` removal. But scenario 071 fails: ref `Bandırma` vs model `BANDIRMA`. The Turkish dotless `ı` (U+0131) is a _base letter_, not a combining mark — `NFD` does not fold it. So `bandırma` ≠ `bandirma`. Fix: add an explicit transliteration map for special base letters **before** the existing NFD strip.

**Scope boundary (deliberate):** This handles only the cosmetic-equivalence class (dotless ı, ł, ø, etc.). It does NOT add fuzzy/Levenshtein matching. Genuine model typos (`Aleaxandroupolis` 089, `Duala` 082) and spelling variants (`Figuera`/`Figueira` 073, `Giurgiulesti`/`Giurgiuleshti` 037) MUST stay red — those are real model output, and the semantic judge already credits the equivalent ones.

**Step 1: Write the failing test**

Add to `scripts/progonq/__tests__/score-items.test.ts`, inside `describe('normalizePort', ...)`:

```ts
it("folds special base letters (dotless i, slashed o, stroked l)", () => {
  expect(normalizePort("BANDIRMA")).toBe(normalizePort("Bandırma"));
  expect(normalizePort("Bandırma")).toBe("bandirma");
  expect(normalizePort("Gdańsk")).toBe("gdansk");
});

it("does NOT fuzzy-match genuine typos", () => {
  expect(normalizePort("Alexandroupolis")).not.toBe(normalizePort("Aleaxandroupolis"));
  expect(normalizePort("Douala")).not.toBe(normalizePort("Duala"));
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest scripts/progonq/__tests__/score-items.test.ts -t "special base letters"`
Expected: FAIL — `normalizePort('Bandırma')` returns `'bandırma'` (dotless ı preserved), not `'bandirma'`.

**Step 3: Write minimal implementation**

In `normalizePort`, immediately **after** `let s = v.trim().toLowerCase().replace(/\s+/g, ' ');` and **before** the `s = s.normalize('NFD')...` line, insert:

```ts
// Fold special base letters NFD does not decompose (dotless ı, ł, ø, etc.).
// Corpus reference uses native spelling; model often returns ASCII.
const BASE_LETTER_FOLDS: Record<string, string> = {
  ı: "i",
  ł: "l",
  ø: "o",
  đ: "d",
  ð: "d",
  þ: "th",
  ß: "ss",
  æ: "ae",
  œ: "oe",
};
s = s.replace(/[ıłøđðþßæœ]/g, (c) => BASE_LETTER_FOLDS[c] ?? c);
```

**Step 4: Run test to verify it passes**

Run: `npx jest scripts/progonq/__tests__/score-items.test.ts -t "normalizePort"`
Expected: PASS — all `normalizePort` tests green, including the new two.

**Step 5: Run the full score-items suite for regressions**

Run: `npx jest scripts/progonq/__tests__/score-items.test.ts`
Expected: PASS — no previously-green test broke.

**Step 6: Commit**

```bash
git add scripts/progonq/run-parse-cargo.ts scripts/progonq/__tests__/score-items.test.ts
git commit -m "fix(progonq): fold special base letters in normalizePort (dotless ı etc.)"
```

---

## Task 3: Full corpus re-audit (Checkpoint 1c)

**Files:**

- Modify: `.progonq/corpus/etms-parse-cargo/scenario-*.json` (only confirmed errors)
- Modify: `docs/plans/2026-05-14-parse-cargo-phase1.6-honest-eval-design.md` (the "Журнал правок корпуса" table)

**Context:** Scenarios 062 and 086 have `CBM/MT` where physics says `ft³/MT` (rice stowage factor 48-62 is cubic feet, not cubic metres). This pattern of annotation error is likely repeated. Re-audit all 95 reference outputs against their source emails.

**This task is research-driven, not TDD.** It uses subagents as independent domain reviewers.

**Step 1: Dispatch 5 parallel audit subagents**

Send ONE message with 5 `Agent` tool calls (subagent_type `general-purpose`), each assigned a contiguous batch:

- Agent 1: scenarios 001-019
- Agent 2: scenarios 020-038
- Agent 3: scenarios 039-057
- Agent 4: scenarios 058-076
- Agent 5: scenarios 077-095

Each agent prompt MUST include:

- Role: senior maritime chartering analyst auditing eval ground-truth.
- Task: for each `.progonq/corpus/etms-parse-cargo/scenario-XXX.json`, read `input.body` and `reference_output`, judge whether the reference is _correct_ given the email. Check: units (CBM vs ft³ — stowage factor 40-70 with a bare number or `'` mark = ft³/MT, NOT CBM/MT), port names, weights/ranges, item count, ConfidenceField structure (`{value, confidence, source_text}`).
- HARD CONSTRAINT: the agent must NOT look at any model output or eval results — judge the reference against the email + domain logic only. This prevents fitting ground-truth to the model.
- Output format: a list of suspicions, one per line: `scenario-XXX | field | current=A | should_be=B | reason`. If a scenario looks correct, say so explicitly.
- Report under 600 words.

**Step 2: Reconciliation pass (main session)**

Collect all 5 reports. For every suspicion:

- Clear-cut (physics/unit errors, malformed structure) → accept.
- Ambiguous → re-read the source email yourself, decide.
- Reject anything that looks like fitting the reference to expected model behaviour.

**Step 3: Apply confirmed corpus fixes**

Edit only the confirmed scenario JSON files. Known starting set: 062 and 086 (`CBM/MT` → `ft³/MT` in both `cargo_description` and `stowage_factor`).

**Step 4: Validate all corpus JSON**

Run:

```bash
for f in .progonq/corpus/etms-parse-cargo/scenario-*.json; do jq -e . "$f" > /dev/null || echo "INVALID: $f"; done
```

Expected: no `INVALID` lines.

**Step 5: Update the design-doc journal**

Fill the "Журнал правок корпуса" table in `docs/plans/2026-05-14-parse-cargo-phase1.6-honest-eval-design.md` with one row per applied fix: `scenario | field | was | now | reason`.

**Step 6: Commit**

```bash
git add .progonq/corpus/etms-parse-cargo/ docs/plans/2026-05-14-parse-cargo-phase1.6-honest-eval-design.md
git commit -m "fix(progonq corpus): Phase 1.6 full re-audit — correct annotation errors (CBM→ft³ etc.)"
```

---

## Task 4: R20a runs ×2 on VPS — Pro and Flash (Checkpoint 1d)

**Files:** none (operational; uses skill `/vps`)

**Context:** With the honest ruler in place, measure the true model score AND close the missing Flash-vs-Pro comparison. Environment is otherwise frozen: `us-central1`, `gemini-2.5-pro` (plain alias — `-002` 404s), Bedrock `claude-sonnet-4-6` judge, temperature 0 / seed 42.

**Step 1: Push branch and pull on VPS**

```bash
git push -u origin feat/parse-cargo-phase1.6-honest-eval
ssh outreach-vps "cd /root/quantika-demo && git fetch origin && git checkout feat/parse-cargo-phase1.6-honest-eval && git pull"
```

**Step 2: Confirm VPS env**

Run: `ssh outreach-vps "grep -E 'PARSE_CARGO_GEMINI_MODEL|GOOGLE_CLOUD_LOCATION' /root/quantika-demo/.env.local"`
Expected: `PARSE_CARGO_GEMINI_MODEL=gemini-2.5-pro`, `GOOGLE_CLOUD_LOCATION=us-central1`.

**Step 3: Run R20a on Pro**

```bash
ssh outreach-vps "cd /root/quantika-demo && tmux new-session -d -s r20a_pro 'npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R20a-pro > /tmp/r20a-pro.log 2>&1; npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --round R20a-pro >> /tmp/r20a-pro.log 2>&1'"
```

Monitor `/tmp/r20a-pro.log` until the judge prints `string_full=` and `semantic_full=`.

**Step 4: Run R20a on Flash**

Temporarily override the model via the env var on the command line (do NOT edit `.env.local` — keep it frozen):

```bash
ssh outreach-vps "cd /root/quantika-demo && tmux new-session -d -s r20a_flash 'PARSE_CARGO_GEMINI_MODEL=gemini-2.5-flash npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R20a-flash > /tmp/r20a-flash.log 2>&1; npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --round R20a-flash >> /tmp/r20a-flash.log 2>&1'"
```

Note: `--env-file` loads `.env.local` first, then the inline `PARSE_CARGO_GEMINI_MODEL` overrides it for this process only.

**Step 5: Record results and check the gate**

Capture `string_full` / `semantic_full` for both runs.

GATE: `R20a-pro string ≥ 81` AND `R20a-pro semantic ≥ 85` (the R19 baseline).

- If gate fails → STOP. The corpus re-audit likely introduced an error. Re-open Task 3 reconciliation before any Checkpoint 2 work.
- If gate passes → record the Flash-vs-Pro decision (design-doc decision tree): the higher scorer is the model for Checkpoint 2's R20b.

**Step 6: Commit the results record**

Copy both result JSONs back and commit, plus append a short results note to the design doc.

```bash
scp outreach-vps:/root/quantika-demo/.progonq/results/etms-parse-cargo-R20a-pro.json .progonq/results/
scp outreach-vps:/root/quantika-demo/.progonq/results/etms-parse-cargo-R20a-flash.json .progonq/results/
git add .progonq/results/etms-parse-cargo-R20a-*.json docs/plans/2026-05-14-parse-cargo-phase1.6-honest-eval-design.md
git commit -m "test(progonq): R20a honest-baseline results — Pro vs Flash"
```

---

## Task 5: Prompt — maritime port abbreviations (Checkpoint 2a)

**Files:**

- Modify: `lib/prompts/parse-cargo.ts` (RULE 4 area, ~line 60-90 — locate the `Nemrut → Nemrut Bay` line)

**Context:** Model expands `EC Greece` to `Eastern Coast Greece (unspecified)` and reads `POC` as `Port of Call`. RULE 4 already holds port-name normalizations.

**Step 1: Make the change**

Find the RULE 4 block containing the `Nemrut` example. Append two bullet rules in the same style:

```
- Coast abbreviations: "EC/WC/NC/SC <country>" → "East/West/North/South Coast <country>"
  (e.g. "EC India" → "East Coast India"). This is a port VALUE, confidence "interpreted".
- "POC" in a Black Sea / Ukraine context → "Port of Chornomorsk", confidence "uncertain"
  (non-standard abbreviation — flag in missing_info).
```

**Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (it is a template string — verify no broken backticks).

**Step 3: Commit**

```bash
git add lib/prompts/parse-cargo.ts
git commit -m "feat(parse-cargo prompt): EC/WC coast abbreviations + POC=Chornomorsk"
```

---

## Task 6: Prompt — cargo-lot segmentation rule (Checkpoint 2b)

**Files:**

- Modify: `lib/prompts/parse-cargo.ts` (numbered RULES section, after the last existing RULE)

**Context:** Scenario 021 — model merges 2 lots into 1 (loses a 30000 MT cargo). Scenario 078 — model splits 1 lot into 2. Need an explicit segmentation rule.

**Step 1: Make the change**

Add a new numbered rule after the current last RULE:

```
RULE 14 — Cargo-lot segmentation: each distinct "rate + route + cargo" block in the
email is exactly ONE item. Lot boundaries are marked by separators ("+++", blank
lines, the word "And", or numbered lists). Do NOT merge two separate lots into one
item, and do NOT split one lot (single route + single cargo) into multiple items
just because it is described over several lines.
```

**Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

**Step 3: Commit**

```bash
git add lib/prompts/parse-cargo.ts
git commit -m "feat(parse-cargo prompt): RULE 14 — cargo-lot segmentation"
```

---

## Task 7: Prompt — fix RULE 11 over-brevity (Checkpoint 2c)

**Files:**

- Modify: `lib/prompts/parse-cargo.ts` (RULE 11, ~line 151-153)

**Context:** RULE 11 ("concise noun phrase, not a full sentence") over-corrected — model truncated a full scrap-cargo description to just `"Scrap"` in scenario 016, losing cargo type and vessel-capacity requirement.

**Step 1: Make the change**

RULE 11 currently reads roughly:

```
11. Use a concise noun phrase — NOT a full sentence.
```

Replace with:

```
11. Use a concise noun phrase — NOT a full sentence. Concise ≠ lossy: keep all
    material cargo facts (commodity type, packaging, vessel/hold requirements,
    dimensions). Drop only filler ("The cargo consists of…"), never substance.
    ✗ "Scrap"  (when the email specifies HMS type + 250,000 ft³ hold requirement)
    ✓ "Steel scrap (loose bulk), vessel ~250,000 ft³ hold capacity required"
```

**Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

**Step 3: Commit**

```bash
git add lib/prompts/parse-cargo.ts
git commit -m "fix(parse-cargo prompt): RULE 11 — concise ≠ lossy, keep material cargo facts"
```

---

## Task 8: R20b run on VPS + regression check

**Files:** none (operational)

**Context:** Measure the prompt's net effect over the honest R20a baseline. Run on the Checkpoint-1 winner model (from Task 4 Step 5).

**Step 1: Push and pull on VPS**

```bash
git push
ssh outreach-vps "cd /root/quantika-demo && git pull"
```

**Step 2: Run R20b**

Use the winning model from Task 4. If Pro won (default `.env.local`):

```bash
ssh outreach-vps "cd /root/quantika-demo && tmux new-session -d -s r20b 'npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R20b > /tmp/r20b.log 2>&1; npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --round R20b >> /tmp/r20b.log 2>&1'"
```

If Flash won, prefix the run command with `PARSE_CARGO_GEMINI_MODEL=gemini-2.5-flash` (as in Task 4 Step 4).

**Step 3: Regression check**

Compare R20b against R20a (same model) per-scenario. Any scenario that was a `route_match` in R20a and is NOT in R20b is a regression.

- Zero regressions → proceed.
- Any regression → identify which of the three prompt edits caused it (the commits are separable — revert the culprit), re-run.

GATE: `R20b string > R20a string` AND zero regressions on previously-green scenarios.

**Step 4: Commit results**

```bash
scp outreach-vps:/root/quantika-demo/.progonq/results/etms-parse-cargo-R20b.json .progonq/results/
git add .progonq/results/etms-parse-cargo-R20b.json
git commit -m "test(progonq): R20b results — prompt improvement over honest baseline"
```

---

## Task 9: Merge, deploy, update memory

**Files:**

- Modify: `/Users/jarvis/.claude/projects/-Users-jarvis-claude/memory/project_parse_cargo_phase1_5.md`
- Modify: `/Users/jarvis/.claude/projects/-Users-jarvis-claude/memory/MEMORY.md` (index line)

**Context:** Apply the design's decision tree (R20b string ≥ 93 → merge+deploy; 89-92 → merge+deploy, Phase 3 candidate; < 89 → do not merge, investigate).

**Step 1: Merge to main**

Only if R20b cleared the gate:

```bash
cd ~/work/quantika-demo
git checkout main && git pull origin main
git merge --no-ff feat/parse-cargo-phase1.6-honest-eval -m "feat(parse-cargo): Phase 1.6 — honest eval + prompt improvement"
git push origin main
```

**Step 2: Deploy to VPS**

```bash
ssh outreach-vps "cd /root/quantika-demo && git checkout main && git pull origin main && NODE_OPTIONS='--max-old-space-size=4096' npm run build && npx pm2 restart quantika-demo"
ssh outreach-vps "sleep 3 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000"
```

Expected: HTTP `200` or `307` (login redirect).

**Step 3: Update memory**

In `project_parse_cargo_phase1_5.md`, add a "## Phase 1.6 — COMPLETE" section: R20a (Pro / Flash) and R20b scores, the Flash-vs-Pro verdict, count of corpus annotations corrected, and the merge SHA. Update the `MEMORY.md` index line for parse-cargo accordingly.

**Step 4: Done**

Report final numbers to the user: R19 → R20a (honest baseline, same model) → R20b (after prompt), plus the Flash-vs-Pro finding.

---

## Notes for the executing engineer

- **DRY/YAGNI:** Tasks 5-7 are three _separate_ commits on purpose — if Task 8's regression check finds a culprit, you revert exactly one.
- **The gates are hard stops.** A failed gate means stop and investigate, not continue and hope.
- **Frozen environment:** never edit VPS `.env.local` for the Flash run — use an inline env-var override so the file stays the canonical Pro config.
- **Corpus edits are the riskiest part.** When in doubt during Task 3 reconciliation, leave the reference unchanged — a missed correction costs 1 eval point; a wrong "correction" corrupts the ground truth.
