# Group B — Cargo-Data Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cargo data the demo shows *true* — re-parse the demo cargoes through Claude (subscription, offline) so quantities/CBM/vessel-DWT requirements that ARE present are captured, wire Claude into the live provider chain as the canonical cargo parser, and make the remaining truly-absent data render honestly (no false `✅ OK`, no `null mt`, LOW-confidence flag) plus a soft vessel-DWT gate.

**Architecture:** Three layers, sequenced **parse-first**:
1. **Parse truth (do first).** Enrich `lib/prompts/parse-cargo.ts` with 3 missing rules (European dot-thousands, net/gross CBM, vessel-DWT range), add `min/max_vessel_dwt_mt` structured fields through prompt → schema → `RawCargoItem` → `ParsedCargo`, then **re-parse the demo cargoes via the claude-cli subscription OFFLINE** (the `AI_PROVIDER=claude-cli` build path that already exists) regenerating `lib/sample-data/demo-parsed-cargoes.json` AND the demo-seed worksheets. Make Claude canonical going forward by adding a real **Anthropic-API provider** to the provider chain (`PARSE_CARGO_PROVIDER → AI_PROVIDER → openai`) for LIVE in-request parsing (claude-cli is forbidden in-request by the `NEXT_RUNTIME` guard).
2. **Consume the recovered data.** `scoreVolume` consumes `volumeCbm`; worksheet shows it; new soft `checkVesselDwtRange` consumes `min/maxVesselDwtMt`.
3. **Honest residue.** For cargo that is *truly* absent after re-parse, stop rendering `✅ OK`, render `null` as "not stated" with no source footnote, cap confidence to LOW with a "not verified" flag — **card STAYS in Main List (no new bucket, not hidden).**

**Tech Stack:** Next.js 16 / React 19, TypeScript, Jest, `lib/ai-provider.ts` (provider chain), Anthropic SDK (`@anthropic-ai/sdk`), claude-cli (offline only), tsx scripts.

---

## Founder decisions (authoritative — override recon/issue wording)

These are LOCKED. Where they diverge from the recon files or the GitHub issue asks, the founder decision wins. Note the divergences so reviewers don't "fix" them back:

| Topic | Issue/recon said | FOUNDER DECISION (this plan) |
|-------|------------------|------------------------------|
| #1021 recovery | manual backfill of demo JSON | **REAL re-parse** of demo cargoes via Claude/Anthropic **subscription** (claude-cli worker, offline, quote-workshop pattern), regenerating `demo-parsed-cargoes.json`. No hand-edit of values. Claude becomes the **canonical** cargo parser. |
| #1022 routing | recon Tier M: route missing-cargo pairs to `lowConfidenceMatches`; issue ask: "distinct lower-confidence/lead state" | **NO re-routing, NO new bucket.** Card **STAYS in Main List**. For truly-absent residue: honest "not verified" flag + **LOW confidence cap**. Removes false `✅ OK`. (This makes #1022 acceptance criterion "distinct lead state" only partially met by literal issue wording — see Acceptance.) |
| #1023 gate | issue ask + recon Tier M: **hard** filter (`pass:false`, demote/exclude) | **SOFT gate.** Vessel outside DWT band still matches but with an explicit "outside required DWT" flag + **strong score penalty** — NOT a hard filter. The vessel-DWT field is **extracted by the Claude re-parse** (folded into #1021), consumed by a new soft `checkVesselDwtRange` in `lib/sailing/match-filters.ts`. |

## Critical constraints (from `.claude/rules/ai-provider.md`)

- **`claude-cli` is FORBIDDEN inside Next.js request handlers** (`NEXT_RUNTIME` guard at `lib/ai-provider.ts:421`). The offline demo re-parse is fine (runs outside Next). LIVE in-request parse of NEW emails **cannot** use claude-cli — it needs the **Anthropic-API** provider wired into the chain.
- Every LLM call passes `signal?: AbortSignal` from `AiOpts` and respects `timeoutMs` (default 85_000ms).
- `writeAuditRecord` is called in the `finally` block; its failure must not break the main call.
- For structured JSON, pass `responseSchema`; on a provider whose model adds a CoT preamble, keep `extractJson()` before `JSON.parse`.
- New provider registered via `getProvider()`/`getModel()` switch — fallback to `"openai"` on unknown value stays.

## Dev-LLM reality (why claude-cli for demo)

Gemini billing is **dead** in dev — that is **why** the offline demo re-parse uses the **Claude/Anthropic subscription via claude-cli** (no per-call billing). The existing `seed:parse`/`seed:all`/`build:sample-data` paths already run with `AI_PROVIDER=claude-cli`. The LIVE provider is a separate concern (Anthropic API) and is what the ADR covers.

## Two-write-paths risk (MUST keep in sync)

`lib/sample-data/demo-parsed-cargoes.json` is the static fixture, but the demo has **two** producers of cargo data and **one** consumer worksheet that must all carry the new fields:

1. **`scripts/build-sample-data.ts:315-316`** — `parseCargoAll(cargoToParse)` → `writeJson('demo-parsed-cargoes.json', parsedCargos)`. Writes the JSON fixture.
2. **`scripts/demo-seed/*`** — `seed:parse` (`parse-llm-direct.ts`) → `data/demo-seed.db` → **`scripts/demo-seed/regenerate-matches.ts:365,490`** builds the worksheet (`worksheet.cargo.weightMt = cfValue(cargo.weightMt)`), which currently has **no `volumeCbm` / `minVesselDwtMt` / `maxVesselDwtMt`** field.

If only one path is updated, list≠detail or stored worksheets disagree with the fixture. Every task that adds a `ParsedCargo` field MUST update BOTH the JSON fixture (via re-parse) AND the worksheet builder + worksheet type.

## Prod-verify targets (before/after, browser-driven)

Three demo examples must be verified with Chrome MCP / playwright (NOT curl+grep — embedded React fallbacks leak into DOM; check `document.body.innerText`, wait ≥3s for hydration):

- **SEAGULL 69** · Chennai → Sohar · MDF — `Qty: about 12,000 net CBM / 13,500 gross CBM` → expect volume captured (12000 cbm), not `—`.
- **SEAGULL 71** · El Arish → Latakia · Bagged cement — `5.000/5.500mts bgd Cement in bb1.5` → expect weight range 5000–5500, no `Weight null mt[¹]`.
- **GRAIN TRADER P** (matched vs SEAGULL 71 = 8,100 DWT) — `any 12,000-14,000 dwt vsl` → expect `minVesselDwtMt:12000, maxVesselDwtMt:14000`, soft "outside required DWT" flag + penalty, NOT `✅ OK`.

---

## File Structure

**Parse layer (Tasks 1–3):**
- Modify `lib/prompts/parse-cargo.ts` — 3 new rules + 2 new schema fields.
- Modify `app/api/ai/parse-cargo/route.ts` — `PARSE_CARGO_SCHEMA` gets `min_vessel_dwt_mt`/`max_vessel_dwt_mt`.
- Modify `lib/parsing/parse-cargo-ai.ts` — `RawCargoItem` + `parseCargoAIResponse()` mapping.
- Modify `lib/types.ts` — `ParsedCargo` gets `minVesselDwtMt`/`maxVesselDwtMt`; `MatchWorksheet.cargo` gets `volumeCbm`/`minVesselDwtMt`/`maxVesselDwtMt`; `MatchHardFilters` gets `vesselDwtRange`.

**Provider layer (Task 4 + ADR):**
- Modify `lib/ai-provider.ts` — add `'anthropic'` provider (type, env assert, model, `callAnthropicText`, `callAiJson` case).
- Create `docs/adr/0002-claude-canonical-cargo-parser.md` (drafted on this branch in THIS PR).

**Re-parse execution (Task 5):**
- Regenerate `lib/sample-data/demo-parsed-cargoes.json` via `AI_PROVIDER=claude-cli` build path.
- Regenerate demo-seed worksheets via the seed pipeline.

**Consume layer (Tasks 6–8):**
- Modify `lib/sailing/fit-breakdown.ts` — `scoreVolume` consumes `volumeCbm`.
- Modify `lib/sailing/match-filters.ts` — new soft `checkVesselDwtRange`.
- Modify `lib/matching/pair-analyzer.ts` — pass DWT fields to filters; apply soft penalty + flag.
- Modify `scripts/demo-seed/regenerate-matches.ts` — worksheet carries new fields.

**Honest residue (Tasks 9–10):**
- Modify `components/match/MatchWorksheet.tsx` — no false `✅ OK`; show new volume; LOW flag.
- Modify `app/match/[id]/page.tsx` + `components/match/SourceAttributionSection.tsx` — null → "not stated", no footnote.

---

## Task 1: Prompt rules — European dot-thousands + net/gross CBM (#1021 RC-A, RC-B)

**Files:**
- Modify: `lib/prompts/parse-cargo.ts:480` (after RANGE RULE), `lib/prompts/parse-cargo.ts:496` (after VOLUME_CBM CRITICAL)
- Test: `lib/prompts/__tests__/parser-robustness-u4.test.ts` (existing prompt-robustness suite)

> Before editing prompt-consuming React/Next code in later tasks, WebFetch the relevant nextjs.org/react.dev page first. This task is prompt text only — no Next API.

- [ ] **Step 1: Write the failing test** — assert the prompt CONTAINS the new rules (prompt-text contract test; the LLM-behavior test is the offline re-parse in Task 5).

```ts
// lib/prompts/__tests__/parser-robustness-u4.test.ts
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts/parse-cargo';

describe('parse-cargo prompt — Group B cargo-data-truth rules', () => {
  it('teaches European dot-as-thousands separator', () => {
    const p = CARGO_INQUIRY_PARSER_PROMPT;
    expect(p).toMatch(/EUROPEAN-DOTS RULE/);
    expect(p).toMatch(/5\.000\/5\.500/);          // worked example from #1021
    expect(p).toMatch(/thousands separator/i);
  });
  it('teaches net/gross CBM disambiguation', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/NET\/GROSS CBM RULE/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/12,000 net CBM/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/prompts/__tests__/parser-robustness-u4.test.ts -t "Group B" --maxWorkers=1 --no-coverage`
Expected: FAIL — prompt has no `EUROPEAN-DOTS RULE` / `NET/GROSS CBM RULE`.

- [ ] **Step 3: Add the European-dots rule** after RANGE RULE (`lib/prompts/parse-cargo.ts:480`):

```
  EUROPEAN-DOTS RULE: When a number uses dots as thousands separators (groups of
  EXACTLY 3 digits after each dot, e.g. "5.000", "10.000", "5.500"), interpret the
  dot as a thousands separator, NOT a decimal point. Apply BEFORE the RANGE RULE.
    "5.000mts"          → weight_mt = 5000 (single value)
    "5.000/5.500mts"    → weight_mt = null, weight_mt_min = 5000, weight_mt_max = 5500
    "10.000/12.000 mt"  → weight_mt = null, weight_mt_min = 10000, weight_mt_max = 12000
  Disambiguation: "5.5" (ONE digit after the dot) = decimal 5.5, NOT thousands.
  "5.000" (THREE digits after the dot) = thousands = 5000. Never output a 5 MT
  cement/grain parcel from "5.000" — that is the dot-thousands trap.
```

- [ ] **Step 4: Add the net/gross CBM rule** after the VOLUME_CBM CRITICAL block (`lib/prompts/parse-cargo.ts:496`):

```
  NET/GROSS CBM RULE: When the email states BOTH a net CBM and a gross CBM figure
  (e.g. "12,000 net CBM / 13,500 gross CBM", "net 12000 cbm, gross 13500 cbm"),
  this IS an explicit total volumetric figure — set volume_cbm = the NET CBM value.
  Net CBM = cargo volume; gross CBM includes dunnage/broken stowage. If only gross
  CBM is given, set volume_cbm = the gross value and note the assumption in missing_info.
    ✓ "about 12,000 net CBM / 13,500 gross CBM" → volume_cbm = 12000
    ✗ volume_cbm = null for a stated net/gross pair (do NOT treat "/" as "no total")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/prompts/__tests__/parser-robustness-u4.test.ts -t "Group B" --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 6: Commit**

```bash
git add lib/prompts/parse-cargo.ts lib/prompts/__tests__/parser-robustness-u4.test.ts
git commit -m "feat(parse-cargo): teach European dot-thousands + net/gross CBM rules (#1021)"
```

---

## Task 2: Prompt + schema — vessel-DWT requirement fields (#1023 Layer 1)

**Files:**
- Modify: `lib/prompts/parse-cargo.ts:428` (vessel-requirement fields block) + the schema description section near line 489.
- Modify: `app/api/ai/parse-cargo/route.ts` (`PARSE_CARGO_SCHEMA`).
- Test: `lib/prompts/__tests__/parser-robustness-u4.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('teaches vessel-DWT range extraction', () => {
  const p = CARGO_INQUIRY_PARSER_PROMPT;
  expect(p).toMatch(/min_vessel_dwt_mt/);
  expect(p).toMatch(/max_vessel_dwt_mt/);
  expect(p).toMatch(/12,?000\s*-\s*14,?000\s*dwt/i);   // GRAIN TRADER P example
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/prompts/__tests__/parser-robustness-u4.test.ts -t "vessel-DWT" --maxWorkers=1 --no-coverage`
Expected: FAIL — no `min_vessel_dwt_mt` in prompt.

- [ ] **Step 3: Add structured-field instructions** in the vessel-requirements block (after `max_vessel_age_yrs`, `lib/prompts/parse-cargo.ts:428`):

```
min_vessel_dwt_mt / max_vessel_dwt_mt (NUMBER | null):
- When the inquiry requests a vessel SIZE BAND in DWT (a "tonnage order" proxy for
  cargo size), extract the band as numbers: min = lower bound, max = upper bound.
  "any 12,000 - 14,000 dwt vsl" → min_vessel_dwt_mt = 12000, max_vessel_dwt_mt = 14000
  "abt 30k dwt"                 → min_vessel_dwt_mt = 30000, max_vessel_dwt_mt = 30000
  "max 25,000 dwt"             → min_vessel_dwt_mt = null,  max_vessel_dwt_mt = 25000
- These describe the REQUIRED VESSEL, NOT the cargo weight. Do NOT populate
  weight_mt/weight_mt_min/weight_mt_max from a DWT requirement. ALSO keep the raw
  phrase in special_requirements (additive). Apply EUROPEAN-DOTS + K-SUFFIX rules
  to these numbers too.
```

- [ ] **Step 4: Add the two fields to the schema-description list** near `lib/prompts/parse-cargo.ts:489`:

```
- min_vessel_dwt_mt: number | null (required vessel DWT lower bound)
- max_vessel_dwt_mt: number | null (required vessel DWT upper bound)
```

- [ ] **Step 5: Add the fields to `PARSE_CARGO_SCHEMA`** in `app/api/ai/parse-cargo/route.ts` (mirror the existing `confidenceFieldNumber`/plain-number entries, e.g. `max_vessel_age_yrs`):

```ts
min_vessel_dwt_mt: { type: ['number', 'null'] },
max_vessel_dwt_mt: { type: ['number', 'null'] },
```

(Match the exact JSON-Schema style already used in that file — copy the shape of `max_vessel_age_yrs`. Add to `propertyOrdering`/`required` arrays if those exist there.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest lib/prompts/__tests__/parser-robustness-u4.test.ts -t "vessel-DWT" --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 1 passed`.

- [ ] **Step 7: Commit**

```bash
git add lib/prompts/parse-cargo.ts app/api/ai/parse-cargo/route.ts lib/prompts/__tests__/parser-robustness-u4.test.ts
git commit -m "feat(parse-cargo): extract min/max vessel-DWT requirement fields (#1023)"
```

---

## Task 3: Types + parse mapping — `minVesselDwtMt`/`maxVesselDwtMt` through to `ParsedCargo` (#1023 Layers 2)

**Files:**
- Modify: `lib/parsing/parse-cargo-ai.ts:6` (`RawCargoItem`), `lib/parsing/parse-cargo-ai.ts:103-120` (mapping)
- Modify: `lib/types.ts:205` (`ParsedCargo`)
- Test: `lib/parsing/__tests__/parse-cargo-ai.test.ts` (existing) — add mapping case.

- [ ] **Step 1: Write the failing test** — feed a raw item with DWT fields, assert mapping.

```ts
// lib/parsing/__tests__/parse-cargo-ai.test.ts
import { parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';

it('maps min/max_vessel_dwt_mt to ParsedCargo', () => {
  const raw = JSON.stringify({
    cargo_type: 'OTHER',
    min_vessel_dwt_mt: 12000,
    max_vessel_dwt_mt: 14000,
  });
  const [cargo] = parseCargoAIResponse(raw, 'email-x');
  expect(cargo.minVesselDwtMt).toBe(12000);
  expect(cargo.maxVesselDwtMt).toBe(14000);
});
it('defaults missing DWT fields to null', () => {
  const [cargo] = parseCargoAIResponse(JSON.stringify({ cargo_type: 'OTHER' }), 'email-y');
  expect(cargo.minVesselDwtMt).toBeNull();
  expect(cargo.maxVesselDwtMt).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/parsing/__tests__/parse-cargo-ai.test.ts -t "DWT" --maxWorkers=1 --no-coverage`
Expected: FAIL — `cargo.minVesselDwtMt` is `undefined`.

- [ ] **Step 3: Add fields to `RawCargoItem`** (`lib/parsing/parse-cargo-ai.ts:6`):

```ts
min_vessel_dwt_mt?: number | null;
max_vessel_dwt_mt?: number | null;
```

- [ ] **Step 4: Add fields to `ParsedCargo`** (`lib/types.ts:205`, alongside `maxVesselAgeYrs`):

```ts
minVesselDwtMt?: number | null;
maxVesselDwtMt?: number | null;
```

- [ ] **Step 5: Add mapping** in `parseCargoAIResponse()` (`lib/parsing/parse-cargo-ai.ts`, near the existing `maxVesselAgeYrs: extractNum(...)` line):

```ts
minVesselDwtMt: extractNum(item.min_vessel_dwt_mt),
maxVesselDwtMt: extractNum(item.max_vessel_dwt_mt),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest lib/parsing/__tests__/parse-cargo-ai.test.ts -t "DWT" --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 7: Commit**

```bash
git add lib/parsing/parse-cargo-ai.ts lib/types.ts lib/parsing/__tests__/parse-cargo-ai.test.ts
git commit -m "feat(types): minVesselDwtMt/maxVesselDwtMt through parse->ParsedCargo (#1023)"
```

---

## Task 4: Wire Anthropic-API provider into the chain (LIVE canonical parser — ADR companion)

> **WebFetch first:** before writing the Anthropic SDK call, WebFetch `https://docs.anthropic.com/en/api/messages` (or the Anthropic SDK README) to confirm the current `messages.create` signature, streaming/abort, and usage fields. Do NOT write the SDK call from memory.

**Files:**
- Modify: `lib/ai-provider.ts` — `Provider` type (line 65), env assert (mirror `assertBedrockEnv`), `getModel` switch (line 505), new `callAnthropicText`, `callAiJson` case (line 977), `getProvider` allowlist (line 486).
- Create: `docs/adr/0002-claude-canonical-cargo-parser.md` (this PR — see ADR task at end).
- Test: `lib/__tests__/ai-provider.test.ts` (existing) — provider-resolution + audit-record cases.

This is the path that lets LIVE in-request parsing of NEW emails use Claude (claude-cli is barred in-request by `NEXT_RUNTIME`). Honors all `.claude/rules/ai-provider.md` invariants.

- [ ] **Step 1: Write the failing test** — `getProvider('PARSE_CARGO')` resolves `'anthropic'`; unknown still falls back to `'openai'`.

```ts
// lib/__tests__/ai-provider.test.ts
import { getProvider } from '@/lib/ai-provider';

describe('anthropic provider in chain', () => {
  const old = { ...process.env };
  afterEach(() => { process.env = { ...old }; });
  it('resolves anthropic from PARSE_CARGO_PROVIDER', () => {
    process.env.PARSE_CARGO_PROVIDER = 'anthropic';
    expect(getProvider('PARSE_CARGO')).toBe('anthropic');
  });
  it('still falls back to openai on unknown value', () => {
    process.env.PARSE_CARGO_PROVIDER = 'totally-bogus';
    expect(getProvider('PARSE_CARGO')).toBe('openai');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/ai-provider.test.ts -t "anthropic provider" --maxWorkers=1 --no-coverage`
Expected: FAIL — `'anthropic'` is rejected by the allowlist → returns `'openai'`.

- [ ] **Step 3: Extend the `Provider` type and `getProvider` allowlist.**

```ts
// lib/ai-provider.ts:65
export type Provider = 'openai' | 'gemini' | 'bedrock' | 'claude-cli' | 'anthropic';
```
```ts
// lib/ai-provider.ts:486 — add 'anthropic' to the accepted set
if (raw !== 'openai' && raw !== 'gemini' && raw !== 'bedrock'
    && raw !== 'claude-cli' && raw !== 'anthropic') {
  logger.warn({ scope, raw }, '[ai-provider] unknown provider value, falling back to openai');
  return 'openai';
}
```

- [ ] **Step 4: Add model resolution** (`lib/ai-provider.ts:505` switch):

```ts
case 'anthropic':
  return process.env.ANTHROPIC_MODEL_ID ?? 'claude-opus-4-8';
```

- [ ] **Step 5: Add `assertAnthropicEnv()`** (mirror `assertBedrockEnv`):

```ts
function assertAnthropicEnv(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('[ai-provider] anthropic provider requires ANTHROPIC_API_KEY');
  }
}
```

- [ ] **Step 6: Implement `callAnthropicText`** — thread `signal`+`timeoutMs` via the existing `buildAbortController(opts)` helper; return `{ text, usage }`. Use the SDK signature confirmed in the WebFetch step.

```ts
async function callAnthropicText(
  system: string, user: string, model: string, opts?: AiOpts,
): Promise<{ text: string; usage?: Usage }> {
  assertAnthropicEnv();
  const Anthropic = (await import('@anthropic-ai/sdk')).default; // lazy, mirror bedrock/vertex
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const { signal } = buildAbortController(opts); // composes opts.signal + timeoutMs
  const r = await client.messages.create(
    {
      model,
      max_tokens: opts?.maxTokens ?? 16000,
      temperature: opts?.temperature ?? 0,
      system,
      messages: [{ role: 'user', content: user }],
    },
    { signal },
  );
  const text = r.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const usage = { promptTokens: r.usage?.input_tokens, completionTokens: r.usage?.output_tokens };
  return { text, usage };
}
```

- [ ] **Step 7: Add the dispatch case in `callAiJson`** (`lib/ai-provider.ts:977` switch). Keep `extractJson()` before `JSON.parse` (Claude may add a preamble even with a schema-shaped prompt):

```ts
case 'anthropic': {
  const r = await callAnthropicText(system, user, model, opts);
  usage = r.usage;
  result = JSON.parse(extractJson(r.text)) as T;
  break;
}
```

The surrounding `try/finally` already calls `writeAuditRecord` in `finally` with `scope/provider/model/usage/ok/err` — the new case inherits it. Verify the `finally` runs for the anthropic branch (it does — it wraps the whole switch).

- [ ] **Step 8: Run the provider tests**

Run: `npx jest lib/__tests__/ai-provider.test.ts -t "anthropic provider" --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 2 passed`.

- [ ] **Step 9: Confirm `@anthropic-ai/sdk` is a dependency** (`grep '"@anthropic-ai/sdk"' package.json`). If absent, add it (`npm i @anthropic-ai/sdk`) in this task and commit the lockfile.

- [ ] **Step 10: Commit**

```bash
git add lib/ai-provider.ts lib/__tests__/ai-provider.test.ts package.json package-lock.json
git commit -m "feat(ai-provider): add Anthropic-API provider for live canonical cargo parse (ADR-0002)"
```

---

## Task 5: Offline re-parse — regenerate `demo-parsed-cargoes.json` + worksheets via claude-cli (#1021/#1022/#1023 data recovery)

**Files:**
- Modify (data, generated): `lib/sample-data/demo-parsed-cargoes.json`
- Modify: `scripts/demo-seed/regenerate-matches.ts:365,490` — worksheet carries `volumeCbm`/`minVesselDwtMt`/`maxVesselDwtMt`.
- Modify: `lib/types.ts` — `MatchWorksheet.cargo` gets `volumeCbm`/`minVesselDwtMt`/`maxVesselDwtMt` (line ~474).
- Test: `__tests__/sample-data/demo-parsed-cargoes.test.ts` (existing fixture test) — assert recovered values.

This is the **real re-parse**, not a hand backfill. It runs OUTSIDE Next via the existing `AI_PROVIDER=claude-cli` build path (subscription, no Gemini billing).

- [ ] **Step 1: Add worksheet type fields** (`lib/types.ts` `MatchWorksheet.cargo`):

```ts
volumeCbm?: number | null;
minVesselDwtMt?: number | null;
maxVesselDwtMt?: number | null;
```

- [ ] **Step 2: Populate them in the worksheet builder** (`scripts/demo-seed/regenerate-matches.ts:365,490`, alongside `weightMt = cfValue(cargo.weightMt)`):

```ts
volumeCbm: cargo.volumeCbm ?? null,
minVesselDwtMt: cargo.minVesselDwtMt ?? null,
maxVesselDwtMt: cargo.maxVesselDwtMt ?? null,
```

- [ ] **Step 3: Re-parse the demo cargoes via claude-cli (offline).** The fixture writer is `scripts/build-sample-data.ts` (`parseCargoAll` → `writeJson('demo-parsed-cargoes.json', …)`), which routes through `callAiJson` and honors `AI_PROVIDER`:

```bash
AI_PROVIDER=claude-cli npx tsx scripts/build-sample-data.ts
```

Expected: `lib/sample-data/demo-parsed-cargoes.json` regenerated. The NEXT_RUNTIME guard does NOT fire (no Next runtime), so claude-cli is allowed.

- [ ] **Step 4: Rebuild the demo-seed DB + worksheets** so the stored path matches the fixture (two-write-paths sync):

```bash
npm run seed:all   # already AI_PROVIDER=claude-cli; runs parse → reconcile → build → regen → validate
```

Expected: `data/demo-seed.db` worksheets now carry the recovered cargo data.

- [ ] **Step 5: Write/extend the fixture assertion test** — confirm the three live examples recovered:

```ts
// __tests__/sample-data/demo-parsed-cargoes.test.ts
import cargoes from '@/lib/sample-data/demo-parsed-cargoes.json';

const byNeedle = (s: string) =>
  (cargoes as any[]).find(c =>
    JSON.stringify(c).includes(s));

it('SEAGULL 71 cement: 5.000/5.500mts → range 5000-5500', () => {
  const c = byNeedle('5.000/5.500');           // source_text retained
  expect(c.weightMtMin).toBe(5000);
  expect(c.weightMtMax).toBe(5500);
});
it('SEAGULL 69 MDF: net/gross CBM → volumeCbm 12000', () => {
  const c = byNeedle('12,000 net CBM');
  expect(c.volumeCbm).toBe(12000);
});
it('GRAIN TRADER P: 12-14k dwt → vessel DWT band captured', () => {
  const c = byNeedle('12,000-14,000');         // or the stored phrasing
  expect(c.minVesselDwtMt).toBe(12000);
  expect(c.maxVesselDwtMt).toBe(14000);
});
```

> **Note for the implementer:** the re-parse is non-deterministic LLM output. If a value comes back off by a rounding/needle mismatch, do NOT hand-edit JSON values to pass the test (that defeats "real re-parse" + violates PI3). Instead tighten the PROMPT rule (Tasks 1–2) and re-run Step 3. If after 2 prompt iterations a value still won't recover, STOP → QUESTIONS.md (founder decision needed: is this datum truly absent → it falls to the #1022 honest-residue path).

- [ ] **Step 6: Run the fixture test**

Run: `npx jest __tests__/sample-data/demo-parsed-cargoes.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: 3 passed` (or documented residue per Step 5 note).

- [ ] **Step 7: Commit** (data + worksheet builder together)

```bash
git add lib/sample-data/demo-parsed-cargoes.json scripts/demo-seed/regenerate-matches.ts lib/types.ts __tests__/sample-data/demo-parsed-cargoes.test.ts
git commit -m "data(demo): re-parse cargoes via claude-cli — recover CBM/dot-MT/vessel-DWT (#1021 #1023)"
```

---

## Task 6: `scoreVolume` consumes `volumeCbm` (#1021 secondary — scoring gap)

**Files:**
- Modify: `lib/sailing/fit-breakdown.ts:404-445` (`scoreVolume`), `lib/sailing/fit-breakdown.ts:613-714` (`computeFitBreakdown` call-site, ~line 631).
- Test: `lib/sailing/__tests__/fit-breakdown.test.ts`

`scoreVolume` currently only accepts weight (`cargoWtMax`) and returns `unknown()` for CBM-only cargo. Make it use `volumeCbm` vs grain capacity when weight is null.

- [ ] **Step 1: Write the failing test**

```ts
// lib/sailing/__tests__/fit-breakdown.test.ts
import { computeFitBreakdown } from '@/lib/sailing/fit-breakdown';
it('scores volume from volumeCbm when weight is null (CBM cargo)', () => {
  const bd = computeFitBreakdown(makeInput({
    cargo: makeCargo({ weightMt: null, weightMtMax: null, volumeCbm: 12000 }),
    vessel: makeVessel({ grainCapacityCbm: 13000 }),
  }));
  const vol = bd.components.find(c => c.factor === 'volume')!;
  expect(vol.rationale).not.toMatch(/not stated/i);  // no longer "unknown"
  expect(vol.score).toBeGreaterThan(0);
});
```

(Use the existing test factories in the suite — match their names; do not invent new ones.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/sailing/__tests__/fit-breakdown.test.ts -t "volumeCbm" --maxWorkers=1 --no-coverage`
Expected: FAIL — rationale is "...not stated, scored conservatively".

- [ ] **Step 3: Pass `cargo` (or `volumeCbm` + `grainCapacity`) into `scoreVolume`** and add the CBM branch:

```ts
// inside scoreVolume, after the existing `if (!cargoWtMax) return unknown(...)` guard,
// branch on volumeCbm BEFORE returning unknown:
if (cargoWtMax == null && volumeCbm != null && volumeCbm > 0 && grainCapacity > 0) {
  const ratio = volumeCbm / grainCapacity;          // direct volumetric fit
  // reuse the same scoring curve scoreVolume uses for the weight→stowage ratio
  return scored('volume', volumeFitShare(ratio),
    `Cargo volume ${volumeCbm} cbm vs grain ${grainCapacity} cbm (${Math.round(ratio*100)}%).`);
}
```

Update the `computeFitBreakdown` call-site (~`fit-breakdown.ts:631`) to pass `cargo.volumeCbm` (and `grainCapacity`, already in scope).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/sailing/__tests__/fit-breakdown.test.ts -t "volumeCbm" --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 5: Run the full fit-breakdown suite** to guard the scoring anchor (UNKNOWN_SHARE calibration):

Run: `npx jest lib/sailing/__tests__/fit-breakdown.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS — no anchor regressions. If existing anchor tests break, that is signal (PI3): do NOT rewrite their expectations beyond the new CBM case — STOP if >5 expectation edits needed.

- [ ] **Step 6: Commit**

```bash
git add lib/sailing/fit-breakdown.ts lib/sailing/__tests__/fit-breakdown.test.ts
git commit -m "feat(fit): scoreVolume consumes volumeCbm for CBM-only cargo (#1021)"
```

---

## Task 7: Soft vessel-DWT gate — `checkVesselDwtRange` (#1023 — SOFT, founder decision)

**Files:**
- Modify: `lib/sailing/match-filters.ts` — new `checkVesselDwtRange`, add `cargoMinVesselDwtMt`/`cargoMaxVesselDwtMt` to `HardFilterInput:485`, call in `runHardFilters:537`, add `vesselDwtRange` to result `checks:615`.
- Modify: `lib/types.ts:425` — `MatchHardFilters` gets `vesselDwtRange?: HardFilterCheck`.
- Modify: `lib/matching/pair-analyzer.ts:120-137` — pass DWT fields; apply soft **score penalty + flag** (NOT exclusion).
- Test: `lib/sailing/__tests__/match-filters.test.ts`

**SOFT semantics (founder):** out-of-band vessel still matches (`pass` stays usable for display) but the check reports an "outside required DWT" state that drives a **strong score penalty** and a flag — it must NOT set a hard `pass:false` that excludes the pair.

- [ ] **Step 1: Write the failing test**

```ts
// lib/sailing/__tests__/match-filters.test.ts
import { checkVesselDwtRange } from '@/lib/sailing/match-filters';
describe('checkVesselDwtRange (soft)', () => {
  it('flags vessel below the requested band', () => {
    const r = checkVesselDwtRange({ vesselDwt: 8100, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.inRange).toBe(false);
    expect(r.reason).toMatch(/outside required DWT/i);
  });
  it('passes a vessel inside the band', () => {
    const r = checkVesselDwtRange({ vesselDwt: 13000, minVesselDwtMt: 12000, maxVesselDwtMt: 14000 });
    expect(r.inRange).toBe(true);
  });
  it('is neutral when no DWT band stated', () => {
    const r = checkVesselDwtRange({ vesselDwt: 8100, minVesselDwtMt: null, maxVesselDwtMt: null });
    expect(r.inRange).toBe(true);     // nothing to enforce → neutral
    expect(r.stated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/sailing/__tests__/match-filters.test.ts -t "checkVesselDwtRange" --maxWorkers=1 --no-coverage`
Expected: FAIL — `checkVesselDwtRange` is not exported.

- [ ] **Step 3: Implement `checkVesselDwtRange`** (soft — returns a descriptor, not a hard pass/fail that excludes). Mirror tolerance style of `checkCargoWeight` (5%):

```ts
export function checkVesselDwtRange(args: {
  vesselDwt: number | null;
  minVesselDwtMt: number | null;
  maxVesselDwtMt: number | null;
}): { stated: boolean; inRange: boolean; reason?: string } {
  const { vesselDwt, minVesselDwtMt, maxVesselDwtMt } = args;
  if (minVesselDwtMt == null && maxVesselDwtMt == null) return { stated: false, inRange: true };
  if (vesselDwt == null || !Number.isFinite(vesselDwt)) return { stated: true, inRange: true }; // can't disprove
  const lo = minVesselDwtMt != null ? minVesselDwtMt * 0.95 : -Infinity;
  const hi = maxVesselDwtMt != null ? maxVesselDwtMt * 1.05 : Infinity;
  if (vesselDwt >= lo && vesselDwt <= hi) return { stated: true, inRange: true };
  return {
    stated: true, inRange: false,
    reason: `Vessel ${vesselDwt} DWT outside required DWT ${minVesselDwtMt ?? '?'}-${maxVesselDwtMt ?? '?'}`,
  };
}
```

- [ ] **Step 4: Thread inputs** — add `cargoMinVesselDwtMt`/`cargoMaxVesselDwtMt` to `HardFilterInput`, call `checkVesselDwtRange` in `runHardFilters`, expose result on `MatchHardFilters.vesselDwtRange`. In `pair-analyzer.ts` pass `c.minVesselDwtMt ?? null` / `c.maxVesselDwtMt ?? null`.

- [ ] **Step 5: Apply soft penalty + flag in `pair-analyzer.ts`** (NOT exclusion). When `vesselDwtRange.stated && !vesselDwtRange.inRange`:

```ts
if (hf.vesselDwtRange?.stated && !hf.vesselDwtRange.inRange) {
  m.fitPercent = Math.max(0, m.fitPercent - DWT_OUT_OF_BAND_PENALTY); // strong penalty, e.g. 25
  m.issues = [...(m.issues ?? []), hf.vesselDwtRange.reason!];          // surfaced flag
}
```

Define `DWT_OUT_OF_BAND_PENALTY` (e.g. 25) as a named const near the other scoring constants. The pair still routes normally (no forced demotion to a bucket) — penalty + flag only.

- [ ] **Step 6: Behavioral test** — GRAIN TRADER P (12-14k) vs SEAGULL 71 (8.1k DWT): pair still present (not excluded) but flagged + penalized.

```ts
it('GRAIN TRADER vs 8.1k vessel: penalized + flagged, not excluded', () => {
  const m = analyzePair(grainTraderCargo, seagull71Vessel /* 8100 dwt */);
  expect(m).toBeTruthy();                              // soft: still a match
  expect(m.issues.some(i => /outside required DWT/i.test(i))).toBe(true);
});
```

- [ ] **Step 7: Run tests**

Run: `npx jest lib/sailing/__tests__/match-filters.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/sailing/match-filters.ts lib/types.ts lib/matching/pair-analyzer.ts lib/sailing/__tests__/match-filters.test.ts
git commit -m "feat(match): soft checkVesselDwtRange — flag + penalty for out-of-band vessel (#1023)"
```

---

## Task 8: Honest residue — kill false `✅ OK`, LOW-confidence flag (#1022 — founder: stay in Main List)

**Files:**
- Modify: `components/match/MatchWorksheet.tsx:79-81` (Weight verdict), `:86-88` (Volume verdict).
- Test: `components/match/__tests__/MatchWorksheet.test.tsx`

**Founder decision:** NO re-routing, NO new bucket. Card STAYS in Main List. Only: (a) don't show `✅ OK` when the cargo value is unknown, (b) show "not verified" + LOW confidence.

> **WebFetch first** if touching any React 19 / Next 16 rendering API. Pure JSX/string changes here → no WebFetch needed.

- [ ] **Step 1: Write the failing test** — unknown weight must NOT render `✅ OK`.

```tsx
// components/match/__tests__/MatchWorksheet.test.tsx
import { render, screen } from '@testing-library/react';
import { MatchWorksheet } from '@/components/match/MatchWorksheet';

it('does not show ✅ OK on Weight when cargo weight unknown', () => {
  render(<MatchWorksheet {...worksheetWithUnknownWeight} />);  // util==null, weightMt==null
  const weightRow = screen.getByTestId('worksheet-weight-row');
  expect(weightRow).not.toHaveTextContent('OK');
  expect(weightRow).toHaveTextContent(/not verified|not disclosed|—/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/match/__tests__/MatchWorksheet.test.tsx -t "not show ✅ OK" --maxWorkers=1 --no-coverage`
Expected: FAIL — falls back to `verdictBadge(hf.volume.pass, …)` → "OK".

- [ ] **Step 3: Fix the Weight verdict** (`MatchWorksheet.tsx:79-81`): when `util == null` (weight unknown), render `"⚠️ Cargo weight not verified"` (LOW) instead of `verdictBadge(hf.volume.pass, …)`.

```tsx
verdict: util != null
  ? `${util}% utilisation${...}`
  : (c.weightMt == null && c.weightMtMin == null && c.weightMtMax == null
      ? '⚠️ Cargo weight not verified'
      : verdictBadge(hf.cargoWeight.pass, hf.cargoWeight.reason)),
```

- [ ] **Step 4: Fix the Volume verdict** (`MatchWorksheet.tsx:86-88`): when no weight AND no `volumeCbm`, render `"—"` / "not verified" instead of always `hf.volume.pass`.

```tsx
verdict: (c.weightMt == null && c.volumeCbm == null)
  ? '⚠️ Volume not verified'
  : verdictBadge(hf.volume.pass, hf.volume.reason),
```

- [ ] **Step 5: Surface the LOW-confidence flag** — the card stays in Main List; add a small "LOW confidence — cargo not verified" badge driven by `m.confidence` (already computes `level:'missing'` for null weight in `lib/confidence.ts`). Do NOT change `pair-analyzer.ts` bucket routing.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest components/match/__tests__/MatchWorksheet.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS — `Tests: N passed`.

- [ ] **Step 7: Commit**

```bash
git add components/match/MatchWorksheet.tsx components/match/__tests__/MatchWorksheet.test.tsx
git commit -m "fix(match): honest 'not verified' + LOW flag instead of false ✅ OK (#1022)"
```

---

## Task 9: Null display — "not stated", no false footnote (#1021 RC-C, asks #2/#3)

**Files:**
- Modify: `app/match/[id]/page.tsx:378` (Weight source-attribution guard).
- Modify: `components/match/SourceAttributionSection.tsx:34,55` (filter + render).
- Test: `components/match/__tests__/SourceAttribution.test.tsx`

- [ ] **Step 1: Write the failing test** — a ConfidenceField with `value:null` but `sourceText` set must NOT render `"null mt"` and must NOT attach a footnote.

```tsx
import { render, screen } from '@testing-library/react';
import { SourceAttributionSection } from '@/components/match/SourceAttributionSection';

it('hides a field whose value is null even if sourceText set', () => {
  render(<SourceAttributionSection fields={[
    { label: 'Weight', value: { value: null, sourceText: '5.000/5.500mts', confidence: 'uncertain' } },
  ]} />);
  expect(screen.queryByText(/null/)).toBeNull();
  expect(screen.queryByText(/\[¹\]|\[1\]/)).toBeNull();  // no footnote
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/match/__tests__/SourceAttribution.test.tsx -t "hides a field" --maxWorkers=1 --no-coverage`
Expected: FAIL — renders `"null mt"` with footnote.

- [ ] **Step 3: Fix the page guard** (`app/match/[id]/page.tsx:378`):

```tsx
...(cargo.weightMt != null && cargo.weightMt.value != null
  ? [{ label: 'Weight', value: { ...cargo.weightMt, value: `${cargo.weightMt.value} mt` } }]
  : []),
```

- [ ] **Step 4: Belt-and-suspenders filter** (`SourceAttributionSection.tsx:34`):

```tsx
const attributableFields = fields.filter(f => f.value.sourceText && f.value.value != null);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest components/match/__tests__/SourceAttribution.test.tsx --maxWorkers=1 --no-coverage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/match/[id]/page.tsx" components/match/SourceAttributionSection.tsx components/match/__tests__/SourceAttribution.test.tsx
git commit -m "fix(match): null cargo value renders 'not stated', no false footnote (#1021)"
```

---

## Task 10: Prod-verify the three demo examples (browser-driven, before/after)

**Files:** none (verification task).

> Per orchestrator-day rule: do NOT claim outage/fix from curl+grep. Use Chrome MCP / playwright, wait ≥3s for hydration, check `document.body.innerText`.

- [ ] **Step 1:** After deploy of the rebuilt demo data, open each match in a real browser:
  - SEAGULL 69 (MDF) → cargo Volume shows `12,000 cbm` (not `—`).
  - SEAGULL 71 (cement) → cargo Weight shows `5,000–5,500 mt` (not `—`, no `Weight null mt[¹]`).
  - GRAIN TRADER P × SEAGULL 71 (8.1k) → "outside required DWT" flag + lowered score; NOT `✅ OK`; card still listed.
- [ ] **Step 2:** Capture before/after screenshots into the PR thread / report.
- [ ] **Step 3:** Confirm a truly-absent cargo (e.g. SEAGULL 41 "commodity not specified") shows LOW "not verified" flag, no `✅ OK`, and STAYS in Main List.

---

## ADR Task: Draft ADR-0002 (this PR, docs-only)

**Files:**
- Create: `docs/adr/0002-claude-canonical-cargo-parser.md`
- Modify: `docs/adr/README.md` (append row to the ADR table).

The ADR records: making **Claude the canonical cargo parser** — offline via claude-cli subscription for demo regeneration, and live via a new **Anthropic-API provider** in the chain (`PARSE_CARGO_PROVIDER → AI_PROVIDER → openai`). Status: **Proposed**. (Drafted in THIS docs-only PR; the implementation tasks above land separately.) See the committed ADR file for the full Context/Decision/Consequences.

---

## Acceptance Criteria

| Issue | Criterion | Plan task | Closes? |
|-------|-----------|-----------|---------|
| #1021 | Capture CBM (net/gross) | Task 1 (rule) + Task 5 (re-parse) + Task 6 (scoring) | ✓ if re-parse recovers SEAGULL 69 = 12000 cbm |
| #1021 | Capture dot-thousand/slash-range MT | Task 1 (rule) + Task 5 (re-parse) | ✓ if SEAGULL 71 = 5000-5500 |
| #1021 | `null` renders "not stated", never `null mt` | Task 9 | ✓ |
| #1021 | No false footnote when truly absent | Task 9 | ✓ |
| #1022 | No `✅ OK` on Weight/Volume when unknown | Task 8 | ✓ |
| #1022 | Surface missing-cargo as lower-confidence | Task 8 (LOW flag) | **PARTIAL** vs literal issue ask — founder: stays Main List, LOW flag NOT a separate bucket/"lead state". Orchestrator decides Closes vs leave-open. |
| #1023 | Parse DWT range as constraint | Task 2 + Task 3 + Task 5 | ✓ |
| #1023 | Out-of-band vessel not `✅ OK` | Task 7 (soft) + Task 8 | ✓ (soft penalty+flag, not hard exclude — founder) |
| #1023 | box/geared/max-age enforced | — | **OUT OF SCOPE** this plan (box/geared not in founder scope; only DWT). Leave issue open or split. |

**Closing guidance:** #1021 → `Closes #1021` only after Task 5 re-parse + browser-verify confirm all four criteria. #1022 and #1023 likely **PARTIAL** (founder decisions diverge from literal issue asks; #1023 box/geared explicitly out) — do NOT auto-`Closes` them; orchestrator/founder confirms.

---

## Sequencing (hard dependency order)

1. **Tasks 1–3** (prompt rules + DWT fields through types) — parse truth first.
2. **Task 4** (Anthropic provider) — independent; needed for LIVE canonical parse + ADR.
3. **Task 5** (offline re-parse) — depends on 1–3; regenerates data BOTH write paths.
4. **Tasks 6–7** (consume volumeCbm + soft DWT gate) — depend on 3/5 (data present).
5. **Tasks 8–9** (honest residue UI) — depend on 5 (so only truly-absent data hits residue path).
6. **Task 10** (prod-verify) — last.

Do NOT reorder 5 before 1–3 (re-parse would not capture new fields).

## Self-Review notes

- Spec coverage: all three issues mapped; founder divergences flagged in Acceptance + decisions table.
- Type consistency: field names `minVesselDwtMt`/`maxVesselDwtMt`/`volumeCbm` used identically in `ParsedCargo` (Task 3/5), `MatchWorksheet.cargo` (Task 5), filter input (Task 7). Raw JSON keys `min_vessel_dwt_mt`/`max_vessel_dwt_mt` (Task 2/3).
- Two-write-paths: Task 5 updates JSON fixture (build-sample-data) AND worksheet builder (regenerate-matches) together.
- PI3: Tasks 5 & 6 explicitly warn against rewriting fixture/anchor expectations to pass — fix prompt or STOP.
