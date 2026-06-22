# Claude Prompt Hardening — Five Surgical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply five surgical, audit-derived fixes to the four demo email-parse prompts (+ one constant) so real-world broker emails — fleet circulars, market circulars, CP role-nouns, European-decimal numbers, long bodies — stop silently losing data.

**Architecture:** Five independent edits across five files. Four are prompt-text additions (new rule blocks wrapped in XML tags, each leading with a worked few-shot example, written in calm structured imperatives — no shouty all-caps). One is a single numeric constant change plus a prompt note. Existing prompt text (glossary, field definitions, working examples) is **left intact** — we only insert new blocks at the recon-specified attach points.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Jest (`--maxWorkers=1 --ci --forceExit` on VPS). Prompts are exported string constants in `lib/prompts/*.ts`. Tests are prompt-text wiring guards (`toMatch(/regex/)`) modeled on the existing `lib/prompts/__tests__/parse-cargo-prompt.test.ts`, plus one true behavioral route test for the constant change.

---

## CRITICAL VERIFICATION — resolved (read before starting)

**Question:** Do the live Next.js routes import the SAME `lib/prompts` constants the seed path uses? If yes, one edit covers both seed and live paths.

**Answer: YES — confirmed by grep.** Both the live routes and the offline seed import the identical exported prompt constants from `@/lib/prompts/*`:

| Prompt constant | Live route | Seed path (`scripts/demo-seed/parse-llm-direct.ts`) |
|---|---|---|
| `getClassifyPrompt()` | `app/api/ai/classify/route.ts:8,38` | `:20,101` |
| `CARGO_INQUIRY_PARSER_PROMPT` | `app/api/ai/parse-cargo/route.ts:9,79,146` | `:21,117` |
| `VESSEL_POSITION_PARSER_PROMPT` | `app/api/ai/parse-vessel/route.ts:10,46,70` | `:22,141` |
| `FIXTURE_RECAP_PARSER_PROMPT` | `app/api/ai/parse-recap/route.ts:8,37,59` | `:23,166` |

**Therefore: editing the four prompt files (`lib/prompts/parse-vessel.ts`, `parse-cargo.ts`, `parse-recap.ts`, `classify.ts`) covers BOTH the live HTTP path and the offline demo-seed path in a single edit. No duplication exists — there is nothing to edit twice.**

**FM-03 constant** (`MAX_EMAIL_BODY_CHARS` in `lib/constants.ts:68`) is likewise shared. It is imported by:
- `app/api/ai/classify/route.ts:9,68` (live classify) — truncates `body_preview`.
- `scripts/demo-seed/parse-llm-direct.ts:33,95` (seed classify) — same.
- `scripts/build-sample-data.ts:27,158` and `scripts/eval/run-parser.ts:16,105` — eval/build helpers (benign: higher cap = more visible body).
- `app/api/emails/fetch/route.ts:3,41` — uses `MAX_EMAIL_BODY_CHARS * 2` for raw-body storage. **Side-effect to note:** raising 3000 → 8000 changes this storage cap from 6000 → 16000 chars. This is benign (stores more body, never less; no truncation regression) but must be acknowledged in the FM-03 commit message.

**Important non-collision:** `parse-cargo` uses a *different* constant — `MAX_EMAIL_BODY_CHARS = 12_000` from `lib/parse-cargo-helpers.ts:21` (a deliberately separate value; see the "Do NOT move generic MAX_EMAIL_BODY_CHARS here" comment at `lib/parse-cargo-helpers.ts:10`). FM-03 does **not** touch parse-cargo's ceiling. FM-03 is exclusively a classify fix.

**PI3 / test-pinning check (done):** No test asserts `MAX_EMAIL_BODY_CHARS === 3000`. `lib/__tests__/classification-service.test.ts:12` mocks it to `2000` (a jest mock override — unaffected by the source value). `app/api/ai/parse-cargo/__tests__/route.test.ts:133-136` asserts the *parse-cargo* constant is `> 1000` and `<= 20_000` — a different constant, unaffected. No existing expectations need rewriting.

---

## Claude-idiom requirements (apply to every new block — research §4)

From `docs/research/claude-migration-research-2026-06-22.md` §4 (verified vs `claude-api` skill). Every NEW block this plan adds MUST:

1. **Wrap the block in an XML tag** (e.g. `<fleet_circular_completeness>…</fleet_circular_completeness>`). Claude is trained on XML structure.
2. **Lead with a worked few-shot example** (input → correct JSON) before the prose rule. On claude-cli there is no schema guarantee, so examples carry the contract.
3. **Use `source_text` grounding** where the fix is about *what to read* (FM-06 vessel blocks, FM-13 charterers label).
4. **Avoid shouty repeated all-caps** — no `CRITICAL`, `MANDATORY`, `MUST`, `YOU MUST`. Research shows this hurts Claude 4.x (it over-complies). Use calm structured imperatives plus the example.

> **Do NOT copy the suggested blocks from `recon-claude-prompts-failmodes.md` verbatim** — that recon wrote them in the old shouty Gemini style ("MANDATORY", "CRITICAL silent-loss failure", bare ALL-CAPS headers). This plan rewrites them into calm, XML-wrapped, example-first Claude idiom. The exact rewritten text is given in each task below — use it as written.

> **Surgical scope:** Only the four prompt strings get new blocks + one constant changes. Do **not** restructure existing prompt sections, do **not** convert the existing ALL-CAPS section headers to XML, do **not** touch the glossary or field definitions. Keep working text intact.

---

## File Structure

| File | Change | Fix |
|---|---|---|
| `lib/prompts/parse-vessel.ts` | Insert `<fleet_circular_completeness>` block after the FLEET COMPLETENESS / FORMATTING MARKERS section | FM-06 |
| `lib/prompts/parse-cargo.ts` | Insert `<market_circular_multi_item>` block after VESSEL POSITION GUARD | FM-14 |
| `lib/prompts/parse-recap.ts` | Insert `<european_decimal_rule>` (top-level, all numeric fields) after vessel_yob NULL RULE; insert `<role_noun_guard>` before the `charterers:` field definition | FM-10, FM-13 |
| `lib/constants.ts` | `MAX_EMAIL_BODY_CHARS` 3000 → 8000 | FM-03 |
| `lib/prompts/classify.ts` | Insert `<truncation_awareness>` block before "You will receive an array of emails." | FM-03 |
| `lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts` | New wiring test | FM-06 |
| `lib/prompts/__tests__/parse-cargo-market-circular.test.ts` | New wiring test | FM-14 |
| `lib/prompts/__tests__/parse-recap-hardening.test.ts` | New wiring test (FM-10 + FM-13) | FM-10, FM-13 |
| `lib/__tests__/max-email-body-chars.test.ts` | New constant + classify-prompt wiring test | FM-03 |
| `app/api/ai/classify/__tests__/route.test.ts` | New/extend behavioral truncation test (PI2) | FM-03 |

**Testing note:** Prompt-text wiring tests protect the *wiring* of structural rules into the prompt string — they do not assert LLM behavior. True LLM accuracy is validated separately by the live progonq corpus re-parse (the audit's P0 diagnostic task — out of scope here). This mirrors the existing repo convention documented at the top of `lib/prompts/__tests__/parse-cargo-prompt.test.ts`. PI2 behavioral coverage is satisfied by the classify-route truncation test in Task 5 (a real handler call asserting body content reaches the LLM untruncated).

---

## Task 1 — FM-06: Fleet-circular completeness (count-first + 3-vessel example)

**Files:**
- Modify: `lib/prompts/parse-vessel.ts` (insert after the FORMATTING MARKERS lines, ~line 343, which close the FLEET COMPLETENESS section)
- Test: `lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts`

**Anchor:** Insert the new block immediately AFTER this existing line (`lib/prompts/parse-vessel.ts:343`):
```
- A vessel section wrapped in asterisks or star separators is real data — extract it normally.
```

- [ ] **Step 1: Write the failing wiring test**

Create `lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts`:
```typescript
/**
 * Wiring guard for the FM-06 fleet-circular completeness block.
 * Protects the WIRING of the count-first rule + 3-vessel example into the prompt.
 * LLM accuracy is covered by the live progonq corpus re-parse, not here.
 */
import { VESSEL_POSITION_PARSER_PROMPT } from '../parse-vessel';

describe('VESSEL_POSITION_PARSER_PROMPT — fleet-circular completeness (FM-06)', () => {
  it('wraps the new rule in an XML tag', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/<fleet_circular_completeness>/);
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/<\/fleet_circular_completeness>/);
  });

  it('instructs count-first before extracting any single vessel', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/count the vessel sections/i);
  });

  it('includes the 3-vessel worked example (ALPHA / BETA / GAMMA)', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/MV ALPHA/);
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/MV BETA/);
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/MV GAMMA/);
  });

  it('grounds each vessel via its own spec-block source_text', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/source_text from that vessel's own spec block/);
  });

  it('avoids shouty all-caps imperatives in the new block', () => {
    const block = VESSEL_POSITION_PARSER_PROMPT
      .split('<fleet_circular_completeness>')[1]
      .split('</fleet_circular_completeness>')[0];
    expect(block).not.toMatch(/\bMUST\b|\bMANDATORY\b|\bCRITICAL\b/);
  });

  it('preserves the existing FLEET COMPLETENESS section', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toMatch(/FLEET COMPLETENESS/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `<fleet_circular_completeness>` / `MV ALPHA` not found in prompt.

- [ ] **Step 3: Insert the new block into the prompt**

In `lib/prompts/parse-vessel.ts`, immediately after the anchor line `- A vessel section wrapped in asterisks or star separators is real data — extract it normally.`, insert:
```
<fleet_circular_completeness>
A fleet position circular is one email offering several vessels — a fleet list,
numbered entries, or consecutive spec blocks each with its own "open [PORT]".
Each vessel is a separate item.

Worked example — three vessel sections become three items:
Input:
  *** MV ALPHA, 8500 DWT, open Rotterdam 15 May ***
  *** MV BETA, 11000 DWT, open Hamburg 20 May ***
  *** MV GAMMA, 15000 DWT, open Antwerp 25 May ***
Output:
  { "items": [
    { "vessel_name": { "value": "MV ALPHA", "confidence": "confirmed", "source_text": "MV ALPHA, 8500 DWT, open Rotterdam 15 May" } },
    { "vessel_name": { "value": "MV BETA",  "confidence": "confirmed", "source_text": "MV BETA, 11000 DWT, open Hamburg 20 May" } },
    { "vessel_name": { "value": "MV GAMMA", "confidence": "confirmed", "source_text": "MV GAMMA, 15000 DWT, open Antwerp 25 May" } }
  ] }

Before extracting any single vessel, count the vessel sections in the email, then
return one item per section — eight sections give eight items. Copy each
vessel_name.source_text from that vessel's own spec block, so every vessel is
read individually. Returning fewer items than sections drops vessels that cannot
be recovered later, so the item count and the section count should match.
</fleet_circular_completeness>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/parse-vessel.ts lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts
git commit -m "fix(parse-vessel): FM-06 fleet-circular completeness — count-first + 3-vessel example"
```

---

## Task 2 — FM-14: Market-circular multi-item (++++ / ==== / ---- separators)

**Files:**
- Modify: `lib/prompts/parse-cargo.ts` (insert after VESSEL POSITION GUARD, ~line 378)
- Test: `lib/prompts/__tests__/parse-cargo-market-circular.test.ts`

**Anchor:** Insert immediately AFTER the existing VESSEL POSITION GUARD paragraph (`lib/prompts/parse-cargo.ts:378`, the line ending `...not a cargo inquiry"].`). This places the new block alongside the other guards and before the field definitions.

- [ ] **Step 1: Write the failing wiring test**

Create `lib/prompts/__tests__/parse-cargo-market-circular.test.ts`:
```typescript
/**
 * Wiring guard for the FM-14 market-circular multi-item block.
 * Protects the WIRING of the block-separator recognition + worked example.
 */
import { CARGO_INQUIRY_PARSER_PROMPT } from '../parse-cargo';

describe('CARGO_INQUIRY_PARSER_PROMPT — market-circular multi-item (FM-14)', () => {
  it('wraps the new rule in an XML tag', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/<market_circular_multi_item>/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/<\/market_circular_multi_item>/);
  });

  it('names the ++++ / ==== / ---- block separators', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/\+\+\+\+/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/====/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/----/);
  });

  it('includes the 3-cargo worked example (urea / clinker / salt)', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/urea/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/clinker/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/salt/);
  });

  it('adds a missing_info breadcrumb when one item is returned despite a separator', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/verify this is not a multi-cargo market circular/);
  });

  it('avoids shouty all-caps imperatives in the new block', () => {
    const block = CARGO_INQUIRY_PARSER_PROMPT
      .split('<market_circular_multi_item>')[1]
      .split('</market_circular_multi_item>')[0];
    expect(block).not.toMatch(/\bMUST\b|\bMANDATORY\b|\bCRITICAL\b/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/prompts/__tests__/parse-cargo-market-circular.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `<market_circular_multi_item>` not found.

- [ ] **Step 3: Insert the new block into the prompt**

In `lib/prompts/parse-cargo.ts`, immediately after the VESSEL POSITION GUARD paragraph (line 378), insert:
```
<market_circular_multi_item>
A market circular is one email containing several independent cargo offers, usually
sent by a broker to a distribution list. Offers are commonly divided by block
separators such as:
  ++++    ====    ----    ***    ~~~
  "Cargo N:"   "Inquiry N:"   "REF: [code]"
  a blank line followed by a fresh commodity/route on a new line

When two or more blocks are separated this way, each block is a separate cargo
inquiry — emit one item per block.

Worked example — three blocks become three items:
Input:
  8000mt urea, Sohar -> Mombasa, laycan Jul ++++
  12000mt clinker, El Arish -> POC, spot ++++
  5500mt salt, Constanta -> Lagos, Aug/Sep
Output:
  { "items": [
    { "origin_port": { "value": "Sohar" }, "destination_port": { "value": "Mombasa" }, "weight_mt": { "value": 8000 } },
    { "origin_port": { "value": "El Arish" }, "destination_port": { "value": "Egypt (port unspecified)" }, "weight_mt": { "value": 12000 } },
    { "origin_port": { "value": "Constanta" }, "destination_port": { "value": "Lagos" }, "weight_mt": { "value": 5500 } }
  ] }

If you return a single item while the body still contains a ++++ (or ==== / ----)
separator between distinct cargo/route/quantity combinations, add a missing_info
entry: "Body contains ++++ separator — verify this is not a multi-cargo market
circular." That keeps the omission visible instead of silently dropping cargoes.
</market_circular_multi_item>
```

> Note: the worked example's `"Egypt (port unspecified)"` matches the existing house rule in `=== PORT HANDLING RULES ===` ("[Country] (port unspecified)" for unspecified POC ports) — keep it consistent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/prompts/__tests__/parse-cargo-market-circular.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/parse-cargo.ts lib/prompts/__tests__/parse-cargo-market-circular.test.ts
git commit -m "fix(parse-cargo): FM-14 market-circular multi-item — ++++/====/---- separators + example"
```

---

## Task 3 — FM-13: General role-noun guard + source_text grounding for charterers

**Files:**
- Modify: `lib/prompts/parse-recap.ts` (insert before the `charterers:` field definition, ~line 105)
- Test: covered by `lib/prompts/__tests__/parse-recap-hardening.test.ts` (created in Task 4, Step 1; the file holds both FM-13 and FM-10 assertions — write FM-13 assertions here, FM-10 assertions in Task 4)

**Anchor:** Insert immediately BEFORE this existing line (`lib/prompts/parse-recap.ts:105`):
```
- charterers: the party who contracted the vessel charter. Source: explicit "Charterers:" label in the recap body ONLY.
```
Leave the existing 3 anti-examples (lines 109–111) intact below — the new general guard sits above them and generalizes the rule.

- [ ] **Step 1: Write the failing wiring test (FM-13 assertions)**

Create `lib/prompts/__tests__/parse-recap-hardening.test.ts` with the FM-13 block (the FM-10 block is added in Task 4):
```typescript
/**
 * Wiring guard for FM-13 (role-noun guard) and FM-10 (European-decimal, all fields).
 * Protects the WIRING of the new blocks into FIXTURE_RECAP_PARSER_PROMPT.
 */
import { FIXTURE_RECAP_PARSER_PROMPT } from '../parse-recap';

describe('FIXTURE_RECAP_PARSER_PROMPT — role-noun guard (FM-13)', () => {
  it('wraps the role-noun guard in an XML tag', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/<role_noun_guard>/);
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/<\/role_noun_guard>/);
  });

  it('generalizes the rule across charterers / owners / broker', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/charterers \/ owners \/ broker/);
  });

  it('requires the charterers source_text to contain the "Charterers:" label', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/source_text .* contain the "Charterers:" label/);
  });

  it('includes a role-noun worked example that resolves to null', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/charterers = null/);
  });

  it('avoids shouty all-caps imperatives in the role-noun block', () => {
    const block = FIXTURE_RECAP_PARSER_PROMPT
      .split('<role_noun_guard>')[1]
      .split('</role_noun_guard>')[0];
    expect(block).not.toMatch(/\bMUST\b|\bMANDATORY\b|\bCRITICAL\b/);
  });

  it('preserves the existing ACCOUNT vs CHARTERERS vs BROKER section', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/ACCOUNT vs CHARTERERS vs BROKER/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/prompts/__tests__/parse-recap-hardening.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — `<role_noun_guard>` not found.

- [ ] **Step 3: Insert the role-noun guard block**

In `lib/prompts/parse-recap.ts`, immediately before the `- charterers:` field definition (line 105), insert:
```
<role_noun_guard>
The words "Charterers", "Owners", "Master", "Broker" appearing inside a clause
body are roles — the grammatical subject of an obligation — not party names. A CP
contains many such clauses, so matching a few example phrases is not enough; the
test is structural.

Worked example — a role-noun resolves to null:
  Body: "...DEMURRAGE TO BE PAID BY CHARTERERS WITHIN 10 BANKING DAYS..."
        (no "Charterers:" label anywhere in the body)
  -> charterers = null   (the word is a role inside a clause, not a disclosed party)

A role-noun (do not use as a party name):
  "FOR CHARTERERS ACCOUNT"   "AT OWNERS RISK"   "MASTER TO SIGN B/L"
A party name (safe to use):
  "Charterers: Acme Shipping Ltd"   "Owners: Varan Ltd"

Set charterers / owners / broker only from a line where the role label is directly
followed by a company name, e.g. "Charterers: [Company]". For charterers, the
source_text should contain the "Charterers:" label together with the company name;
if your only candidate is a clause sentence such as "FOR CHARTERERS ACCOUNT",
that is a role-noun, so set the field to null. When no labeled line exists, the
field is null.
</role_noun_guard>
```

- [ ] **Step 4: Run test to verify the FM-13 assertions pass**

Run: `npx jest lib/prompts/__tests__/parse-recap-hardening.test.ts -t "role-noun guard" --maxWorkers=1 --no-coverage`
Expected: PASS (6 FM-13 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/parse-recap.ts lib/prompts/__tests__/parse-recap-hardening.test.ts
git commit -m "fix(parse-recap): FM-13 general role-noun guard + charterers source_text grounding"
```

---

## Task 4 — FM-10: Promote European-decimal rule to a top-level all-numeric-fields rule

**Files:**
- Modify: `lib/prompts/parse-recap.ts` (insert after vessel_yob NULL RULE, ~line 26, before SUBJECT-LINE PORT CONFIDENCE at line 31)
- Test: extend `lib/prompts/__tests__/parse-recap-hardening.test.ts` (created in Task 3)

**Anchor:** Insert immediately AFTER the vessel_yob NULL RULE block (`lib/prompts/parse-recap.ts:24-26`, ending `  ✓ vessel_yob: null`) and BEFORE `SUBJECT-LINE PORT CONFIDENCE:` (line 31). The existing field-scoped `vessel_dwt` European-decimal rule at line 195 stays in place — the new top-level block references it.

- [ ] **Step 1: Add the failing FM-10 assertions to the hardening test**

Append to `lib/prompts/__tests__/parse-recap-hardening.test.ts`:
```typescript
describe('FIXTURE_RECAP_PARSER_PROMPT — European-decimal all-fields (FM-10)', () => {
  it('wraps the European-decimal rule in an XML tag', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/<european_decimal_rule>/);
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/<\/european_decimal_rule>/);
  });

  it('applies the rule to freight_rate, demurrage_rate, and cargo quantities (not just vessel_dwt)', () => {
    const block = FIXTURE_RECAP_PARSER_PROMPT
      .split('<european_decimal_rule>')[1]
      .split('</european_decimal_rule>')[0];
    expect(block).toMatch(/freight_rate/);
    expect(block).toMatch(/demurrage_rate/);
    expect(block).toMatch(/cargo_quantity_min/);
  });

  it('includes the 3.858 -> 3858 and 22.500 -> 22500 worked examples', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/3\.858.*3858/s);
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/22\.500.*22500/s);
  });

  it('keeps the existing vessel_dwt-scoped European-decimal note intact', () => {
    expect(FIXTURE_RECAP_PARSER_PROMPT).toMatch(/vessel_dwt = 3858/);
  });
});
```

- [ ] **Step 2: Run test to verify the new FM-10 assertions fail**

Run: `npx jest lib/prompts/__tests__/parse-recap-hardening.test.ts -t "European-decimal" --maxWorkers=1 --no-coverage`
Expected: FAIL — `<european_decimal_rule>` not found.

- [ ] **Step 3: Insert the top-level European-decimal block**

In `lib/prompts/parse-recap.ts`, immediately after `  ✓ vessel_yob: null` (line 26), insert:
```
<european_decimal_rule>
This applies to every numeric field: vessel_dwt, cargo_quantity_min,
cargo_quantity_max, freight_rate, demurrage_rate, despatch_rate, loading_rate,
discharging_rate, and any other numeric value.

When a number uses a dot as a thousands separator followed by exactly three digits
(pattern X.YYY or X.YYY.ZZZ), the dot is a thousands separator, not a decimal point:
  "3.858 TON"    -> 3858      (not 3.858)
  "22.500 USD"   -> 22500     (not 22.5)
  "1.500.000 kg" -> 1500000
A comma is the decimal mark in this notation ("3,5" -> 3.5).

The vessel_dwt note in the field definitions below is one instance of this rule;
this general version takes precedence and covers all numeric fields.
</european_decimal_rule>
```

- [ ] **Step 4: Run the full hardening test to verify all pass**

Run: `npx jest lib/prompts/__tests__/parse-recap-hardening.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS (FM-13 + FM-10 = 10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prompts/parse-recap.ts lib/prompts/__tests__/parse-recap-hardening.test.ts
git commit -m "fix(parse-recap): FM-10 promote European-decimal to top-level all-numeric-fields rule"
```

---

## Task 5 — FM-03: Raise MAX_EMAIL_BODY_CHARS 3000 → 8000 + truncation-awareness note

**Files:**
- Modify: `lib/constants.ts:68`
- Modify: `lib/prompts/classify.ts` (insert `<truncation_awareness>` before "You will receive an array of emails.", line 102)
- Test: `lib/__tests__/max-email-body-chars.test.ts` (constant + classify wiring)
- Test (behavioral, PI2): `app/api/ai/classify/__tests__/route.test.ts` (truncation behavior through the real handler)

- [ ] **Step 1: Write the failing constant + wiring test**

Create `lib/__tests__/max-email-body-chars.test.ts`:
```typescript
/**
 * FM-03: classify body-preview ceiling. Real import of the source constant
 * (not a mock) + classify-prompt truncation-awareness wiring.
 */
import { MAX_EMAIL_BODY_CHARS } from '@/lib/constants';
import { CLASSIFICATION_SYSTEM_PROMPT } from '@/lib/prompts/classify';

describe('FM-03 — MAX_EMAIL_BODY_CHARS classify ceiling', () => {
  it('is raised to at least 8000 chars', () => {
    expect(MAX_EMAIL_BODY_CHARS).toBeGreaterThanOrEqual(8000);
  });

  it('classify prompt has a truncation-awareness block', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/<truncation_awareness>/);
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/\[truncated\]/);
  });

  it('truncation block tells the model not to default to OTHER', () => {
    expect(CLASSIFICATION_SYSTEM_PROMPT).toMatch(/do not default to OTHER/i);
  });
});
```

> Note: `CLASSIFICATION_SYSTEM_PROMPT` is exported from `lib/prompts/classify.ts` (the baseline prompt; `getClassifyPrompt()` returns it when `EMAIL_PARSE_R4_ENABLED` is unset — the production default). Confirm the export name with `grep -n "export const CLASSIFICATION_SYSTEM_PROMPT" lib/prompts/classify.ts` before running; it is the baseline constant.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/max-email-body-chars.test.ts --maxWorkers=1 --no-coverage`
Expected: FAIL — constant is still 3000, `<truncation_awareness>` not found.

- [ ] **Step 3a: Raise the constant**

In `lib/constants.ts`, change line 68 from:
```ts
export const MAX_EMAIL_BODY_CHARS = 3000;
```
to:
```ts
export const MAX_EMAIL_BODY_CHARS = 8000;
```

- [ ] **Step 3b: Insert the truncation-awareness block into the classify prompt**

In `lib/prompts/classify.ts`, immediately BEFORE the line `You will receive an array of emails. Return a JSON object.` (line 102), insert:
```
<truncation_awareness>
The body_preview may end with "[truncated]" when the original email was longer than
the preview budget. When you see "[truncated]":
  - Classify from the visible content; do not default to OTHER because text is missing.
  - If the visible content already identifies a category (vessel specs, cargo
    tonnage, recap terms), use that category and lower confidence by about 0.05.
  - Do not lower urgency on account of truncation alone.
</truncation_awareness>
```

> Scope note: the production default is the baseline prompt (`CLASSIFICATION_SYSTEM_PROMPT`). The R4 prompt (`lib/prompts/classify-r4.ts`, gated off by `EMAIL_PARSE_R4_ENABLED`, has the same "You will receive an array of emails." tail at line 81) is **out of scope** for this surgical fix per the dispatch. If R4 is later promoted to default, mirror this block there as a follow-up — flag it in the PR description, do not add it now.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/max-email-body-chars.test.ts --maxWorkers=1 --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the behavioral truncation test (PI2)**

First check whether `app/api/ai/classify/__tests__/route.test.ts` already exists:
```bash
ls app/api/ai/classify/__tests__/route.test.ts 2>/dev/null && echo EXISTS || echo CREATE
```

Model the test on the existing `app/api/ai/parse-cargo/__tests__/route.test.ts` truncation pattern (`:145-160`), which mocks the LLM call and captures the prompt argument. Add (or create) a behavioral test that drives the real classify handler and asserts a >3000-char body now reaches the LLM untruncated:
```typescript
/**
 * PI2 behavioral test: a body longer than the old 3000 ceiling now reaches the
 * classifier untruncated (FM-03). Drives the real route handler with a mocked LLM.
 */
import { POST } from '@/app/api/ai/classify/route';

// Capture the body_preview the handler sends to the LLM.
const captured: { userPrompt?: string } = {};
jest.mock('@/lib/ai-provider', () => ({
  callAiJson: jest.fn(async (_scope: string, _system: string, user: string) => {
    captured.userPrompt = user;
    return { classifications: [{ id: '1', category: 'OTHER', urgency: 'low', confidence: 0.5, is_unanswered: false, days_without_reply: 0 }] };
  }),
}));

describe('classify route — FM-03 body no longer truncated at 3000 (PI2 behavioral)', () => {
  it('sends a 5000-char body to the LLM without cutting it at 3000', async () => {
    const longBody = 'MV TEST open Rotterdam. ' + 'x'.repeat(5000);
    const req = new Request('http://localhost:3000/api/ai/classify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ emails: [{ id: '1', subject: 's', from: 'a@b.c', date: '2026-06-22', body: longBody }] }),
    });
    await POST(req as any);
    expect(captured.userPrompt).toBeDefined();
    // Old behavior truncated to ~3000; new ceiling (8000) keeps the full 5000-char body.
    expect(captured.userPrompt!.length).toBeGreaterThan(3500);
  });
});
```

> **Wiring caveat for the implementer:** verify the exact request shape and the `callAiJson`/`callAiText` symbol the classify route actually imports before finalizing the mock (`grep -n "callAi" app/api/ai/classify/route.ts`). The route uses `callAiJson` per the schema recon. Adjust the mock target/return shape and the request payload key (`emails` vs other) to match the handler — the assertion (untruncated body length) is the contract; the plumbing must match the real route. If the handler needs auth/headers the parse-cargo route test already shows the pattern — copy it.

- [ ] **Step 6: Run the behavioral test**

Run: `npx jest app/api/ai/classify/__tests__/route.test.ts --maxWorkers=1 --no-coverage --forceExit`
Expected: PASS — captured body length > 3500 (would have been ~3000 under the old constant).

- [ ] **Step 7: Cross-cutting grep for the old literal + commit**

Confirm no other test pins the old value (PI3 discovery):
```bash
grep -rn "MAX_EMAIL_BODY_CHARS" __tests__/ lib/__tests__/ app/ scripts/ 2>/dev/null | grep -iE "=== ?3000|toBe\(3000\)|=3000"
```
Expected: no hits (the `lib/__tests__/classification-service.test.ts:12` mock of `2000` is a jest mock override, not an assertion on the source value — leave it).

```bash
git add lib/constants.ts lib/prompts/classify.ts lib/__tests__/max-email-body-chars.test.ts app/api/ai/classify/__tests__/route.test.ts
git commit -m "fix(classify): FM-03 raise MAX_EMAIL_BODY_CHARS 3000->8000 + truncation-awareness note

Side-effect: app/api/emails/fetch raw-body cap (MAX_EMAIL_BODY_CHARS*2) goes 6000->16000 (benign, stores more body)."
```

---

## Task 6 — Full verification & PR

- [ ] **Step 1: TypeCheck**

Run: `npx tsc --noEmit`
Expected: clean (no new errors; only string constants + tests changed).

- [ ] **Step 2: Run all affected tests together**

Run:
```bash
npx jest \
  lib/prompts/__tests__/parse-vessel-fleet-circular.test.ts \
  lib/prompts/__tests__/parse-cargo-market-circular.test.ts \
  lib/prompts/__tests__/parse-recap-hardening.test.ts \
  lib/__tests__/max-email-body-chars.test.ts \
  app/api/ai/classify/__tests__/route.test.ts \
  --maxWorkers=1 --no-coverage --forceExit
```
Expected: all green.

- [ ] **Step 3: Regression-guard the existing prompt tests** (ensure no working text was disturbed)

Run:
```bash
npx jest lib/prompts/__tests__/ --maxWorkers=1 --no-coverage --forceExit
```
Expected: existing `parse-cargo-prompt.test.ts`, `parser-robustness-u4.test.ts`, `source-text-clause.test.ts` still green.

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin HEAD
gh pr create --title "Harden 4 demo parse prompts (FM-06/14/13/10/03) — Claude idiom" --body "$(cat <<'EOF'
## Summary
Five surgical, audit-derived fixes to the demo email-parse prompts (`docs/audits/2026-06-22-parser-real-email-audit.md`). All new rule blocks use Claude idiom (XML-wrapped, example-first, calm imperatives — no all-caps) per `docs/research/claude-migration-research-2026-06-22.md` §4.

- **FM-06** parse-vessel: fleet-circular completeness (count-first + 3-vessel example)
- **FM-14** parse-cargo: market-circular multi-item (++++/====/---- separators + example)
- **FM-13** parse-recap: general role-noun guard + charterers source_text grounding
- **FM-10** parse-recap: European-decimal promoted to top-level all-numeric-fields rule
- **FM-03** classify: MAX_EMAIL_BODY_CHARS 3000→8000 + truncation-awareness note

## Coverage note
Prompt edits cover BOTH the live `app/api/ai/*` routes and the offline `scripts/demo-seed` path — both import the same `lib/prompts/*` constants (verified). One edit per fix, no duplication.

## Side-effect
`app/api/emails/fetch` raw-body cap (`MAX_EMAIL_BODY_CHARS * 2`) goes 6000→16000 — benign.

## Out of scope / follow-ups
- Live progonq corpus re-parse (audit P0 diagnostic) validates real LLM accuracy — separate task.
- R4 classify prompt parity for the truncation block (only if R4 is promoted to default).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — all five dispatch fixes mapped: FM-06 → Task 1; FM-14 → Task 2; FM-13 → Task 3; FM-10 → Task 4; FM-03 → Task 5. Claude-idiom requirements (XML tags, example-first, source_text grounding, no all-caps) baked into every block + asserted by an "avoids shouty all-caps" test per block. Critical verification (shared constants, single edit covers seed + live) resolved up front.

**2. Placeholder scan** — every code/prompt step shows the exact text to insert and the exact anchor line. No TBD/TODO. Two implementer caveats (confirm `CLASSIFICATION_SYSTEM_PROMPT` export name; confirm classify route's `callAiJson` symbol/payload) are verification instructions with the expected answer stated, not placeholders.

**3. Type consistency** — no new types; only string constants and test files. Constant name `MAX_EMAIL_BODY_CHARS` and prompt export names used consistently. XML tag names match between insert step and test assertions in every task (`fleet_circular_completeness`, `market_circular_multi_item`, `role_noun_guard`, `european_decimal_rule`, `truncation_awareness`).
