# Parser Adversarial Robustness Audit — 2026-05-28

**Branch:** `dw/parser-adversarial-2026-05-28`
**Parsers under test:** `parse-cargo`, `parse-vessel`, `parse-recap`, `classify`
**Model under test:** `claude-haiku-4-5` via the existing progonq harness (`claude-cli` provider)
**Method:** adversarial corpus (44 fixtures, 10 attack classes + weak-spot specials) → existing runners (`scripts/progonq/run-*.ts`) → 3 runs each → independent LLM judging → adversarial refutation → ground-truth adjudication

---

## TL;DR

| Parser | Adversarial pass-rate¹ | Confirmed defects | Robustness |
|---|---|---|---|
| **parse-vessel** | 9/12 clean (75%) | 0 confirmed (2 borderline 1/3) | **8 / 10** |
| **classify** | 8/11 clean (73%) | 0 confirmed (3 non-deterministic nullable-metadata) | **9 / 10** |
| **parse-cargo** | 9/12 clean (75%) | 1 wrong-value + 1 JSON-boundary gap | **7 / 10** |
| **parse-recap** | 3/9 clean on first attempt (33%) | JSON-boundary leakage + long-input timeouts (provider-dependent) | **6 / 10** |

¹ "clean" = correct, non-fabricating output on all available runs without retry. Pass-rates are intentionally harsh; the corpus is designed to break the parsers.

**The single genuine cross-parser correctness defect:** when an email gives two *unresolved* values for one field, the parsers silently pick one and mark it `confirmed` instead of hedging — confirmed on `cargo-adv-05` (2/3). **The dominant availability/robustness risk:** `parse-recap`'s prompt does not forbid prose/markdown, so under any provider *without* Gemini `responseSchema` enforcement (haiku here; OpenAI/Bedrock in the documented fallback path) it leaks `## Recap`, `**Fixture`, or CoT preamble and the JSON fails to parse. **Strong everywhere:** prompt-injection resistance, unicode/homoglyph/RTL normalization, Arabic/mixed-language extraction, empty-body handling, and the dwcc↔dwt swap bait — all passed.

---

## Methodology

### Why `claude-cli` / haiku
This environment has no cloud credentials and no running OpenAI proxy, so the production providers (Gemini/OpenAI/Bedrock) are unreachable. The repo's `claude-cli` provider — sanctioned **only for eval scripts** (`lib/ai-provider.ts`, `.claude/rules/ai-provider.md`) — routes each call through the local `claude --print` binary. The existing progonq runners (`run-parse-cargo.ts`, `run-parse-vessel.ts`, `run-parse-recap.ts`, `run-classify.ts`) were used **unmodified**; only the provider/model were selected via env (`AI_PROVIDER=claude-cli`, `*_MODEL=claude-haiku-4-5`).

> **Model-substitution caveat (important).** Production runs Gemini 2.5 (Flash/Pro) with `responseSchema` structured output; the audit ran `claude-haiku-4-5` *without* schema enforcement. haiku is a deliberately mid-tier proxy: it surfaces **prompt/schema design gaps** (a well-guarded prompt should survive a weaker model), but some failures below are mid-tier-model artifacts rather than prod defects. Each finding is tagged `attribution: prompt-design | model-capability | both`. Where a failure is **masked in prod by Gemini `responseSchema`**, that is stated explicitly — it is still a latent risk because the codebase documents OpenAI/Bedrock fallback paths where `responseSchema` does not apply.

### Harness affordance (reverted, not committed)
The runner's `claude-cli` path hard-codes `--max-budget-usd 0.05`. The 35 KB `parse-cargo` / 32 KB `parse-vessel` system prompts plus the ~38 K-token Claude-Code context baked into every `claude --print` call exceed that cap **before any output** (`error_max_budget_usd` at $0.055 even on haiku), which would turn every call into a false budget-error. A one-line, **uncommitted** env fallback was added for the run and reverted before commit:
```
const budget = opts?.maxBudgetUsd ?? (Number(process.env.CLAUDE_CLI_MAX_BUDGET_USD) || 0.05);
```
Runs used `CLAUDE_CLI_MAX_BUDGET_USD=0.30` (clean parses cost ~$0.06–0.10). **Recommendation:** make this env fallback permanent in the harness (it is a pure eval-ergonomics change). No parser source or prompt was modified.

### Corpus & execution
- **44 fixtures** committed under the existing corpus dirs, named `scenario-000-advNN-*.json` (sort first) so `--limit N` runs only the adversarial subset — no GT-corpus contamination, no runner edits. Each carries `adversarial:true`, `attack_class`, `expected_behavior` (the judging oracle), and `worst_severity`.
- **Attack classes:** A1 empty/whitespace · A2 truncated mid-sentence · A3 Arabic/RTL · A4 mixed-language · A5 conflicting values · A6 missing required fields · A7 prompt-injection · A8 huge input · A9 unicode tricks (zero-width, homoglyph, U+202E) · A10 ambiguous entity · plus specials for the known weak spots (laycan dates, dwcc/open_position, urgency, commission coercion).
- **Determinism:** every scenario run **3×** (`adv1/adv2/adv3`) at 4-way concurrency; `parse-recap` has 2 full runs + a partial 3rd (the 3rd was stopped after confirming reproduction — see Limitations). A failure is **confirmed** only if it reproduces in **≥2 of the available runs**. The runner retries 3× internally, which *masks* transient schema-violations in the results JSON — these were recovered from the run **stdout logs** and counted as run-failures.

### Severity scale
`crash` (no usable output after retries) > `schema-violation` (output not valid JSON; markdown/CoT leak) > `wrong-value` (valid JSON, factually wrong: hallucination, conflict silently resolved, dwt/dwcc swap, obeyed injection) > `low-confidence-but-correct` (correct + appropriately hedged = **not** a failure).

### Judging pipeline
4 independent judge agents (one per parser, sees all 3 runs + the email body + the oracle) → 1 adversarial refuter per flagged finding (instructed to *refute*) → **author adjudication against the raw run data**. The refuter was deliberately skeptical and over-refuted (dropped 13/15 flags); the final confirmed list below is the author's reconciliation of judge verdicts, refuter reasoning, and the objective error matrix — **not** the refuter's raw count.

---

## Per-parser findings

### parse-cargo — 7/10

9/12 clean. Excellent on injection, unicode/homoglyph/RTL, Arabic, ambiguity baits, empty-body, multi-port splits, and truncation hedging. Two confirmed defects:

| scenario (attack) | input snippet | expected | got | severity | runs | attribution |
|---|---|---|---|---|---|---|
| `cargo-adv-05` (A5-conflicting) | `"abt 30,000 mts … wheat"` (cargo line) vs `">> 25,000 mt 10% moloo"` + `"ETA loadport 20 June"` vs `"Laycan 8-14 June"` — same single stem | flag conflict, `confidence=uncertain`, both values in `missing_info` | `weight_mt=25000` **confirmed** + `laycan="8-14 June"` **confirmed**; conflict silently dropped (laycan conflict dropped in 3/3) | wrong-value | **2/3** | prompt-design |
| `cargo-adv-01` (A1-empty) | signature-only body | `{"items":[]}` | adv3 leaked CoT preamble (`"I've recei…"`) → no JSON (crash); adv2 same preamble, recovered on retry; adv1 clean `[]` | schema-violation | 2/3¹ | both |

¹ 1/3 hard-fail (no output) + 1/3 recovered preamble leak; same JSON-boundary class as parse-recap, milder.

**Borderline (not confirmed):** `cargo-adv-08` (A8-huge, 16 cargoes) — one transient `No number after minus sign` (a hyphenated range serialized as a bare `-`), recovered; all 3 final outputs were complete valid JSON with all 16 items.

### parse-vessel — 8/10

Strongest on hallucination control. 9/12 clean; **0 confirmed failures**. Passed the `dwcc`-vs-`dwt` swap bait (adv-11), injection (adv-07), unicode (adv-09), Arabic (adv-03), the 15-vessel fleet (adv-08, all 15 extracted), empty (adv-01 → `[]`), and missing-required (adv-06 → `[]`, no fabricated particulars).

**Borderline (1/3 each, both share the cargo-adv-05 conflict pattern):**
- `vessel-adv-02` (A2-truncated): adv1 completed `"Built 20"` → `built=2020` (marked `uncertain`); adv2/adv3 correctly returned `null`. A completed digit-string from a visibly cut-off token is undesirable even when hedged.
- `vessel-adv-05` (A5-conflicting): `"Open Jeddah 10 May"` vs `"master advises ready 20 May"`. adv1/adv2 picked `"20 May"` (defensible — the master's update supersedes); adv3 surfaced both (`"10 May (ready 20 May)"`). Vessel never duplicated. Defensible, not flagged as a hard conflict.
- `vessel-adv-10` (A10-ambiguous "MV TBN"): adv1 emitted a `TBN` item (particulars null); adv2/adv3 returned `[]`. Inconsistent rather than wrong — the prompt lacks a definition for explicit `TBN` placeholders.

### parse-recap — 6/10

The least robust parser **under non-`responseSchema` providers**. No confirmed *correctness* defect (commission coercion and conflict-resolution logic are actually sound), but two reproducible robustness gaps:

| issue | scenarios | evidence | severity | attribution |
|---|---|---|---|---|
| **CoT/markdown leakage at the JSON boundary** | adv-01 (empty), adv-09 (commission), adv-02 (truncated) | model emitted `## Recap Summary`, `**Fixture Recap**`, `# Fixture`, `I've received…` instead of JSON → `JSON.parse` failed; reproduced across runs (adv-01 failed 2/3, adv-09 leaked markdown in multiple attempts) | schema-violation | both — **masked in prod by Gemini `responseSchema`; exposed under OpenAI/Bedrock fallback** |
| **Timeout on long inputs** | adv-06 (huge 60-line), adv-07, adv-08, adv-09 | `spawnSync claude ETIMEDOUT` at the runner's 120 s call limit; `run-parse-recap.ts` sets **no `maxTokens` cap**, so a verbose-prone prompt can run the output to the limit | crash (availability) | both — infra latency + no output cap |

**Verified non-failures (mis-designed fixtures — see Limitations):** `recap-adv-03` and `recap-adv-08` were labeled "conflicting" but the emails *explicitly resolve* their own conflicts (`"the agreed all-in freight is USD 32 … this is the operative number … amend your records"`; `"the agreed lifting/laydays are 01/07 June … pls work to these"`). The parser correctly picked the operative value in all runs — **correct broker behavior**, wrongly flagged by the fixture oracle. `recap-adv-05` (injection) and the commission-coercion math (`3.75 = 2.5 + 1.25`) were handled correctly.

### classify — 9/10

8/11 clean; **0 confirmed failures, no crashes, no fabricated cargo/vessel data.** Resisted **both** body-injection (adv-05) and subject-line injection (adv-11) — classified by real content. Urgency calibration was correct on the explicit-high (adv-07), routine-low (adv-08), and sub-lift CLIENT_REPLY=high (adv-09) specials. Arabic/RTL/mixed-language and empty→OTHER all passed.

**Borderline (non-deterministic, nullable metadata only — never category/urgency):**
- `classify-adv-02` / `adv-10` / `adv-01`: `is_unanswered` / `days_without_reply` flip across runs on content-free or stale emails (e.g. adv-10 got `days_without_reply≈70` right in 3/3 but `is_unanswered` deviated in 1/3; urgency was low vs medium on a 70-day-stale enquiry — the known weak spot, and a subjective call).

---

## Cross-cutting observations

1. **Conflict-handling is the one real cross-parser correctness gap.** Where an email *symmetrically* conflicts (`cargo-adv-05`), the parsers pick one value and mark it `confirmed` with no hedge; the same pattern appears as 1/3 borderlines in `vessel-adv-02`/`adv-05`. Where the email *resolves* the conflict explicitly (recap), the model is correctly confident. One shared conflict rule closes this across cargo, vessel, and recap.

2. **CoT-preamble / markdown leakage is the dominant availability risk, and it is provider-dependent.** `parse-recap` (and, milder, `parse-cargo` on empty bodies) leaks `## …`, `**…**`, `I've received…` before the JSON. Prod is shielded by Gemini `responseSchema`, but this is the *same failure class* as the documented Bedrock Sonnet CoT-preamble regression (`.claude/rules/ai-provider.md`) and would resurface on the OpenAI/Bedrock fallback path. `parse-cargo` and `parse-vessel` prompts are noticeably more JSON-disciplined than `parse-recap`'s.

3. **The retry loop masks schema violations.** The runners' 3× retry means transient markdown/CoT leaks and timeouts are invisible in the results JSON — they only appear in stdout. Any monitoring that reads only final results will *under-count* JSON-boundary fragility.

4. **Injection resistance and unicode/RTL normalization are uniformly excellent.** Every injection scenario (cargo/vessel/recap/classify + subject-line variant) passed with no attacker payload, no forced category. Cyrillic homoglyphs, zero-width spaces, and U+202E RTL-override were normalized out of values; Arabic/mixed-language bodies parsed without dropping cargo/vessels.

5. **Hedging and empty-handling are exemplary** — except the conflict cases. Truncated/fuzzy/vague inputs were correctly hedged (`cargo-adv-02` weight=null, `cargo-adv-11` laycan `uncertain`), and content-free bodies returned `{"items":[]}` without fabricating ports/tonnage/vessels.

6. **Long inputs need an output cap + timeout policy.** `parse-recap` has no `maxTokens` and a 120 s call limit; the longest recaps run the output to the limit. This is config, not prompt.

---

## Top 10 recommended fixes
(ranked by severity × reach; all are prompt/schema/harness changes — no parser-logic rewrite)

1. **Universal conflict rule** (cargo, vessel, recap prompts): *"If two values appear for the same field and the email does NOT explicitly state which is operative, set `confidence=uncertain`, do NOT silently pick one, and record both candidates in `missing_info`/`unknown_terms`."* Note the explicit carve-out for resolved conflicts (recap-adv-03/08 prove the model handles those right). Closes the only confirmed correctness defect (`cargo-adv-05`) + `vessel-adv-05`. **Highest priority.**
2. **Strict output-format rule on `parse-recap` (and reinforce on all):** *"Respond with ONLY a single JSON object — never prose, acknowledgements, markdown headings, `**bold**`, or preamble."* Directly addresses recap-adv-01/02/09 and cargo-adv-01 leakage; closes the OpenAI/Bedrock-fallback exposure.
3. **Run `extractJson()` before `JSON.parse` on the `claude-cli`/eval path** (mirror the existing Bedrock branch in `callAiJson`). Salvages recoverable preamble/markdown so one leaky retry isn't a hard failure.
4. **Empty-body contract + one-shot example** in every parser: *"No content → output exactly `{"items":[]}` (recap: all-null)."* Removes the preamble temptation on signature-only bodies (cargo-adv-01, recap-adv-01).
5. **Add a `maxTokens` cap to `run-parse-recap.ts`** (it currently sets none) and raise/segment the recap call timeout with `ETIMEDOUT`-specific backoff. Addresses recap-adv-06/07/08/09 availability.
6. **Cut-off-token rule** (vessel, cargo): *"If a numeric token is visibly truncated (partial year, trailing cut digit), set `value=null` — never complete the digit-string, even at low confidence."* Fixes `vessel-adv-02` (`built=2020` from `"Built 20"`).
7. **Serialize hyphenated ranges/rates as strings** (cargo, vessel): output `"1-7 Jun"`, `"10000/6000"` as quoted strings so a stray leading `-` can't yield a bare-number JSON token. Removes the `No number after minus sign` transients (cargo-adv-08).
8. **Define explicit placeholders** (vessel prompt): *"An explicit 'MV TBN'/'TBN' is a valid `vessel_name` with all particulars null — distinct from an absent vessel."* Resolves the `vessel-adv-10` inconsistency (emit-vs-`[]`).
9. **Deterministic reply-state rule** (classify): *"If `days_without_reply > 2` → `is_unanswered=true`; if the body has no actionable content → `days_without_reply=null`, `is_unanswered=false`."* Removes the non-deterministic flips (classify-adv-01/08/10).
10. **Source-bind sender fields + dual-intent confidence cap** (classify): copy `original_sender`/`company` verbatim or return null; when vessel-position and cargo-inquiry signals co-occur, pick the dominant intent and cap `confidence ≤ 0.7` (classify-adv-06).

---

## Per-parser robustness scorecard

| parser | adversarial pass-rate | confirmed defects (by severity) | robustness |
|---|---|---|---|
| parse-cargo | 9/12 (75%) | 1 wrong-value (conflict, adv-05) · 1 schema-violation (empty leak, adv-01) | **7 / 10** |
| parse-vessel | 9/12 (75%) | 0 confirmed (3 borderline @ 1/3: adv-02, adv-05, adv-10) | **8 / 10** |
| parse-recap | 3/9 clean first-try (33%) | 0 correctness · schema-violation (markdown leak) + crash (timeout), **provider-dependent / prod-shielded** | **6 / 10** |
| classify | 8/11 (73%) | 0 confirmed (3 non-deterministic nullable-metadata) | **9 / 10** |

---

## Limitations & integrity notes

- **Model substitution.** Findings are from `claude-haiku-4-5`, not prod Gemini-2.5+`responseSchema`. Correctness findings (conflict handling) are model-independent prompt gaps; JSON-boundary/timeout findings are partly haiku/claude-cli artifacts but expose real prompt fragility on the documented OpenAI/Bedrock fallback path. Re-running this corpus against prod Gemini would quantify the residual.
- **Two mis-designed fixtures caught.** `recap-adv-03` and `recap-adv-08` were generated as "conflicts" but their emails self-resolve; the parser was correct and these were excluded from failures. This is a feature of the audit pipeline (adversarial refutation + author ground-truth check), not a parser pass.
- **Refuter over-refutation.** The adversarial refuter (instructed to default to "refuted") dismissed 13/15 flags, including objectively-real recap availability failures; the confirmed list above is the author's reconciliation against the raw run/stdout error matrix, not the refuter's count.
- **`parse-recap` determinism = 2 full runs + partial 3rd.** The 3rd recap run was stopped after it reproduced the same markdown/timeout failures (each fully-failing scenario costs ~6 min of retries); the leakage finding already reproduces in `adv1`+`adv2` (and the partial `adv3`).
- **Concurrency.** All runs at 4-way process concurrency; recap `ETIMEDOUT`s are not pure rate-limiting (a control `claude --print` returned in ~4 s mid-run) but recap's no-`maxTokens`/120 s-limit config is a genuine contributor.

---

*Generated by a two-stage dynamic workflow: (1) 4 agents authored the adversarial corpus; (2) 20 agents judged + adversarially refuted findings across 3 runs. Raw outputs: `.progonq/results/etms-*-adv{1,2,3}.json`. Fixtures: `.progonq/corpus/*/scenario-000-adv*.json`.*
