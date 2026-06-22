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
