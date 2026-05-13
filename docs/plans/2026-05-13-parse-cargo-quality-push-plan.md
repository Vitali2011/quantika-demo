# parse-cargo Quality Push — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Поднять parse-cargo eval semantic median с 81/95 до 91-95/95 устойчиво (variance ±1-2) через 4 фазированных PR.

**Architecture:** Phased approach с измеримыми гейтами после каждой фазы. Phase 1: sampling foundation (variance kill). Phase 2: model exploration (Gemini vs Sonnet 4.6 vs DeepThink). Phase 3: self-consistency voting (N=3 majority vote). Phase 4: data engineering (corpus audit + adversarial expansion + cron).

**Tech Stack:** Next.js 16 + TypeScript 5, Gemini 2.5 Pro (Vertex AI) parser, Sonnet 4.6 (Bedrock) judge, Jest tests, eval корпус `.progonq/corpus/etms-parse-cargo/` (95 scenarios), VPS `/root/qd-r17` для prod-isolated прогонов.

**Design doc:** [docs/plans/2026-05-13-parse-cargo-quality-push-design.md](2026-05-13-parse-cargo-quality-push-design.md)

**Working directory:** `~/work/quantika-demo` локально, `/root/qd-r17` на VPS для eval-прогонов.

**Critical rule:** между фазами — гейт по 3-run median. Если +<3 баллов → debug или skip, не наслаивать фазы вслепую.

---

# PHASE 1 — Sampling Foundation (цель median 84-86/95, variance ±2-3)

## Task 1.0: Branch setup

**Files:** —

**Step 1: Create feature branch**

```bash
cd ~/work/quantika-demo
git checkout main && git pull
git checkout -b feat/parse-cargo-phase1-sampling
```

Expected: branch created from latest main.

---

## Task 1.1: Audit current callAiText signature for sampling support

**Files:**

- Read: `lib/ai-provider.ts`

**Step 1: Inspect current options interface**

Run:

```bash
grep -n "interface.*Options\|maxTokens\|timeoutMs" lib/ai-provider.ts | head -20
```

Expected: see existing options shape (e.g. `{ maxTokens, timeoutMs }`).

**Step 2: Inspect Vertex AI Gemini call site**

```bash
grep -B2 -A20 "vertex.*generateContent\|generationConfig" lib/ai-provider.ts | head -40
```

Expected: see where `generationConfig` is built for Vertex AI calls. Note current temperature/topP/topK/seed values (likely missing).

**Step 3: Inspect Bedrock call site for parity**

```bash
grep -B2 -A20 "bedrock.*invokeModel\|inferenceConfig" lib/ai-provider.ts | head -40
```

Expected: see Bedrock inference config shape.

**Step 4: Document findings**

Create `.notes/phase1-ai-provider-audit.md` (gitignored notes):

```
- Options interface line: NN
- Vertex generationConfig line: NN — current params: [list]
- Bedrock inferenceConfig line: NN — current params: [list]
```

No commit (notes-only).

---

## Task 1.2: Add temperature + seed to callAiText options

**Files:**

- Modify: `lib/ai-provider.ts`
- Test: `__tests__/lib/ai-provider-sampling.test.ts` (NEW)

**Step 1: Write failing test**

Create `__tests__/lib/ai-provider-sampling.test.ts`:

```typescript
import { describe, it, expect } from "@jest/globals";
import type { CallAiTextOptions } from "@/lib/ai-provider";

describe("CallAiTextOptions sampling", () => {
  it("accepts temperature option", () => {
    const opts: CallAiTextOptions = { temperature: 0 };
    expect(opts.temperature).toBe(0);
  });

  it("accepts seed option", () => {
    const opts: CallAiTextOptions = { seed: 42 };
    expect(opts.seed).toBe(42);
  });

  it("allows topP and topK options", () => {
    const opts: CallAiTextOptions = { topP: 0.95, topK: 40 };
    expect(opts.topP).toBe(0.95);
    expect(opts.topK).toBe(40);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/ai-provider-sampling.test.ts`

Expected: TypeScript compile error "Type does not have property 'temperature'".

**Step 3: Extend CallAiTextOptions interface**

In `lib/ai-provider.ts` find `export interface CallAiTextOptions` (or whatever the options type is named) and add:

```typescript
export interface CallAiTextOptions {
  // existing fields...
  /** Sampling temperature 0..1. 0 = greedy. Default: provider default. */
  temperature?: number;
  /** Top-p nucleus sampling. Default: provider default. */
  topP?: number;
  /** Top-k sampling. Default: provider default. */
  topK?: number;
  /** Random seed for reproducibility. Vertex AI Gemini supports. */
  seed?: number;
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/ai-provider-sampling.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/ai-provider.ts __tests__/lib/ai-provider-sampling.test.ts
git commit -m "feat(ai-provider): add temperature/topP/topK/seed sampling options to CallAiTextOptions"
```

---

## Task 1.3: Wire sampling options into Vertex AI Gemini call

**Files:**

- Modify: `lib/ai-provider.ts` (Vertex AI branch)
- Test: extend `__tests__/lib/ai-provider-sampling.test.ts`

**Step 1: Write failing test**

Add to `__tests__/lib/ai-provider-sampling.test.ts`:

```typescript
import { buildGeminiGenerationConfig } from "@/lib/ai-provider";

describe("buildGeminiGenerationConfig", () => {
  it("passes temperature into generationConfig", () => {
    const cfg = buildGeminiGenerationConfig({ temperature: 0, maxTokens: 4096 });
    expect(cfg.temperature).toBe(0);
    expect(cfg.maxOutputTokens).toBe(4096);
  });

  it("passes seed into generationConfig", () => {
    const cfg = buildGeminiGenerationConfig({ seed: 42, maxTokens: 4096 });
    expect(cfg.seed).toBe(42);
  });

  it("omits undefined sampling options", () => {
    const cfg = buildGeminiGenerationConfig({ maxTokens: 4096 });
    expect(cfg.temperature).toBeUndefined();
    expect(cfg.seed).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/ai-provider-sampling.test.ts -t buildGeminiGenerationConfig`

Expected: FAIL with "buildGeminiGenerationConfig is not exported".

**Step 3: Extract + export helper, wire options**

In `lib/ai-provider.ts`, refactor inline `generationConfig` build into:

```typescript
export function buildGeminiGenerationConfig(opts: CallAiTextOptions): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens ?? 4096,
  };
  if (opts.temperature !== undefined) cfg.temperature = opts.temperature;
  if (opts.topP !== undefined) cfg.topP = opts.topP;
  if (opts.topK !== undefined) cfg.topK = opts.topK;
  if (opts.seed !== undefined) cfg.seed = opts.seed;
  return cfg;
}
```

Then in the Vertex AI call branch replace inline `generationConfig: { maxOutputTokens: ... }` with `generationConfig: buildGeminiGenerationConfig(opts)`.

**Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/ai-provider-sampling.test.ts`

Expected: PASS (all tests).

**Step 5: Smoke test the wiring with a real call**

Run a dry-run script (no commit):

```bash
cat > /tmp/smoke-temp.ts << 'EOF'
import { callAiText } from './lib/ai-provider';
(async () => {
  const r = await callAiText(
    'TEST_SAMPLING',
    'Reply with exactly the word: hello',
    'go',
    { temperature: 0, seed: 42, maxTokens: 16 }
  );
  console.log('result:', r);
})();
EOF
npx tsx --env-file=.env.local /tmp/smoke-temp.ts
```

Expected: prints something containing "hello" without exception (validates that Vertex AI accepts seed parameter).

If Vertex AI rejects seed parameter — drop seed from `buildGeminiGenerationConfig`, document in commit message. Continue without seed (temperature=0 alone is the bigger win).

**Step 6: Commit**

```bash
git add lib/ai-provider.ts __tests__/lib/ai-provider-sampling.test.ts
git commit -m "feat(ai-provider): wire sampling options into Vertex AI generationConfig"
```

---

## Task 1.4: Wire sampling options into Bedrock call (parity)

**Files:**

- Modify: `lib/ai-provider.ts` (Bedrock branch)
- Test: extend `__tests__/lib/ai-provider-sampling.test.ts`

**Step 1: Write failing test**

Add:

```typescript
import { buildBedrockInferenceConfig } from "@/lib/ai-provider";

describe("buildBedrockInferenceConfig", () => {
  it("passes temperature into inferenceConfig", () => {
    const cfg = buildBedrockInferenceConfig({ temperature: 0, maxTokens: 4096 });
    expect(cfg.temperature).toBe(0);
    expect(cfg.maxTokens).toBe(4096);
  });

  it("passes topP into inferenceConfig", () => {
    const cfg = buildBedrockInferenceConfig({ topP: 0.95, maxTokens: 4096 });
    expect(cfg.topP).toBe(0.95);
  });
});
```

**Step 2: Run test, expect FAIL**

Run: `npx jest __tests__/lib/ai-provider-sampling.test.ts -t buildBedrockInferenceConfig`

Expected: FAIL "not exported".

**Step 3: Add Bedrock helper**

In `lib/ai-provider.ts`:

```typescript
export function buildBedrockInferenceConfig(opts: CallAiTextOptions): Record<string, unknown> {
  const cfg: Record<string, unknown> = {
    maxTokens: opts.maxTokens ?? 4096,
  };
  if (opts.temperature !== undefined) cfg.temperature = opts.temperature;
  if (opts.topP !== undefined) cfg.topP = opts.topP;
  // Bedrock Anthropic не имеет seed; topK через body.top_k для Anthropic format
  return cfg;
}
```

Wire into Bedrock invoke call branch (replace inline inferenceConfig).

**Step 4: Run test**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/ai-provider.ts __tests__/lib/ai-provider-sampling.test.ts
git commit -m "feat(ai-provider): wire sampling options into Bedrock inferenceConfig"
```

---

## Task 1.5: Set temperature=0 + seed=42 for PARSE_CARGO scope

**Files:**

- Modify: `scripts/progonq/run-parse-cargo.ts:320`
- Modify: `app/api/ai/parse-cargo/route.ts` (production callsite)

**Step 1: Locate parse-cargo callAiText invocations**

```bash
grep -rn "callAiText.*PARSE_CARGO\|callAiText.*parse_cargo\|callAiText.*parseCargo" --include="*.ts" --include="*.tsx"
```

Expected: 2 callsites — `scripts/progonq/run-parse-cargo.ts` (eval) и `app/api/ai/parse-cargo/route.ts` (prod).

**Step 2: Modify eval script**

In `scripts/progonq/run-parse-cargo.ts` change:

```typescript
const text = await callAiText(SCOPE, CARGO_INQUIRY_PARSER_PROMPT, userPrompt, {
  maxTokens: 4096,
  timeoutMs: 180_000,
  temperature: 0,
  seed: 42,
});
```

**Step 3: Modify production route**

In `app/api/ai/parse-cargo/route.ts` find the `callAiText` call and add same options. Use same temperature/seed for prod-eval parity.

**Step 4: Commit**

```bash
git add scripts/progonq/run-parse-cargo.ts app/api/ai/parse-cargo/route.ts
git commit -m "feat(parse-cargo): set temperature=0 + seed=42 for deterministic extraction"
```

---

## Task 1.6: Pin Gemini version via env var

**Files:**

- Modify: `.env.example`
- Modify: `lib/ai-provider.ts` (where model name is resolved)
- VPS: `outreach-vps:/root/qd-r17/.env.local`

**Step 1: Find model resolution**

```bash
grep -n "AI_MODEL_GEMINI\|gemini-2.5-pro" lib/ai-provider.ts | head -10
```

Expected: see env var lookup like `process.env.AI_MODEL_GEMINI_PARSE_CARGO ?? 'gemini-2.5-pro'`.

**Step 2: Verify available pinned versions**

Check Vertex AI documentation or run a query — typical pinned versions: `gemini-2.5-pro-002`, `gemini-2.5-pro-preview-MMDD`. Pick latest GA pinned version (NOT preview, NOT experimental).

Run:

```bash
gcloud ai models list --region=europe-west1 --filter="displayName:gemini-2.5-pro" 2>&1 | head -20
```

OR fall back to `gemini-2.5-pro-002` (commonly available).

**Step 3: Add to .env.example**

```env
# Gemini pinned version for parse-cargo (deterministic eval)
AI_MODEL_GEMINI_PARSE_CARGO=gemini-2.5-pro-002
```

**Step 4: Set on VPS**

```bash
ssh outreach-vps "grep -q AI_MODEL_GEMINI_PARSE_CARGO /root/qd-r17/.env.local || echo 'AI_MODEL_GEMINI_PARSE_CARGO=gemini-2.5-pro-002' >> /root/qd-r17/.env.local"
```

**Step 5: Smoke test with pinned version**

```bash
ssh outreach-vps "cd /root/qd-r17 && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R18-pin-test --limit 3 2>&1 | tail -10"
```

Expected: 3 scenarios processed without "model not found" errors.

**Step 6: Commit**

```bash
git add .env.example
git commit -m "feat(parse-cargo): pin Gemini version via AI_MODEL_GEMINI_PARSE_CARGO env"
```

---

## Task 1.7: Add 3-5 few-shot examples to prompt

**Files:**

- Modify: `lib/prompts/parse-cargo.ts`
- Reference: `.progonq/corpus/raw/` (real broker emails, NOT corpus scenarios)

**Step 1: Identify insertion point in prompt**

```bash
grep -n "^=== \|^EXAMPLE\|^Examples:" lib/prompts/parse-cargo.ts | head -10
```

Expected: see existing structural sections in prompt. Pick insertion point AFTER schema definition, BEFORE final "Return JSON" instruction.

**Step 2: Select 4 representative external examples**

Use real (anonymized if needed) email patterns that DON'T duplicate corpus scenarios. Categories:

1. **Vessel position circular** (similar pattern to 049, 058, but different ports/dates).
2. **Multi-port alternatives** ("X or Y chopt").
3. **Multi-port rotation** ("X + Y" with weight breakdown).
4. **POC / TBS unspecified** (POC or TBN).

Source: forwarded broker emails from `.progonq/corpus/raw/` mailbox files OR reformulated patterns. Make sure subject/body/sender/dates are different from `.progonq/corpus/etms-parse-cargo/scenario-*.json`.

**Step 3: Add examples to prompt**

Insert new section after multi-port instructions:

```typescript
const FEW_SHOT_EXAMPLES = `
=== EXAMPLES ===

Example 1 — Vessel position circular (return empty items):

Email: "OPEN VESSEL 8500 DWCC SID GLESS open ALEXANDRIA 12-15 May/onw => MED EUROPE. Rgds, owner@xyz.com"

Output: {"items": [], "missing_info": ["Vessel availability circular, not a cargo inquiry"]}

---

Example 2 — Alternatives (vessel chooses one):

Email: "PLS PROPOSE FOR: 25000 mt clinker in bulk, El Arish OR El Dekheila / POC, 7-15/Jun, 12000x/8000x, 2.5 pct ttl"

Output:
{
  "items": [{
    "origin_port": { "value": "El Arish", "confidence": "confirmed", "source_text": "El Arish OR El Dekheila" },
    "origin_port_alternatives": ["El Dekheila"],
    "destination_port": { "value": "Port of Call", "confidence": "interpreted", "source_text": "POC" },
    "weight_mt": { "value": 25000, "confidence": "confirmed", "source_text": "25000 mt clinker" },
    "cargo_type": { "value": "BULK", "confidence": "confirmed", "source_text": "clinker in bulk" }
  }]
}

---

Example 3 — Rotation (vessel calls both):

Email: "40000 mt rice in bb, Kandla → Banjul 10000 + Dakar 30000, laycan 5-12 Jul"

Output:
{
  "items": [{
    "origin_port": { "value": "Kandla", "confidence": "confirmed", "source_text": "Kandla" },
    "destination_port": { "value": "Banjul", "confidence": "confirmed", "source_text": "Banjul 10000" },
    "destination_port_rotation": ["Banjul", "Dakar"],
    "weight_per_port": [10000, 30000],
    "weight_mt": { "value": 40000, "confidence": "confirmed", "source_text": "40000 mt rice" }
  }]
}

---

Example 4 — Port unspecified (POC / TBN):

Email: "6000mt urea in big-bags, Alexandria → POC, mid Jul, 3000/3000 shinc"

Output:
{
  "items": [{
    "origin_port": { "value": "Alexandria", "confidence": "confirmed", "source_text": "Alexandria" },
    "destination_port": { "value": "Port of Call (unspecified)", "confidence": "interpreted", "source_text": "POC" },
    "weight_mt": { "value": 6000, "confidence": "confirmed", "source_text": "6000mt urea" }
  }]
}
`;
```

Insert the const, then concatenate into main prompt at the chosen insertion point.

**Step 4: Verify prompt assembles correctly**

Run a tiny smoke test:

```bash
npx tsx -e "import { CARGO_INQUIRY_PARSER_PROMPT } from './lib/prompts/parse-cargo'; console.log(CARGO_INQUIRY_PARSER_PROMPT.length); console.log(CARGO_INQUIRY_PARSER_PROMPT.slice(-500))"
```

Expected: prompt length grew by ~1.5k chars, last 500 chars contain Example 4.

**Step 5: Smoke test on a single corpus scenario**

```bash
ssh outreach-vps "cd /root/qd-r17 && git pull && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R18-fewshot-smoke --scenario etms-parse-cargo-001 2>&1 | tail -10"
```

Expected: scenario completes without error.

**Step 6: Commit**

```bash
git add lib/prompts/parse-cargo.ts
git commit -m "feat(parse-cargo prompt): add 4 few-shot examples (vessel guard, alts, rotation, POC)"
```

---

## Task 1.8: Run 3-run Phase 1 verification

**Files:** none (eval execution)

**Step 1: Push branch to remote**

```bash
git push -u origin feat/parse-cargo-phase1-sampling
```

**Step 2: Update VPS worktree**

```bash
ssh outreach-vps "cd /root/qd-r17 && git fetch && git checkout feat/parse-cargo-phase1-sampling && git pull"
```

**Step 3: Run R18a/b/c sequentially**

```bash
for r in R18a R18b R18c; do
  ssh outreach-vps "cd /root/qd-r17 && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round $r 2>&1 | tail -3"
done
```

Expected: each round produces a results file in `.progonq/results/etms-parse-cargo-R18[abc].json`.

**Step 4: Judge all three rounds**

```bash
for r in R18a R18b R18c; do
  ssh outreach-vps "cd /root/qd-r17 && npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-$r.json 2>&1 | grep -E 'string_full|semantic_full'"
done
```

Expected: 3 sets of string + semantic scores.

**Step 5: Compute median + variance**

```bash
ssh outreach-vps "python3 -c \"
import json
rounds = ['R18a','R18b','R18c']
results = {}
for r in rounds:
    d = json.load(open(f'/root/qd-r17/.progonq/results/etms-parse-cargo-{r}.json'))
    string_full = sum(1 for x in d if x.get('route_match_rate',0)==1)
    results[r] = string_full
print('String scores:', results)
import statistics
print('Median:', statistics.median(results.values()))
print('Range:', max(results.values()) - min(results.values()))
\""
```

Expected: median ≥84, range ≤4. If range >6 → variance fix didn't work.

**Step 6: Document results in retro**

Create `docs/plans/2026-05-13-parse-cargo-phase1-retro.md`:

```markdown
# Phase 1 — Sampling Foundation Retro

| Round  | String | Semantic |
| ------ | ------ | -------- |
| R18a   | X/95   | Y/95     |
| R18b   | X/95   | Y/95     |
| R18c   | X/95   | Y/95     |
| Median | M      | M        |

Delta vs R17 baseline (string 74, semantic 81):

- String: +N
- Semantic: +N
- Variance: ±N (was ±8)

Verdict: [PASS if median ≥84 AND variance ≤4; FAIL otherwise]
```

**Step 7: Commit retro**

```bash
git add docs/plans/2026-05-13-parse-cargo-phase1-retro.md
git commit -m "docs(parse-cargo): Phase 1 retro with R18a/b/c verification numbers"
git push
```

---

## Task 1.9: Open Phase 1 PR

**Step 1: Create PR**

```bash
gh pr create --title "feat(parse-cargo): Phase 1 — sampling foundation (temperature=0, seed, version pin, few-shot)" --body "$(cat <<'EOF'
## Summary

Phase 1 of parse-cargo quality push. Goal: убить drift между прогонами через детерминированный sampling.

## Changes

- `lib/ai-provider.ts`: temperature/topP/topK/seed options
- `scripts/progonq/run-parse-cargo.ts` + `app/api/ai/parse-cargo/route.ts`: set temperature=0 + seed=42
- `lib/prompts/parse-cargo.ts`: 4 few-shot examples (vessel guard, alts, rotation, POC)
- `.env.example`: pinned Gemini version

## R18 verification (vs R17 baseline)

| Metric | R17 median | R18 median | Delta |
|--------|------------|------------|-------|
| String | 74/95 | X/95 | +N |
| Semantic | 81/95 | Y/95 | +N |
| Variance | ±8 | ±N | ↓ |

[Detailed numbers in docs/plans/2026-05-13-parse-cargo-phase1-retro.md]

## Test plan

- [x] R18a/b/c прогнаны на VPS /root/qd-r17
- [x] Judge для всех трёх раундов
- [x] Median + variance вычислены
- [x] Phase 1 gate: median ≥84 AND variance ≤4 → PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 2: Wait for CI + admin-merge if green**

```bash
gh pr checks --watch
gh pr merge --admin --merge
```

---

# PHASE 2 — Model Exploration (3 модели на R17 corpus)

## Task 2.0: Branch setup

**Step 1: Branch off updated main**

```bash
git checkout main && git pull
git checkout -b feat/parse-cargo-phase2-models
```

---

## Task 2.1: Add Bedrock Sonnet 4.6 model option for PARSE_CARGO

**Files:**

- Modify: `.env.example`
- Modify: `lib/ai-provider.ts` (where bedrock model name resolves)

**Step 1: Find Bedrock model resolution**

```bash
grep -n "AI_MODEL_BEDROCK\|claude-sonnet" lib/ai-provider.ts | head -10
```

**Step 2: Add scope-specific resolver if not present**

In `lib/ai-provider.ts`, where model name resolves by scope+provider:

```typescript
if (provider === "bedrock" && scope === "PARSE_CARGO") {
  return process.env.AI_MODEL_BEDROCK_PARSE_CARGO ?? "anthropic.claude-sonnet-4-6-20260101-v1:0";
}
```

(use whatever current Sonnet 4.6 model ID format your bedrock client expects — check existing judge model ID for format)

**Step 3: Add env var to example**

In `.env.example`:

```env
AI_MODEL_BEDROCK_PARSE_CARGO=anthropic.claude-sonnet-4-6-20260101-v1:0
```

**Step 4: Smoke test Bedrock parser path**

```bash
ssh outreach-vps "grep -q AI_MODEL_BEDROCK_PARSE_CARGO /root/qd-r17/.env.local || echo 'AI_MODEL_BEDROCK_PARSE_CARGO=anthropic.claude-sonnet-4-6-20260101-v1:0' >> /root/qd-r17/.env.local"
ssh outreach-vps "cd /root/qd-r17 && git fetch && git checkout feat/parse-cargo-phase2-models && git pull && PARSE_CARGO_PROVIDER=bedrock npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R19-bedrock-smoke --limit 3 2>&1 | tail -10"
```

Expected: 3 scenarios processed via Bedrock without errors.

**Step 5: Commit**

```bash
git add .env.example lib/ai-provider.ts
git commit -m "feat(ai-provider): add PARSE_CARGO Bedrock Sonnet 4.6 resolver"
```

---

## Task 2.2: Check Gemini DeepThink availability

**Files:** none (research)

**Step 1: Query Vertex AI for DeepThink**

```bash
gcloud ai models list --region=europe-west1 --filter="displayName:gemini-2.5-pro-deepthink" 2>&1 | head -5
```

OR check Vertex AI docs page for current naming.

**Step 2: If available, add scope resolver**

If model exists (e.g. `gemini-2.5-pro-deepthink-001`), add to `lib/ai-provider.ts`:

```typescript
// Allow override via AI_MODEL_GEMINI_PARSE_CARGO_DEEPTHINK
```

And `.env.example`:

```env
AI_MODEL_GEMINI_PARSE_CARGO_DEEPTHINK=gemini-2.5-pro-deepthink-001
```

If NOT available → skip Task 2.5, document in Phase 2 retro that DeepThink не публично доступен.

**Step 3: Commit (only if model added)**

```bash
git add .env.example lib/ai-provider.ts
git commit -m "feat(ai-provider): add Gemini DeepThink option for PARSE_CARGO"
```

---

## Task 2.3: Run R19 baseline на Gemini 2.5 Pro (post-Phase 1)

**Files:** none

**Step 1: 3 rounds на Gemini Pro (с Phase 1 фиксами)**

```bash
ssh outreach-vps "cd /root/qd-r17 && git checkout feat/parse-cargo-phase2-models && git pull"
for r in R19a-gemini R19b-gemini R19c-gemini; do
  ssh outreach-vps "cd /root/qd-r17 && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round $r 2>&1 | tail -3"
done
```

**Step 2: Judge all three**

```bash
for r in R19a-gemini R19b-gemini R19c-gemini; do
  ssh outreach-vps "cd /root/qd-r17 && npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-$r.json 2>&1 | grep -E 'string_full|semantic_full'"
done
```

Record median + variance in retro doc (created in Task 2.6).

---

## Task 2.4: Run R19 на Bedrock Sonnet 4.6

**Step 1: 3 rounds via Bedrock**

```bash
for r in R19a-bedrock R19b-bedrock R19c-bedrock; do
  ssh outreach-vps "cd /root/qd-r17 && PARSE_CARGO_PROVIDER=bedrock npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round $r 2>&1 | tail -3"
done
```

**Step 2: Judge all three**

```bash
for r in R19a-bedrock R19b-bedrock R19c-bedrock; do
  ssh outreach-vps "cd /root/qd-r17 && npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-$r.json 2>&1 | grep -E 'string_full|semantic_full'"
done
```

Record numbers.

---

## Task 2.5: Run R19 на Gemini DeepThink (if available)

**Step 1: 3 rounds**

If DeepThink available, run analog to Task 2.4 but with PARSE_CARGO_PROVIDER=gemini + AI_MODEL_GEMINI_PARSE_CARGO=$DEEPTHINK_MODEL.

If NOT available → skip.

---

## Task 2.6: Compute decision matrix + write retro

**Files:**

- Create: `docs/plans/2026-05-13-parse-cargo-phase2-retro.md`

**Step 1: Build comparison table**

```bash
ssh outreach-vps "python3 << 'PY' | tee /tmp/phase2-summary.txt
import json, statistics
groups = {
    'gemini': ['R19a-gemini','R19b-gemini','R19c-gemini'],
    'bedrock': ['R19a-bedrock','R19b-bedrock','R19c-bedrock'],
}
for grp, rounds in groups.items():
    scores = []
    for r in rounds:
        try:
            d = json.load(open(f'/root/qd-r17/.progonq/results/etms-parse-cargo-{r}.json'))
            scores.append(sum(1 for x in d if x.get('route_match_rate',0)==1))
        except FileNotFoundError:
            scores.append(None)
    print(f'{grp}: scores={scores} median={statistics.median([s for s in scores if s is not None])}')
PY"
```

**Step 2: Write retro doc**

`docs/plans/2026-05-13-parse-cargo-phase2-retro.md`:

```markdown
# Phase 2 — Model Exploration Retro

## R19 string comparison

| Model              | R19a | R19b | R19c | Median | Variance |
| ------------------ | ---- | ---- | ---- | ------ | -------- |
| Gemini 2.5 Pro     | X    | X    | X    | M      | ±N       |
| Bedrock Sonnet 4.6 | X    | X    | X    | M      | ±N       |
| Gemini DeepThink   | X    | X    | X    | M      | ±N       |

## Semantic (judged)

[Same table for semantic_full]

## Per-class breakdown

[Per category — vessel_position, multi_offer, hedged_language, etc.]

## Cost per parse

| Model | Avg tokens in | Avg tokens out | Cost |
| ----- | ------------- | -------------- | ---- |

## Decision

Winner: [model]
Delta vs Phase 1 baseline: +N
Switch criterion (≥3 баллов): [met/not met]
```

**Step 3: Commit retro**

```bash
git add docs/plans/2026-05-13-parse-cargo-phase2-retro.md
git commit -m "docs(parse-cargo): Phase 2 retro with model comparison"
```

---

## Task 2.7: Apply winner config (or skip if no switch)

**Files:**

- Modify: `.env.example` (recommended default)

**Decision branch:**

**If Bedrock Sonnet 4.6 wins:**

```env
# In .env.example
PARSE_CARGO_PROVIDER=bedrock
```

**If DeepThink wins:**

```env
PARSE_CARGO_PROVIDER=gemini
AI_MODEL_GEMINI_PARSE_CARGO=gemini-2.5-pro-deepthink-001
```

**If Gemini Pro stays:**
No env change. Document in retro: "Explored, no switch."

**Step 1: Update .env.example + commit**

```bash
# only if switch
git add .env.example
git commit -m "feat(parse-cargo): switch default provider to [winner] (Phase 2 result)"
```

**Step 2: Push + PR**

```bash
git push -u origin feat/parse-cargo-phase2-models
gh pr create --title "feat(parse-cargo): Phase 2 — model exploration + switch to [winner]" --body "..."
gh pr checks --watch
gh pr merge --admin --merge
```

---

# PHASE 3 — Self-Consistency Voting

## Task 3.0: Branch setup

```bash
git checkout main && git pull
git checkout -b feat/parse-cargo-phase3-consistency
```

---

## Task 3.1: Write tests for vote module

**Files:**

- Create: `__tests__/lib/extractors/consistency-vote.test.ts`

**Step 1: Write comprehensive failing tests**

```typescript
import { describe, it, expect } from "@jest/globals";
import { majorityVote, type ParsedCargoOutput } from "@/lib/extractors/consistency-vote";

const makeOutput = (origin: string, dest: string, weight: number): ParsedCargoOutput => ({
  items: [
    {
      origin_port: { value: origin, confidence: "confirmed", source_text: origin },
      destination_port: { value: dest, confidence: "confirmed", source_text: dest },
      weight_mt: { value: weight, confidence: "confirmed", source_text: `${weight}mt` },
    },
  ],
});

describe("majorityVote", () => {
  it('returns 3/3 unanimous result with "confirmed" confidence', () => {
    const a = makeOutput("Odesa", "Mersin", 5000);
    const b = makeOutput("Odesa", "Mersin", 5000);
    const c = makeOutput("Odesa", "Mersin", 5000);
    const result = majorityVote([a, b, c]);
    expect(result.items[0].origin_port.value).toBe("Odesa");
    expect(result.items[0].origin_port.confidence).toBe("confirmed");
  });

  it('returns 2/3 result with "interpreted" confidence', () => {
    const a = makeOutput("Odesa", "Mersin", 5000);
    const b = makeOutput("Odesa", "Mersin", 5000);
    const c = makeOutput("Odesa", "Izmir", 5000);
    const result = majorityVote([a, b, c]);
    expect(result.items[0].destination_port.value).toBe("Mersin");
    expect(result.items[0].destination_port.confidence).toBe("interpreted");
  });

  it('returns 1/1/1 split with "uncertain" + first prevails', () => {
    const a = makeOutput("Odesa", "Mersin", 5000);
    const b = makeOutput("Odesa", "Izmir", 5000);
    const c = makeOutput("Odesa", "Alexandria", 5000);
    const result = majorityVote([a, b, c]);
    expect(result.items[0].destination_port.value).toBe("Mersin");
    expect(result.items[0].destination_port.confidence).toBe("uncertain");
  });

  it("items-count voting: 2/3 say 1 item, 1/3 says 2 → returns 1", () => {
    const one: ParsedCargoOutput = { items: [makeOutput("A", "B", 1).items[0]] };
    const two: ParsedCargoOutput = {
      items: [makeOutput("A", "B", 1).items[0], makeOutput("X", "Y", 2).items[0]],
    };
    const result = majorityVote([one, one, two]);
    expect(result.items.length).toBe(1);
  });

  it("items-count voting: all 3 return empty → returns empty", () => {
    const empty: ParsedCargoOutput = { items: [] };
    const result = majorityVote([empty, empty, empty]);
    expect(result.items.length).toBe(0);
  });

  it("handles null fields gracefully", () => {
    const withNull = makeOutput("Odesa", "Mersin", 5000);
    withNull.items[0].weight_mt = null;
    const result = majorityVote([withNull, withNull, withNull]);
    expect(result.items[0].weight_mt).toBeNull();
  });
});
```

**Step 2: Run, expect FAIL**

Run: `npx jest __tests__/lib/extractors/consistency-vote.test.ts`

Expected: FAIL "module not found".

---

## Task 3.2: Implement vote module

**Files:**

- Create: `lib/extractors/consistency-vote.ts`

**Step 1: Implement minimal version to pass tests**

```typescript
export interface ConfidenceField<T> {
  value: T;
  confidence: "confirmed" | "interpreted" | "uncertain";
  source_text?: string;
}

export interface ParsedCargoItem {
  origin_port: ConfidenceField<string> | null;
  destination_port: ConfidenceField<string> | null;
  weight_mt: ConfidenceField<number> | null;
  // ... other fields (full schema)
}

export interface ParsedCargoOutput {
  items: ParsedCargoItem[];
  missing_info?: string[];
}

function voteItemCount(outputs: ParsedCargoOutput[]): number {
  const counts = outputs.map((o) => o.items.length);
  const freq = new Map<number, number>();
  for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
  let best = counts[0],
    bestFreq = 0;
  for (const [c, f] of freq) {
    if (f > bestFreq || (f === bestFreq && c < best)) {
      best = c;
      bestFreq = f;
    }
  }
  return best;
}

function voteField<T>(values: (ConfidenceField<T> | null)[]): ConfidenceField<T> | null {
  const nonNull = values.filter((v): v is ConfidenceField<T> => v !== null);
  if (nonNull.length === 0) return null;

  const freq = new Map<string, { count: number; first: ConfidenceField<T> }>();
  for (const v of nonNull) {
    const key = JSON.stringify(v.value);
    const entry = freq.get(key);
    if (entry) entry.count++;
    else freq.set(key, { count: 1, first: v });
  }

  let winner = nonNull[0];
  let winnerCount = 1;
  for (const [, entry] of freq) {
    if (entry.count > winnerCount) {
      winner = entry.first;
      winnerCount = entry.count;
    }
  }

  const total = nonNull.length;
  let confidence: "confirmed" | "interpreted" | "uncertain";
  if (winnerCount === total) confidence = "confirmed";
  else if (winnerCount >= Math.ceil(total / 2)) confidence = "interpreted";
  else confidence = "uncertain";

  return { ...winner, confidence };
}

export function majorityVote(outputs: ParsedCargoOutput[]): ParsedCargoOutput {
  if (outputs.length === 0) return { items: [] };
  const itemCount = voteItemCount(outputs);
  if (itemCount === 0) return { items: [] };

  const items: ParsedCargoItem[] = [];
  for (let i = 0; i < itemCount; i++) {
    const itemSlots = outputs.filter((o) => o.items.length > i).map((o) => o.items[i]);

    items.push({
      origin_port: voteField(itemSlots.map((it) => it.origin_port)),
      destination_port: voteField(itemSlots.map((it) => it.destination_port)),
      weight_mt: voteField(itemSlots.map((it) => it.weight_mt)),
      // ... other fields
    });
  }

  return { items };
}
```

**Step 2: Run tests, expect PASS**

Run: `npx jest __tests__/lib/extractors/consistency-vote.test.ts`

Expected: PASS (all 6 cases).

**Step 3: Commit**

```bash
git add lib/extractors/consistency-vote.ts __tests__/lib/extractors/consistency-vote.test.ts
git commit -m "feat(parse-cargo): add majorityVote module for self-consistency"
```

---

## Task 3.3: Extend vote module for all ParsedCargo fields

**Files:**

- Modify: `lib/extractors/consistency-vote.ts`
- Modify: `__tests__/lib/extractors/consistency-vote.test.ts`

**Step 1: Add tests for all schema fields**

Cover: origin_country, destination_country, cargo_description, weight_mt_min/max, volume_cbm, dimensions, cargo_type, container_type, quantity, incoterms, preferred_dates, laycan, loading_rate, loading_terms, discharge_rate, discharge_terms, commission_percent, commission_terms, special_requirements, stowage_factor, missing_info, cargo_origin_country, origin_port_alternatives, origin_port_rotation, destination_port_alternatives, destination_port_rotation, weight_per_port.

For text fields (special_requirements, missing_info[]): use longest-answer heuristic.

**Step 2: Implement full field coverage**

Update `majorityVote` to handle all fields including arrays + free-text.

**Step 3: Run tests, PASS**

**Step 4: Commit**

```bash
git commit -am "feat(parse-cargo vote): cover all ParsedCargo fields incl. arrays + free-text"
```

---

## Task 3.4: Add callAiTextConsistent wrapper

**Files:**

- Create: `lib/ai-provider-consistent.ts`
- Test: `__tests__/lib/ai-provider-consistent.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect, jest } from "@jest/globals";
import { callAiTextConsistent } from "@/lib/ai-provider-consistent";

jest.mock("@/lib/ai-provider", () => ({
  callAiText: jest.fn(),
}));

describe("callAiTextConsistent", () => {
  it("runs N parallel calls and votes", async () => {
    const { callAiText } = await import("@/lib/ai-provider");
    (callAiText as jest.Mock).mockImplementation(async () => '{"items":[]}');

    const result = await callAiTextConsistent("TEST", "sys", "user", { temperature: 0.3 }, 3);

    expect(callAiText).toHaveBeenCalledTimes(3);
    expect(JSON.parse(result).items).toEqual([]);
  });

  it("handles mixed outputs via vote", async () => {
    const { callAiText } = await import("@/lib/ai-provider");
    const responses = [
      '{"items":[{"origin_port":{"value":"Odesa","confidence":"confirmed"}}]}',
      '{"items":[{"origin_port":{"value":"Odesa","confidence":"confirmed"}}]}',
      '{"items":[{"origin_port":{"value":"Izmir","confidence":"confirmed"}}]}',
    ];
    let i = 0;
    (callAiText as jest.Mock).mockImplementation(async () => responses[i++]);

    const result = await callAiTextConsistent("TEST", "sys", "user", { temperature: 0.3 }, 3);
    const parsed = JSON.parse(result);
    expect(parsed.items[0].origin_port.value).toBe("Odesa");
    expect(parsed.items[0].origin_port.confidence).toBe("interpreted");
  });
});
```

**Step 2: Run, expect FAIL**

**Step 3: Implement wrapper**

````typescript
import { callAiText, type CallAiTextOptions } from "./ai-provider";
import { majorityVote, type ParsedCargoOutput } from "./extractors/consistency-vote";

export async function callAiTextConsistent(
  scope: string,
  systemPrompt: string,
  userPrompt: string,
  opts: CallAiTextOptions,
  N: number = 3
): Promise<string> {
  // Force temperature ~0.3 for diversity in voting
  const voteOpts = { ...opts, temperature: opts.temperature ?? 0.3 };
  const calls = Array.from({ length: N }, () =>
    callAiText(scope, systemPrompt, userPrompt, voteOpts)
  );
  const responses = await Promise.all(calls);
  const parsed: ParsedCargoOutput[] = responses.map((r) => {
    const cleaned = r
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "");
    return JSON.parse(cleaned);
  });
  const voted = majorityVote(parsed);
  return JSON.stringify(voted);
}
````

**Step 4: Run tests, PASS**

**Step 5: Commit**

```bash
git add lib/ai-provider-consistent.ts __tests__/lib/ai-provider-consistent.test.ts
git commit -m "feat(parse-cargo): add callAiTextConsistent wrapper with N=3 majority vote"
```

---

## Task 3.5: Wire consistent call into eval script

**Files:**

- Modify: `scripts/progonq/run-parse-cargo.ts`

**Step 1: Add CLI flag --consistent N**

In `run-parse-cargo.ts`:

```typescript
const consistentArg = process.argv.indexOf("--consistent");
const consistentN = consistentArg >= 0 ? parseInt(process.argv[consistentArg + 1], 10) : 0;
```

**Step 2: Switch invocation conditionally**

```typescript
const callFn =
  consistentN > 0 ? (s, sys, u, o) => callAiTextConsistent(s, sys, u, o, consistentN) : callAiText;
const text = await callFn(SCOPE, CARGO_INQUIRY_PARSER_PROMPT, userPrompt, {
  maxTokens: 4096,
  timeoutMs: 180_000,
  temperature: consistentN > 0 ? 0.3 : 0,
  seed: 42,
});
```

**Step 3: Smoke test with --consistent 3 --limit 3**

```bash
ssh outreach-vps "cd /root/qd-r17 && git fetch && git checkout feat/parse-cargo-phase3-consistency && git pull && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R20-consistent-smoke --consistent 3 --limit 3 2>&1 | tail -10"
```

Expected: 3 scenarios processed (each makes 3 LLM calls).

**Step 4: Commit**

```bash
git add scripts/progonq/run-parse-cargo.ts
git commit -m "feat(parse-cargo): add --consistent N flag to run-parse-cargo eval"
```

---

## Task 3.6: Run R20 consistency verification (3 rounds × N=3)

**Step 1: Run R20a/b/c with --consistent 3**

```bash
for r in R20a R20b R20c; do
  ssh outreach-vps "cd /root/qd-r17 && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round $r --consistent 3 2>&1 | tail -3"
done
```

**Step 2: Judge all three**

```bash
for r in R20a R20b R20c; do
  ssh outreach-vps "cd /root/qd-r17 && npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-$r.json 2>&1 | grep -E 'string_full|semantic_full'"
done
```

**Step 3: Write retro**

`docs/plans/2026-05-13-parse-cargo-phase3-retro.md` with median + variance + per-class.

**Step 4: Commit**

```bash
git add docs/plans/2026-05-13-parse-cargo-phase3-retro.md
git commit -m "docs(parse-cargo): Phase 3 retro — self-consistency results"
```

---

## Task 3.7: Wire consistent into production route (if Phase 3 gate passes)

**Files:**

- Modify: `app/api/ai/parse-cargo/route.ts`

**Step 1: Add env-driven toggle**

```typescript
const consistentN = parseInt(process.env.PARSE_CARGO_CONSISTENT_N ?? "0", 10);
const text =
  consistentN > 0
    ? await callAiTextConsistent(scope, CARGO_INQUIRY_PARSER_PROMPT, userPrompt, opts, consistentN)
    : await callAiText(scope, CARGO_INQUIRY_PARSER_PROMPT, userPrompt, opts);
```

**Step 2: Add to .env.example**

```env
# Self-consistency voting (N=3 for 3x cost / higher quality)
PARSE_CARGO_CONSISTENT_N=0
```

**Step 3: Commit**

```bash
git commit -am "feat(parse-cargo): add PARSE_CARGO_CONSISTENT_N production toggle (default off)"
```

---

## Task 3.8: PR

```bash
git push -u origin feat/parse-cargo-phase3-consistency
gh pr create --title "feat(parse-cargo): Phase 3 — self-consistency voting N=3" --body "..."
gh pr checks --watch
gh pr merge --admin --merge
```

---

# PHASE 4 — Data Engineering

## Task 4.0: Branch setup

```bash
git checkout main && git pull
git checkout -b feat/parse-cargo-phase4-data
```

---

## Task 4.1: Corpus audit script

**Files:**

- Create: `scripts/progonq/audit-corpus.ts`
- Create: `.progonq/audit/2026-05-corpus-audit.md`

**Step 1: Write audit script**

`scripts/progonq/audit-corpus.ts`:

- Reads all 95 scenarios
- For each: validates schema (required fields), flags annotator comments embedded in values, flags null vs interpretable cases
- Outputs markdown report

**Step 2: Run audit**

```bash
npx tsx --env-file=.env.local scripts/progonq/audit-corpus.ts > .progonq/audit/2026-05-corpus-audit.md
```

**Step 3: Manual review pass**

Engineer goes through audit report, marks each scenario as A/B/C/D/E/F class, decides re-annotation actions.

**Step 4: Apply re-annotations (separate commits per scenario for clean history)**

For each scenario that needs fix:

```bash
# edit .progonq/corpus/etms-parse-cargo/scenario-NNN.json
git add .progonq/corpus/etms-parse-cargo/scenario-NNN.json
git commit -m "fix(progonq corpus): re-annotate scenario-NNN — <reason>"
```

---

## Task 4.2: Adversarial corpus expansion (+50 scenarios)

**Files:**

- Create: `.progonq/corpus/etms-parse-cargo/scenario-{096..145}.json`
- Create: `.progonq/audit/adversarial-source-emails.md` (gitignored if contains PII)

**Step 1: Source 50 emails from Gmail чартеринг folder**

Use Gmail MCP (см. memory: vitali6825621@gmail.com и pmikanovich@gmail.com) to search emails:

- Query: `from:management@etm-services.net subject:FW after:2026-04-01`
- Query: `from:chartering label:freight`
- Extract message IDs, raw subject + body

Save raw emails to `.progonq/audit/adversarial-source-emails.md` (for audit trail, NOT committed if PII concerns).

**Step 2: Distribute across categories**

15 hedged language, 10 exotic abbrevs, 10 multi-offer, 10 vessel circulars, 5 edge cases. See design doc § 6.2 for full breakdown.

**Step 3: For each email, create scenario file**

Template:

```json
{
  "id": "etms-parse-cargo-NNN",
  "source_email_id": "<gmail-msg-id>",
  "category": "<category>",
  "input": { "subject": "...", "from": "...", "date": "...", "body": "..." },
  "reference_output": { "items": [...] }
}
```

**Annotation workflow:** first pass via Sonnet 4.6 (call parse-cargo prompt on it, take output as `reference_output`), then manual review для каждого спорного случая.

**Step 4: Commit in batches of 10**

```bash
git add .progonq/corpus/etms-parse-cargo/scenario-{096..105}.json
git commit -m "feat(progonq corpus): add 10 hedged-language scenarios (096-105)"
# repeat for each batch
```

**Step 5: Run baseline on extended corpus (145 scenarios now)**

```bash
ssh outreach-vps "cd /root/qd-r17 && git fetch && git checkout feat/parse-cargo-phase4-data && git pull && PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round R21-extended 2>&1 | tail -3"
ssh outreach-vps "cd /root/qd-r17 && npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results .progonq/results/etms-parse-cargo-R21-extended.json"
```

---

## Task 4.3: Per-class regression tests

**Files:**

- Create: `__tests__/parse-cargo/regression-by-class.test.ts`

**Step 1: Identify 5 anchor scenarios per class**

From R21 results identify scenarios consistently green for each of 6 classes (vessel_position, multi_offer, hedged_language, single_cargo, multi_port_alts, multi_port_rotation).

**Step 2: Write Jest tests that:**

- For each anchor scenario: load email body, call parse-cargo route (with mocked LLM that returns expected output stamped), assert items shape matches expected.

OR: Use snapshot of LLM output from a known-good run, mock callAiText to return it, validate that downstream `parseCargoAIResponse` correctly extracts. (This tests the parser logic, not the LLM.)

**Step 3: Run tests**

`npx jest __tests__/parse-cargo/regression-by-class.test.ts`

Expected: 30 tests pass (6 classes × 5 scenarios).

**Step 4: Commit**

```bash
git add __tests__/parse-cargo/regression-by-class.test.ts
git commit -m "test(parse-cargo): add 30 per-class regression tests (6 classes × 5 anchors)"
```

---

## Task 4.4: Weekly cron eval

**Files:**

- Create: `scripts/progonq/cron-weekly-eval.sh`
- Configure: cron on VPS

**Step 1: Write cron script**

`scripts/progonq/cron-weekly-eval.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /root/quantika-demo
git pull --rebase
ROUND="Rweekly-$(date +%Y%m%d)"
PARSE_CARGO_PROVIDER=gemini npx tsx --env-file=.env.local scripts/progonq/run-parse-cargo.ts --round "$ROUND"
npx tsx --env-file=.env.local scripts/progonq/judge-parse-cargo.ts --results ".progonq/results/etms-parse-cargo-$ROUND.json" > "/tmp/$ROUND-judge.log"
# Push results to git
git add ".progonq/results/etms-parse-cargo-$ROUND.json"
git commit -m "weekly eval: $ROUND" --allow-empty
# Telegram alert if median dropped
python3 scripts/progonq/check-regression.py "$ROUND" || curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id=$TELEGRAM_CHAT_ID -d text="parse-cargo regression in $ROUND"
```

**Step 2: Make executable + deploy to VPS**

```bash
chmod +x scripts/progonq/cron-weekly-eval.sh
ssh outreach-vps "mkdir -p /root/quantika-demo/scripts/progonq"
# (cron-weekly-eval.sh will be on VPS after next pull)
```

**Step 3: Install cron entry on VPS**

```bash
ssh outreach-vps "(crontab -l 2>/dev/null; echo '0 3 * * 1 cd /root/quantika-demo && bash scripts/progonq/cron-weekly-eval.sh >> /var/log/parse-cargo-cron.log 2>&1') | crontab -"
```

**Step 4: Test cron manually**

```bash
ssh outreach-vps "bash /root/quantika-demo/scripts/progonq/cron-weekly-eval.sh"
```

Expected: full round runs, results committed.

**Step 5: Commit**

```bash
git add scripts/progonq/cron-weekly-eval.sh
git commit -m "feat(parse-cargo): weekly cron eval on VPS with regression alerts"
```

---

## Task 4.5: PR for Phase 4

```bash
git push -u origin feat/parse-cargo-phase4-data
gh pr create --title "feat(parse-cargo): Phase 4 — corpus audit + 50 new scenarios + weekly cron"
gh pr checks --watch
gh pr merge --admin --merge
```

---

# Cross-cutting checkpoints

## Phase gate (после каждой фазы)

После закрытия Phase N PR:

1. Run 3-round verification (R18 / R19 / R20 / R21).
2. Compute median + variance.
3. Compare to Phase N-1 baseline.
4. Write retro doc.
5. **Decision:**
   - +<3 баллов → debug or skip фаза, не идём дальше
   - +≥3 баллов и variance не вырос → ✅ next phase
   - Variance вырос (>±2 от Phase 1 baseline) → 🚨 что-то регрессировало, debug

## Final retro (after Phase 4)

После всех 4 PR создать `docs/plans/2026-05-XX-parse-cargo-quality-push-final-retro.md`:

| Metric          | R17 | R18 (P1) | R19 (P2) | R20 (P3) | R21 (P4) |
| --------------- | --- | -------- | -------- | -------- | -------- |
| String median   | 74  | X        | X        | X        | X        |
| Semantic median | 81  | X        | X        | X        | X        |
| Variance        | ±8  | ±N       | ±N       | ±N       | ±N       |

Lessons learned, per-phase delta breakdown, recommendations для Phase 5 (two-stage pipeline if needed).

---

# Working environment notes

- **Locally:** `~/work/quantika-demo` — feature branches
- **VPS:** `/root/qd-r17` (isolated worktree, не трогает прод `/root/quantika-demo`)
- **Eval results:** `.progonq/results/etms-parse-cargo-R*.json` (на VPS, gitignored)
- **Judge cache:** `.progonq/judge-cache/` (на VPS, ускоряет повторные прогоны на тех же pairs)
- **Costs:** API spend tracking через VertexAI/Bedrock console (опционально dashboard)

---

# Out of scope (для следующих волн)

- Two-stage pipeline (classifier → extractor) — backup plan если P1-P4 не дотягивают до 91-95
- Multi-language support (текущий корпус English)
- OCR для PDF attachments
- Real-time eval в проде (вместо batch)
- Adversarial training data generation через GPT-5 / Opus (если manual annotation слишком медленный)
