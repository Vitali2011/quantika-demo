import { getContextSnippet } from '@/components/source-quote-popover';

describe('getContextSnippet', () => {
  it('returns 3-line window around the match', () => {
    const body = 'Line 1\nLine 2\nLine 3: abt 5000 mts wheat\nLine 4\nLine 5';
    const result = getContextSnippet(body, 'abt 5000 mts wheat');
    expect(result).toContain('Line 2');
    expect(result).toContain('abt 5000 mts wheat');
    expect(result).toContain('Line 4');
    expect(result).not.toContain('Line 1');
  });

  it('returns truncated body if sourceText not found', () => {
    const body = 'short body text';
    const result = getContextSnippet(body, 'not present');
    expect(result).toBe('short body text');
  });

  it('handles empty body', () => {
    expect(getContextSnippet('', 'text')).toBe('');
  });

  it('handles empty sourceText', () => {
    expect(getContextSnippet('some body', '')).toBe('some body');
  });

  it('returns context when match is on first line', () => {
    const body = 'abt 5000 mts\nLine 2\nLine 3';
    const result = getContextSnippet(body, 'abt 5000 mts');
    expect(result).toContain('abt 5000 mts');
    expect(result).toContain('Line 2');
  });

  it('returns context when match is on last line', () => {
    const body = 'Line 1\nLine 2\nabt 5000 mts';
    const result = getContextSnippet(body, 'abt 5000 mts');
    expect(result).toContain('Line 2');
    expect(result).toContain('abt 5000 mts');
  });
});
