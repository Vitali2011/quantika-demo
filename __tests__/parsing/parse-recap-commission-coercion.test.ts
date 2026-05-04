/**
 * Tests for commission_currency coercion in parseRecapAIResponse.
 *
 * Root cause (N4): LLM sometimes returns commission_currency as a
 * ConfidenceField object { value: "USD", confidence: "confirmed" } instead of
 * a plain string, causing "[object Object]" on the dashboard.
 *
 * These tests exercise the public API parseRecapAIResponse to verify that
 * commissionCurrency is always coerced to string | null.
 */

import { parseRecapAIResponse } from '@/lib/parsing/parse-recap-helpers';

function buildRaw(commissionCurrency: unknown): string {
  return JSON.stringify({
    vessel_name: 'MV TEST',
    commission_currency: commissionCurrency,
  });
}

describe('parseRecapAIResponse — commission_currency coercion', () => {
  it('coerces ConfidenceField object {value, confidence} to the string value', () => {
    const raw = buildRaw({ value: 'USD', confidence: 'confirmed' });
    const recap = parseRecapAIResponse(raw, 'email-001');
    expect(recap.commissionCurrency).toBe('USD');
    expect(typeof recap.commissionCurrency).toBe('string');
  });

  it('returns null when commission_currency is null', () => {
    const raw = buildRaw(null);
    const recap = parseRecapAIResponse(raw, 'email-002');
    expect(recap.commissionCurrency).toBeNull();
  });

  it('passes through an already-string value unchanged', () => {
    const raw = buildRaw('EUR');
    const recap = parseRecapAIResponse(raw, 'email-003');
    expect(recap.commissionCurrency).toBe('EUR');
  });

  it('returns null for a malformed object without a value key', () => {
    const raw = buildRaw({ foo: 'bar' });
    const recap = parseRecapAIResponse(raw, 'email-004');
    expect(recap.commissionCurrency).toBeNull();
  });

  it('returns null when commission_currency is undefined (key absent)', () => {
    const raw = JSON.stringify({ vessel_name: 'MV TEST' });
    const recap = parseRecapAIResponse(raw, 'email-005');
    expect(recap.commissionCurrency).toBeNull();
  });

  it('returns null for a numeric value (defensive: unexpected type)', () => {
    const raw = buildRaw(42);
    const recap = parseRecapAIResponse(raw, 'email-006');
    expect(recap.commissionCurrency).toBeNull();
  });
});
