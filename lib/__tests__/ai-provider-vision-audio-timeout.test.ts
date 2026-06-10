/**
 * Tests for H6: callAiVision and callAiAudio must honor timeoutMs + signal from AiOpts.
 *
 * Before this fix, callGeminiVision, the bedrock branch in callAiVision,
 * callBedrockAudio, and the gemini branch in callAiAudio constructed SDK clients
 * with NO buildAbortController / requestTimeout / abortSignal / Promise.race.
 * A hung Vertex or Bedrock call would hang forever up to platform maxDuration.
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

const FAKE_IMAGE = { data: 'aGVsbG8=', mimeType: 'image/jpeg' };
const FAKE_AUDIO = Buffer.from('audio-data');

function clearEnv(): void {
  const keys = [
    'AI_PROVIDER',
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
  mockGeminiGenerate.mockResolvedValue({ text: 'result text' });
  mockBedrockSend.mockResolvedValue({
    body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'result' }] })),
  });
});

afterEach(() => testDb.close());

// ── callAiVision (Gemini) ────────────────────────────────────────────────────

describe('callAiVision (gemini) threads abortSignal + timeoutMs', () => {
  it('passes an AbortSignal into the Gemini generateContent config', async () => {
    setEnv(GEMINI_ENV);
    const { callAiVision } = require('@/lib/ai-provider');
    await callAiVision('whatsapp_ocr', 'describe image', [FAKE_IMAGE], { timeoutMs: 5000 });

    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    const cfg = mockGeminiGenerate.mock.calls[0][0].config;
    expect(cfg.abortSignal).toBeInstanceOf(AbortSignal);
    expect(cfg.abortSignal.aborted).toBe(false);
  });

  it('rejects with LLMTimeoutError when Gemini vision call never resolves within timeoutMs', async () => {
    setEnv(GEMINI_ENV);
    mockGeminiGenerate.mockImplementation(() => new Promise(() => {}));
    const { callAiVision } = require('@/lib/ai-provider');
    const { LLMTimeoutError } = require('@/lib/openai');
    await expect(
      callAiVision('whatsapp_ocr', 'describe image', [FAKE_IMAGE], { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
  });
});

// ── callAiVision (Bedrock) ───────────────────────────────────────────────────

describe('callAiVision (bedrock) threads abortSignal + requestTimeout', () => {
  it('passes { abortSignal } as the 2nd arg to client.send', async () => {
    setEnv(BEDROCK_ENV);
    const { callAiVision } = require('@/lib/ai-provider');
    await callAiVision('whatsapp_ocr', 'describe image', [FAKE_IMAGE], { timeoutMs: 5000 });

    expect(mockBedrockSend).toHaveBeenCalledTimes(1);
    const sendOpts = mockBedrockSend.mock.calls[0][1];
    expect(sendOpts).toBeDefined();
    expect(sendOpts.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('sets requestHandler.requestTimeout from timeoutMs on the Bedrock vision client', async () => {
    setEnv(BEDROCK_ENV);
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    const { callAiVision } = require('@/lib/ai-provider');
    await callAiVision('whatsapp_ocr', 'describe image', [FAKE_IMAGE], { timeoutMs: 9999 });

    const ctorOpts = (BedrockRuntimeClient as jest.Mock).mock.calls[0][0];
    expect(ctorOpts.requestHandler?.requestTimeout).toBe(9999);
  });

  it('rejects with LLMTimeoutError when an aborted caller signal cancels the Bedrock vision call', async () => {
    setEnv(BEDROCK_ENV);
    mockBedrockSend.mockImplementation((_cmd: unknown, opts?: { abortSignal?: AbortSignal }) => {
      if (opts?.abortSignal?.aborted) {
        const e = new Error('Request aborted');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
      return Promise.resolve({
        body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'ok' }] })),
      });
    });
    const ac = new AbortController();
    ac.abort();
    const { callAiVision } = require('@/lib/ai-provider');
    const { LLMTimeoutError } = require('@/lib/openai');
    await expect(
      callAiVision('whatsapp_ocr', 'describe image', [FAKE_IMAGE], { signal: ac.signal }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
  });
});

// ── callAiAudio (Bedrock) ────────────────────────────────────────────────────

describe('callAiAudio (bedrock) threads abortSignal + requestTimeout', () => {
  it('passes { abortSignal } as the 2nd arg to client.send', async () => {
    setEnv(BEDROCK_ENV);
    const { callAiAudio } = require('@/lib/ai-provider');
    await callAiAudio('whatsapp_voice', FAKE_AUDIO, { timeoutMs: 5000 });

    expect(mockBedrockSend).toHaveBeenCalledTimes(1);
    const sendOpts = mockBedrockSend.mock.calls[0][1];
    expect(sendOpts).toBeDefined();
    expect(sendOpts.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('sets requestHandler.requestTimeout from timeoutMs on the Bedrock audio client', async () => {
    setEnv(BEDROCK_ENV);
    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    const { callAiAudio } = require('@/lib/ai-provider');
    await callAiAudio('whatsapp_voice', FAKE_AUDIO, { timeoutMs: 6666 });

    const ctorOpts = (BedrockRuntimeClient as jest.Mock).mock.calls[0][0];
    expect(ctorOpts.requestHandler?.requestTimeout).toBe(6666);
  });

  it('rejects with LLMTimeoutError when an aborted caller signal cancels the Bedrock audio call', async () => {
    setEnv(BEDROCK_ENV);
    mockBedrockSend.mockImplementation((_cmd: unknown, opts?: { abortSignal?: AbortSignal }) => {
      if (opts?.abortSignal?.aborted) {
        const e = new Error('Request aborted');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
      return Promise.resolve({
        body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'transcription' }] })),
      });
    });
    const ac = new AbortController();
    ac.abort();
    const { callAiAudio } = require('@/lib/ai-provider');
    const { LLMTimeoutError } = require('@/lib/openai');
    await expect(
      callAiAudio('whatsapp_voice', FAKE_AUDIO, { signal: ac.signal }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
  });
});

// ── callAiAudio (Gemini) ─────────────────────────────────────────────────────

describe('callAiAudio (gemini) threads abortSignal + timeoutMs', () => {
  it('passes an AbortSignal into the Gemini generateContent config', async () => {
    setEnv(GEMINI_ENV);
    const { callAiAudio } = require('@/lib/ai-provider');
    await callAiAudio('whatsapp_voice', FAKE_AUDIO, { timeoutMs: 5000 });

    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    const callArgs = mockGeminiGenerate.mock.calls[0][0];
    expect(callArgs.config).toBeDefined();
    expect(callArgs.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(callArgs.config.abortSignal.aborted).toBe(false);
  });

  it('rejects with LLMTimeoutError when Gemini audio call never resolves within timeoutMs', async () => {
    setEnv(GEMINI_ENV);
    mockGeminiGenerate.mockImplementation(() => new Promise(() => {}));
    const { callAiAudio } = require('@/lib/ai-provider');
    const { LLMTimeoutError } = require('@/lib/openai');
    await expect(
      callAiAudio('whatsapp_voice', FAKE_AUDIO, { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(LLMTimeoutError);
  });
});
