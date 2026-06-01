/**
 * Regression: parseVesselAIResponse must strip non-string entries from restrictions
 * when LLM returns objects or numbers instead of strings.
 *
 * Hotfix: fix(match): guard non-string restrictions — PR #hotfix
 */
import { parseVesselAIResponse } from '@/lib/parsing/parse-vessel-helpers';

// parse-vessel-helpers reads no external I/O — no mocks needed
describe('parseVesselAIResponse — non-string restrictions filter', () => {
  const emailId = 'test-email-id';

  function parse(restrictions: unknown) {
    const raw = JSON.stringify({
      vessel_name: 'MV Test',
      imo: '1234567',
      restrictions,
    });
    return parseVesselAIResponse(raw, emailId);
  }

  it('returns only strings when restrictions contains objects and numbers', () => {
    const vessels = parse([{ x: 1 }, 123, 'no grain']);
    expect(vessels).toHaveLength(1);
    expect(vessels[0].restrictions).toEqual(['no grain']);
  });

  it('returns empty array when all restrictions are non-strings', () => {
    const vessels = parse([{ type: 'ban' }, 42, true, null]);
    expect(vessels[0].restrictions).toEqual([]);
  });

  it('returns all strings when all restrictions are strings', () => {
    const vessels = parse(['no grain', 'max DWT 60000']);
    expect(vessels[0].restrictions).toEqual(['no grain', 'max DWT 60000']);
  });

  it('returns empty array when restrictions is not an array', () => {
    const vessels = parse('not an array');
    expect(vessels[0].restrictions).toEqual([]);
  });

  it('returns empty array when restrictions is null', () => {
    const vessels = parse(null);
    expect(vessels[0].restrictions).toEqual([]);
  });

  it('mixed array: [{x:1}, 123, "no grain"] → only ["no grain"]', () => {
    const vessels = parse([{ x: 1 }, 123, 'no grain']);
    expect(vessels[0].restrictions).toHaveLength(1);
    expect(vessels[0].restrictions[0]).toBe('no grain');
  });
});
