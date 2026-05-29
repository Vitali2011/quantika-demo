/**
 * Tests for U2 (issue 663 + 674): AI-provider abort/timeout threading + caching.
 *
 * Covers the Phase-0 findings:
 *  - callGeminiText threads abortSignal + timeoutMs (was dropped).
 *  - callBedrockText threads abortSignal + requestTimeout (both were dropped).
 *  - Bedrock system block carries cache_control (MATCH_PROMPT prefix caching).
 *  - A hung gemini/bedrock call rejects with LLMTimeoutError (previously dead
 *    code on those providers).
 *  - A caller-supplied signal that is already aborted cancels the call.
 *
 * All providers are MOCKED — no real network.
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

// ── Mock providers ───────────────────────────────────────────────────────────

jest.mock('@/lib/openai', () => {
  const ActualErr = jest.requireActual('@/lib/openai').LLMTimeoutError;
  return {
    callAiJson: jest.fn().mockResolvedValue({ result: 'openai-json' }),
    callAiText: jest.fn().mockResolvedValue('openai-text'),
    LLMTimeoutError: ActualErr,
  };
});

const mockGeminiGenerate = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGeminiGenerate },
  })),
}), { virtual: true });

const mockBedrockSend = jest.fn();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation((opts: unknown) => ({
    __ctorOpts: opts,
    send: mockBedrockSend,
  })),
  InvokeModelCommand: jest.fn().mockImplementation((opts: unknown) => opts),
}), { virtual: true });

let testDb: Database.Database;
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: jest.fn(() => testDb) })),
}));

jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const GEMINI_ENV = {
  AI_PROVIDER: 'gemini',
  GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
  GOOGLE_CLOUD_PROJECT: 'test-project',
  AI_MODEL_GEMINI_DEFAULT: 'gemini-2.5-flash',
};

const BEDROCK_ENV = {
  AI_PROVIDER: 'bedrock',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'k',
  AWS_SECRET_ACCESS_KEY: 's',
  BEDROCK_MODEL_ID: 'anthropic.claude-opus-4-7',
};

function clearEnv(): void {
  const keys = [
    'AI_PROVIDER', 'MATCH_PROVIDER',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION',
    'AI_MODEL_GEMINI_DEFAULT',
    'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BEDROCK_MODEL_ID',
  ];
  for (const k of keys) delete process.env[k];
}

beforeEach(() => {
  testDb = new Database(':memory:');
  runMigrations(testDb, allMigrations);
  clearEnv();
  jest.clearAllMocks();
  const sessionStore = require('@/lib/session-store');
  (sessionStore.getStore as jest.Mock).mockReturnValue({ getDatabase: jest.fn(() => testDb) });
  // Sensible default resolutions
  mockGeminiGenerate.mockResolvedValue({ text: '{"ok":true}' });
  mockBedrockSend.mockResolvedValue({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ text: '{"ok":true}' }] })),
  });
});

afterEach(() => testDb.close());

// ── Gemini: abortSignal + timeoutMs ─────────────────────────────────────────

describe('callGeminiText threads abortSignal + timeoutMs', () => {
  it('passes an AbortSignal into the Gemini generateContent config', async () => {
    setEnv(GEMINI_ENV);
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('classify', 'sys', 'user', { timeoutMs: 5000 });

    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    const cfg = mockGeminiGenerate.mock.calls[0][0].config;
    expect(cfg.abortSignal).toBeInstanceOf(AbortSignal);
    expect(cfg.abortSignal.aborted).toBe(false);
  });

  it('aborts the Gemini signal when the caller-supplied signal is already aborted', async () => {
    setEnv(GEMINI_ENV);
    const { callAiText } = require('@/lib/ai-provider');
    const ac = new AbortController();
    ac.abort();
    await callAiText('classify', 'sys', 'user', { signal: ac.signal });

    const cfg = mockGeminiGenerate.mock.calls[0][0].config;
    expect(cfg.abortSignal.aborted).toBe(true);
  });

  it('rejects with LLMTimeoutError when the Gemini call never resolves within timeoutMs', async () => {
    setEnv(GEMINI_ENV);
    // Never-resolving generateContent → the internal timeout must fire.
    mockGeminiGenerate.mockImplementation(() => new Promise(() => {}));
    const { callAiText } = require('@/lib/ai-provider');
    const { LLMTimeoutError } = require('@/lib/openai');
    await expect(callAiText('classify', 'sys', 'user', { timeoutMs: 20 })).rejects.toBeInstanceOf(
      LLMTimeoutError,
    );
  });
});

// ── Bedrock: abortSignal + requestTimeout + cache_control ────────────────────

describe('callBedrockText threads abortSignal + requestTimeout', () => {
  it('passes { abortSignal } as the 2nd arg to client.send', async () => {
    setEnv(BEDROCK_ENV);
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('match', 'sys', 'user', { timeoutMs: 5000 });

    expect(mockBedrockSend).toHaveBeenCalledTimes(1);
    const sendOpts = mockBedrockSend.mock.calls[0][1];
    expect(sendOpts).toBeDefined();
    expect(sendOpts.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('sets requestHandler.requestTimeout from timeoutMs on the Bedrock client', async () => {
    setEnv(BEDROCK_ENV);
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('match', 'sys', 'user', { timeoutMs: 7777 });

    const ctorOpts = (BedrockRuntimeClient as jest.Mock).mock.calls[0][0];
    expect(ctorOpts.requestHandler?.requestTimeout).toBe(7777);
  });

  it('marks the system block with cache_control ephemeral (MATCH prefix caching)', async () => {
    setEnv(BEDROCK_ENV);
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('match', 'STATIC-MATCH-PREFIX', 'user', {});

    // InvokeModelCommand receives the JSON-stringified payload as body.
    const cmdArg = mockBedrockSend.mock.calls[0][0];
    const payload = JSON.parse(cmdArg.body);
    expect(Array.isArray(payload.system)).toBe(true);
    expect(payload.system[0].text).toBe('STATIC-MATCH-PREFIX');
    expect(payload.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('rejects with LLMTimeoutError when an aborted caller signal cancels the Bedrock call', async () => {
    setEnv(BEDROCK_ENV);
    // Simulate the SDK throwing an AbortError once the signal is aborted.
    mockBedrockSend.mockImplementation((_cmd: unknown, opts?: { abortSignal?: AbortSignal }) => {
      if (opts?.abortSignal?.aborted) {
        const e = new Error('Request aborted');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
      return Promise.resolve({
        body: new TextEncoder().encode(JSON.stringify({ content: [{ text: '{}' }] })),
      });
    });
    const ac = new AbortController();
    ac.abort();
    const { callAiText } = require('@/lib/ai-provider');
    const { LLMTimeoutError } = require('@/lib/openai');
    await expect(callAiText('match', 'sys', 'user', { signal: ac.signal })).rejects.toBeInstanceOf(
      LLMTimeoutError,
    );
  });
});
