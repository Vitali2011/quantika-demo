/**
 * Snapshot guard for the parse-cargo prompt (#791 cause C).
 *
 * Prompt-text tests are intentionally narrow: they only protect the WIRING of
 * structural rules into the prompt. They do not assert LLM behavior — that is
 * covered by the corpus re-parse (scripts/eval/reparse-cargo-corpus.ts) under
 * parity validation.
 */
import { CARGO_INQUIRY_PARSER_PROMPT } from '../parse-cargo';

describe('CARGO_INQUIRY_PARSER_PROMPT contains piece-aggregate rule (#791 cause C)', () => {
  it('includes PIECE-AGGREGATE RULE for project / break-bulk cargo', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/PIECE-AGGREGATE RULE/);
  });

  it('includes the canonical 15,000 kg + 9,000 kg derivation example', () => {
    // The Marmara/Veracruz storage-tanks fixture (emailId 19d5de87705baf9b/0)
    // sums to 186 MT — the example the LLM must mirror.
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/15,000 kg/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/9,000 kg/);
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/186 MT/);
  });

  it('specifies the kg → MT unit conversion (divide by 1000)', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/Convert kg to metric tons \(÷1000\)/);
  });

  it('writes confidence=interpreted for derived aggregates (not confirmed)', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/confidence='interpreted'/);
  });

  it('preserves the existing RANGE RULE', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/RANGE RULE/);
  });

  it('preserves the existing MOLOO RULE', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/MOLOO RULE/);
  });

  it('does NOT apply piece-aggregate to BULK cargo (guard against fabrication)', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toMatch(/the cargo is BULK \(per-piece weight doesn't apply\)/);
  });
});
