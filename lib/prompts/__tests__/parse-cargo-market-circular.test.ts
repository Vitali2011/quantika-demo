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
