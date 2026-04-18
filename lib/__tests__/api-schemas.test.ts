import { DraftQuoteBodySchema, DraftReplyBodySchema } from '@/lib/api-schemas';

describe('DraftQuoteBodySchema', () => {
  it('accepts valid emailId', () => {
    const result = DraftQuoteBodySchema.safeParse({ emailId: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (missing emailId)', () => {
    const result = DraftQuoteBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty string emailId (min(1))', () => {
    const result = DraftQuoteBodySchema.safeParse({ emailId: '' });
    expect(result.success).toBe(false);
  });

  it('strips extra fields (passthrough not set)', () => {
    const result = DraftQuoteBodySchema.safeParse({ emailId: 'abc', extra: 'ignored' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});

describe('DraftReplyBodySchema', () => {
  it('accepts emailId mode', () => {
    const result = DraftReplyBodySchema.safeParse({ emailId: 'abc' });
    expect(result.success).toBe(true);
  });

  it('accepts pendingItems mode', () => {
    const result = DraftReplyBodySchema.safeParse({ pendingItems: [] });
    expect(result.success).toBe(true);
  });

  it('rejects empty object (no emailId, no pendingItems)', () => {
    const result = DraftReplyBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts pendingItems with object value', () => {
    const result = DraftReplyBodySchema.safeParse({ pendingItems: { rate: 25 } });
    expect(result.success).toBe(true);
  });

  it('rejects emailId as empty string', () => {
    const result = DraftReplyBodySchema.safeParse({ emailId: '' });
    expect(result.success).toBe(false);
  });
});
