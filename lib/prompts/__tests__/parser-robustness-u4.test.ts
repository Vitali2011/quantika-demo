/**
 * U4 (#675) — Parser robustness prompt-design guards.
 *
 * Source: docs/audits/2026-05-28-parser-adversarial-audit.md (Top-10 #1, #2).
 *
 * These tests assert the *content* of the exported prompt constants that the
 * route handlers feed verbatim to the LLM. They are NOT source-text grep over a
 * handler file — they import the actual constant the production route consumes
 * (app/api/ai/parse-recap/route.ts imports FIXTURE_RECAP_PARSER_PROMPT; the
 * progonq + parse-cargo paths import CARGO_INQUIRY_PARSER_PROMPT). A prompt is a
 * pure data artifact; its wording IS the unit under test for a prompt-design fix.
 *
 * Scope separation (per U4 caveat): these guard PROMPT DESIGN only. They do NOT
 * assert model behavior — prod Gemini is additionally shielded by responseSchema
 * (parse-recap/route.ts:59). The gap these close is the OpenAI/Bedrock fallback
 * path where responseSchema is ignored (U2 capability matrix), so the prompt
 * wording is the only defense against prose/markdown/CoT leakage and silent
 * conflict resolution.
 */

import { FIXTURE_RECAP_PARSER_PROMPT } from '@/lib/prompts/parse-recap';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts/parse-cargo';

describe('U4 parse-recap prompt — strict JSON-only output rule (audit Top-10 #2)', () => {
  const p = FIXTURE_RECAP_PARSER_PROMPT.toLowerCase();

  it('forbids prose / acknowledgement preamble', () => {
    // Must instruct the model to emit ONLY JSON — no "I've received…" preamble.
    expect(p).toContain('only a single json object');
  });

  it('forbids markdown headings and bold (the ## Recap / **Fixture leak)', () => {
    expect(p).toMatch(/never[^.]*\bmarkdown\b/);
    // Explicitly names the heading + bold artifacts the audit observed.
    expect(p).toContain('heading');
  });

  it('the JSON-only rule is reinforced as the final instruction', () => {
    // A trailing "Output: JSON object with all fields above." alone is NOT
    // sufficient (that text predates this fix). The strict rule must be present
    // and explicitly negative ("never prose").
    expect(p).toContain('never prose');
  });
});

describe('U4 parse-cargo prompt — universal conflict / hedge rule (audit Top-10 #1, cargo-adv-05)', () => {
  const p = CARGO_INQUIRY_PARSER_PROMPT;
  const lower = p.toLowerCase();

  it('has a dedicated conflicting-values rule', () => {
    // Pre-fix grep for conflict|two values|operative|both candidates returned ZERO.
    expect(lower).toMatch(/conflict/);
  });

  it('instructs uncertain confidence (not confirmed) on two unresolved values', () => {
    expect(lower).toContain('uncertain');
    // The rule must tie the conflict to a confidence downgrade, not a silent pick.
    expect(lower).toMatch(/(?:do not|must not|never) silently pick/);
  });

  it('requires recording both candidates in missing_info', () => {
    expect(lower).toMatch(/both (candidate|value)/);
    expect(lower).toContain('missing_info');
  });

  it('carves out the resolved-conflict case (operative value)', () => {
    // recap-adv-03/08 prove the model should stay confident when the email
    // explicitly states which value is operative — the rule must NOT over-hedge.
    expect(lower).toContain('operative');
  });
});

describe('parse-cargo prompt — Group B cargo-data-truth rules (#1021 #1023)', () => {
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
  it('teaches vessel-DWT range extraction', () => {
    const p = CARGO_INQUIRY_PARSER_PROMPT;
    expect(p).toMatch(/min_vessel_dwt_mt/);
    expect(p).toMatch(/max_vessel_dwt_mt/);
    expect(p).toMatch(/12,?000\s*-\s*14,?000\s*dwt/i);   // GRAIN TRADER P example
  });
});
