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
