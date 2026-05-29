/**
 * BUG-2 (MEDIUM) — callBedrockText must NOT attach an Anthropic prompt-caching
 * breakpoint (cache_control: ephemeral) on tiny system prompts. The breakpoint is
 * only worthwhile for the large static MATCH prefix (~28k chars); on a short prompt
 * it is wasted/over-applied (below Bedrock's ~1024-token cacheable minimum).
 *
 * The payload's system field is built by the pure helper buildBedrockSystemField,
 * so we assert its shape directly — no AWS call.
 */
import { buildBedrockSystemField, CACHE_MIN_CHARS } from '@/lib/ai-provider';

function hasCacheControl(field: unknown): boolean {
  return Array.isArray(field) && field.some((b) => b && (b as { cache_control?: unknown }).cache_control);
}

describe('buildBedrockSystemField — gate cache_control by prefix size (BUG-2)', () => {
  it('attaches NO cache_control on a short system prompt', () => {
    const field = buildBedrockSystemField('hi');
    expect(hasCacheControl(field)).toBe(false);
  });

  it('sends the short prompt as a plain string (text is preserved)', () => {
    expect(buildBedrockSystemField('hi')).toBe('hi');
  });

  it('attaches cache_control on a system prompt at/above CACHE_MIN_CHARS', () => {
    const big = 'x'.repeat(CACHE_MIN_CHARS);
    const field = buildBedrockSystemField(big);
    expect(hasCacheControl(field)).toBe(true);
    // text is preserved verbatim in the cached block
    expect((field as Array<{ text: string }>)[0].text).toBe(big);
  });

  it('CACHE_MIN_CHARS is conservatively above the ~1024-token Bedrock minimum', () => {
    // ~3-4 chars/token → 4000 chars comfortably exceeds 1024 tokens.
    expect(CACHE_MIN_CHARS).toBeGreaterThanOrEqual(4000);
  });
});
