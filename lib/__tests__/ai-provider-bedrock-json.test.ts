/**
 * Unit tests for extractJson — Bedrock JSON extraction.
 *
 * Context: Bedrock Claude Sonnet 4.6 returns chain-of-thought preamble
 * ("I'll systematically work through this...") before JSON, breaking
 * naive JSON.parse on raw response. This helper strips preamble,
 * markdown fences, trailing junk and balances braces to find clean JSON.
 *
 * Refs: Task 3.2-FIX-1 Phase B1 (acceleration plan), ai_audit MATCH 9/10 fails 24h.
 */
import { describe, it, expect } from '@jest/globals';
import { extractJson } from '@/lib/ai-provider';

describe('extractJson — Bedrock JSON extraction', () => {
  it('extracts JSON from CoT preamble', () => {
    const raw = "I'll systematically analyze this match.\n\n{\"matches\":[]}";
    expect(extractJson(raw)).toBe('{"matches":[]}');
  });

  it('extracts array JSON from preamble', () => {
    const raw = "I'll work through these:\n\n[{\"id\":1}]";
    expect(extractJson(raw)).toBe('[{"id":1}]');
  });

  it('handles markdown fence (json)', () => {
    const raw = '```json\n{"matches":[]}\n```';
    expect(extractJson(raw)).toBe('{"matches":[]}');
  });

  it('handles markdown fence (plain)', () => {
    const raw = '```\n{"x":1}\n```';
    expect(extractJson(raw)).toBe('{"x":1}');
  });

  it('returns JSON unchanged if no preamble', () => {
    const raw = '{"matches":[{"id":1}]}';
    expect(extractJson(raw)).toBe('{"matches":[{"id":1}]}');
  });

  it('strips trailing junk after JSON', () => {
    const raw = '{"x":1}\n\nThat\'s my analysis.';
    expect(extractJson(raw)).toBe('{"x":1}');
  });

  it('throws if no JSON found at all', () => {
    expect(() => extractJson('just text, no json here')).toThrow();
  });

  it('handles nested objects/arrays correctly', () => {
    const raw = "Preamble.\n\n{\"a\":{\"b\":[1,2,{\"c\":3}]}}";
    expect(JSON.parse(extractJson(raw))).toEqual({ a: { b: [1, 2, { c: 3 }] } });
  });

  it('handles strings containing braces inside JSON', () => {
    const raw = 'Analysis:\n\n{"note":"contains } closing brace","ok":true}';
    expect(JSON.parse(extractJson(raw))).toEqual({
      note: 'contains } closing brace',
      ok: true,
    });
  });

  it('handles escaped quotes in strings', () => {
    const raw = '{"msg":"he said \\"hi\\""}';
    expect(JSON.parse(extractJson(raw))).toEqual({ msg: 'he said "hi"' });
  });

  it('handles markdown fence with preamble inside', () => {
    // Edge case: model wraps CoT inside the fence
    const raw = "Sure, here you go:\n```json\n{\"x\":1}\n```\nDone!";
    expect(extractJson(raw)).toBe('{"x":1}');
  });

  it('throws on empty input', () => {
    expect(() => extractJson('')).toThrow();
  });

  it('throws on non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(() => extractJson(null)).toThrow();
  });

  it('picks earliest of { or [ as start', () => {
    const raw = 'before [1,2,3] then {"x":1} done';
    // First JSON token is [, balanced array ends at ]
    expect(extractJson(raw)).toBe('[1,2,3]');
  });
});
