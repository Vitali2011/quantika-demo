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
