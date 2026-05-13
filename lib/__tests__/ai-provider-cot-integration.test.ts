/**
 * Integration test: callAiJson handles Bedrock CoT preamble end-to-end.
 *
 * Validates the actual MATCH endpoint code path through callAiJson with
 * provider=bedrock — uses the same Bedrock SDK mock pattern as ai-provider.test.ts,
 * but configures the mocked response to include a CoT preamble like real
 * Sonnet 4.6 emits in production.
 *
 * Pre-fix: this test would fail with `Unexpected token 'I', "I'll syste"...`.
 * Post-fix: extractJson() strips preamble before JSON.parse.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// We control the Bedrock response body per test via mockSend.mockResolvedValueOnce.
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeModelCommand: jest.fn().mockImplementation((opts: unknown) => opts),
}), { virtual: true });

// Stub openai/gemini so they don't get hit.
jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
  callAiText: jest.fn(),
  LLMTimeoutError: class LLMTimeoutError extends Error {},
}));

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
}), { virtual: true });

// Route audit writes to in-memory DB so writeAuditRecord doesn't blow up.
let testDb: Database.Database;
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => testDb),
  })),
}));

jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setBedrockEnv(): void {
  process.env.AI_PROVIDER = 'bedrock';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
  process.env.BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-6';
}

function clearBedrockEnv(): void {
  for (const k of [
    'AI_PROVIDER', 'MATCH_PROVIDER', 'AWS_REGION', 'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY', 'BEDROCK_MODEL_ID',
  ]) {
    delete process.env[k];
  }
}

function mockBedrockReply(text: string): void {
  mockSend.mockResolvedValueOnce({
    body: new TextEncoder().encode(
      JSON.stringify({
        content: [{ text }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  testDb = new Database(':memory:');
  runMigrations(testDb, allMigrations);
  clearBedrockEnv();
  setBedrockEnv();
  jest.clearAllMocks();
});

afterEach(() => {
  testDb.close();
  clearBedrockEnv();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('callAiJson (bedrock) — CoT preamble handling', () => {
  it('parses JSON when Bedrock prepends CoT preamble (MATCH-style)', async () => {
    const { callAiJson } = require('@/lib/ai-provider') as typeof import('@/lib/ai-provider');

    // This is the exact failure signature from production ai_audit (2026-05-13):
    // 9/10 MATCH calls failed with "Unexpected token 'I', \"I'll syste\"..."
    mockBedrockReply(
      "I'll systematically work through this match request.\n\n" +
        'Looking at the cargo and vessel data, here is my analysis:\n\n' +
        '{"matches":[{"cargoId":"c1","vesselId":"v1","score":0.92}]}',
    );

    const result = await callAiJson<{ matches: Array<{ score: number }> }>(
      'MATCH',
      'system prompt',
      'user prompt',
    );

    expect(result).toEqual({
      matches: [{ cargoId: 'c1', vesselId: 'v1', score: 0.92 }],
    });
  });

  it('parses JSON when response is wrapped in markdown fence', async () => {
    const { callAiJson } = require('@/lib/ai-provider') as typeof import('@/lib/ai-provider');
    mockBedrockReply('```json\n{"ok":true,"items":[1,2,3]}\n```');

    const result = await callAiJson<{ ok: boolean; items: number[] }>(
      'MATCH',
      'sys',
      'user',
    );

    expect(result).toEqual({ ok: true, items: [1, 2, 3] });
  });

  it('parses clean JSON unchanged (no regression for well-formed output)', async () => {
    const { callAiJson } = require('@/lib/ai-provider') as typeof import('@/lib/ai-provider');
    mockBedrockReply('{"matches":[]}');

    const result = await callAiJson<{ matches: unknown[] }>('MATCH', 'sys', 'user');
    expect(result).toEqual({ matches: [] });
  });

  it('audits ok=true when CoT preamble is stripped successfully', async () => {
    const { callAiJson } = require('@/lib/ai-provider') as typeof import('@/lib/ai-provider');
    mockBedrockReply("Let me think.\n\n{\"x\":1}");

    await callAiJson<{ x: number }>('MATCH', 'sys', 'user');

    const row = testDb
      .prepare('SELECT ok, err, scope FROM ai_audit ORDER BY id DESC LIMIT 1')
      .get() as { ok: number; err: string | null; scope: string } | undefined;
    expect(row?.ok).toBe(1);
    expect(row?.err).toBeNull();
    expect(row?.scope).toBe('MATCH');
  });
});
