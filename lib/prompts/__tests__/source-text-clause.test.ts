/**
 * Regression guard: parse-cargo and parse-vessel prompts must contain the
 * hardened source_text clause introduced in 2026-06-03 (parse-prompt-harden).
 *
 * Root cause guarded: Opus-4.8 added ellipsis ("…") into source_text fields
 * during re-parse despite "verbatim / character-for-character" wording.  The
 * fix strengthened the instruction with EXACT, CONTIGUOUS + ✓/✗ examples.
 * This test ensures the clause is never accidentally regressed by a prompt edit.
 */

import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts/parse-cargo';
import { VESSEL_POSITION_PARSER_PROMPT } from '@/lib/prompts/parse-vessel';

describe('source_text hardening clause — parse-cargo prompt', () => {
  it('contains EXACT, CONTIGUOUS instruction', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toContain('EXACT,\nCONTIGUOUS substring');
  });

  it('explicitly forbids ellipsis', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toContain('Do NOT add ellipsis');
  });

  it('explicitly forbids joining non-adjacent fragments', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toContain('Do NOT join non-adjacent fragments');
  });

  it('provides the ✗/✓ example pair', () => {
    expect(CARGO_INQUIRY_PARSER_PROMPT).toContain('loads grain (HSS)');
    expect(CARGO_INQUIRY_PARSER_PROMPT).toContain('exact contiguous substring');
  });
});

describe('source_text hardening clause — parse-vessel prompt', () => {
  it('contains EXACT, CONTIGUOUS instruction', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('EXACT,\nCONTIGUOUS substring');
  });

  it('explicitly forbids ellipsis', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('Do NOT add ellipsis');
  });

  it('explicitly forbids joining non-adjacent fragments', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('Do NOT join non-adjacent fragments');
  });

  it('provides the ✗/✓ example pair', () => {
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('loads grain (HSS)');
    expect(VESSEL_POSITION_PARSER_PROMPT).toContain('exact contiguous substring');
  });
});
