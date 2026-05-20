/**
 * Tests for lib/ai-provider.ts
 *
 * Tests cover:
 * - Routing matrix: 3 providers × 3 scopes = 9 cases
 * - Per-scope override: <SCOPE>_PROVIDER wins over AI_PROVIDER
 * - Default: no env set → all scopes = openai
 * - Missing env error: clear message with instructions
 * - Audit logging: each callAi* writes to ai_audit
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

// ─── Mock all 3 providers ─────────────────────────────────────────────────────

// Mock openai lib
jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn().mockResolvedValue({ result: 'openai-json' }),
  callAiText: jest.fn().mockResolvedValue('openai-text'),
  LLMTimeoutError: class LLMTimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LLMTimeoutError';
    }
  },
}));

// Mock @google/genai
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn().mockResolvedValue({ text: 'gemini-response' }),
    },
  })),
}), { virtual: true });

// Mock @aws-sdk/client-bedrock-runtime
const mockSend = jest.fn().mockResolvedValue({
  body: new TextEncoder().encode(JSON.stringify({
    content: [{ text: 'bedrock-response' }],
  })),
});

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  InvokeModelCommand: jest.fn().mockImplementation((opts: unknown) => opts),
}), { virtual: true });

// Mock session-store so audit writes go to our test DB
let testDb: Database.Database;

jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({
    getDatabase: jest.fn(() => testDb),
  })),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ─── Helper to reset env ──────────────────────────────────────────────────────

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearProviderEnv(): void {
  const keys = [
    'AI_PROVIDER',
    'CLASSIFY_PROVIDER', 'MATCH_PROVIDER', 'PARSE_CARGO_PROVIDER',
    'RECAP_PROVIDER', 'DRAFT_QUOTE_PROVIDER', 'WHATSAPP_OCR_PROVIDER',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION',
    'AI_MODEL_GEMINI_DEFAULT',
    'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BEDROCK_MODEL_ID',
  ];
  for (const k of keys) delete process.env[k];
}

// ─── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  testDb = new Database(':memory:');
  runMigrations(testDb, allMigrations);
  clearProviderEnv();
  jest.clearAllMocks();
  // Re-mock getStore to use fresh testDb
  const sessionStore = require('@/lib/session-store');
  (sessionStore.getStore as jest.Mock).mockReturnValue({
    getDatabase: jest.fn(() => testDb),
  });
});

afterEach(() => {
  testDb.close();
});

// ─── Tests: getProvider ────────────────────────────────────────────────────────

describe('getProvider', () => {
  // Routing matrix: 3 providers × 3 scopes

  it('returns "openai" when AI_PROVIDER=openai for scope=classify', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'openai' });
    expect(getProvider('classify')).toBe('openai');
  });

  it('returns "openai" when AI_PROVIDER=openai for scope=match', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'openai' });
    expect(getProvider('match')).toBe('openai');
  });

  it('returns "openai" when AI_PROVIDER=openai for scope=parse_cargo', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'openai' });
    expect(getProvider('parse_cargo')).toBe('openai');
  });

  it('returns "gemini" when AI_PROVIDER=gemini for scope=classify', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'gemini' });
    expect(getProvider('classify')).toBe('gemini');
  });

  it('returns "gemini" when AI_PROVIDER=gemini for scope=match', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'gemini' });
    expect(getProvider('match')).toBe('gemini');
  });

  it('returns "gemini" when AI_PROVIDER=gemini for scope=parse_cargo', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'gemini' });
    expect(getProvider('parse_cargo')).toBe('gemini');
  });

  it('returns "bedrock" when AI_PROVIDER=bedrock for scope=classify', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'bedrock' });
    expect(getProvider('classify')).toBe('bedrock');
  });

  it('returns "bedrock" when AI_PROVIDER=bedrock for scope=match', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'bedrock' });
    expect(getProvider('match')).toBe('bedrock');
  });

  it('returns "bedrock" when AI_PROVIDER=bedrock for scope=parse_cargo', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'bedrock' });
    expect(getProvider('parse_cargo')).toBe('bedrock');
  });
});

// ─── Tests: per-scope override ─────────────────────────────────────────────────

describe('per-scope override', () => {
  it('MATCH_PROVIDER=bedrock overrides AI_PROVIDER=openai for match scope', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'openai', MATCH_PROVIDER: 'bedrock' });
    expect(getProvider('match')).toBe('bedrock');
  });

  it('other scopes still use global AI_PROVIDER when per-scope not set', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'openai', MATCH_PROVIDER: 'bedrock' });
    expect(getProvider('classify')).toBe('openai');
    expect(getProvider('parse_cargo')).toBe('openai');
  });

  it('CLASSIFY_PROVIDER=gemini overrides AI_PROVIDER=bedrock', () => {
    const { getProvider } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'bedrock', CLASSIFY_PROVIDER: 'gemini' });
    expect(getProvider('classify')).toBe('gemini');
    expect(getProvider('match')).toBe('bedrock');
  });
});

// ─── Tests: default (no env) ───────────────────────────────────────────────────

describe('default provider', () => {
  it('returns "openai" for all scopes when no env vars are set', () => {
    const { getProvider } = require('@/lib/ai-provider');
    // clearProviderEnv already ran in beforeEach
    expect(getProvider('classify')).toBe('openai');
    expect(getProvider('match')).toBe('openai');
    expect(getProvider('parse_cargo')).toBe('openai');
    expect(getProvider('draft_quote')).toBe('openai');
  });

  it('falls back to openai for unknown provider value and logs a warning', () => {
    const { getProvider } = require('@/lib/ai-provider');
    const { logger } = require('@/lib/logger');
    setEnv({ AI_PROVIDER: 'unknown-provider' });
    expect(getProvider('classify')).toBe('openai');
    expect(logger.warn).toHaveBeenCalled();
  });
});

// ─── Tests: missing env errors ─────────────────────────────────────────────────

describe('missing env errors', () => {
  it('throws with "AWS_ACCESS_KEY_ID" and "set in .env.local" when bedrock creds missing', async () => {
    const { callAiText } = require('@/lib/ai-provider');
    setEnv({ MATCH_PROVIDER: 'bedrock' });
    // AWS_ACCESS_KEY_ID not set → should throw
    await expect(callAiText('match', 'system', 'user')).rejects.toThrow(/AWS_ACCESS_KEY_ID/);
    await expect(callAiText('match', 'system', 'user')).rejects.toThrow(/set in .env.local/);
  });

  it('throws with "GOOGLE_APPLICATION_CREDENTIALS" when gemini creds missing', async () => {
    const { callAiText } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'gemini' });
    // GOOGLE_APPLICATION_CREDENTIALS not set → should throw
    await expect(callAiText('classify', 'system', 'user')).rejects.toThrow(
      /GOOGLE_APPLICATION_CREDENTIALS/
    );
  });

  it('error message instructs to set in .env.local', async () => {
    const { callAiJson } = require('@/lib/ai-provider');
    setEnv({ MATCH_PROVIDER: 'bedrock' });
    await expect(callAiJson('match', 'system', 'user')).rejects.toThrow(/\.env\.local/);
  });
});

// ─── Tests: audit logging ──────────────────────────────────────────────────────

describe('audit logging', () => {
  function getAuditRows() {
    return testDb.prepare('SELECT * FROM ai_audit ORDER BY id').all() as Array<{
      id: number;
      scope: string;
      provider: string;
      model: string;
      ok: number;
      err: string | null;
      latency_ms: number;
    }>;
  }

  it('callAiJson writes an audit row with ok=1 on success', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('classify', 'system', 'user');
    const rows = getAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('classify');
    expect(rows[0].provider).toBe('openai');
    expect(rows[0].ok).toBe(1);
    expect(rows[0].err).toBeNull();
    expect(rows[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('callAiText writes an audit row', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('recap', 'system', 'user');
    const rows = getAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('recap');
    expect(rows[0].provider).toBe('openai');
  });

  it('callAiVision throws on openai provider (Wave γ QA C2: fail-loud rollback) and writes audit row with ok=false', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAiVision } = require('@/lib/ai-provider');
    await expect(callAiVision('whatsapp_ocr', 'describe this', [])).rejects.toThrow(/openai branch is not implemented/);
    const rows = getAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('whatsapp_ocr');
    expect(rows[0].ok).toBe(0);
    expect(rows[0].err).toMatch(/openai branch is not implemented/);
  });

  it('callAiAudio throws on openai provider (Wave γ QA C2: fail-loud rollback) and writes audit row with ok=false', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAiAudio } = require('@/lib/ai-provider');
    await expect(callAiAudio('whatsapp_voice', Buffer.from('audio-data'))).rejects.toThrow(/openai branch is not implemented/);
    const rows = getAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('whatsapp_voice');
    expect(rows[0].ok).toBe(0);
    expect(rows[0].err).toMatch(/openai branch is not implemented/);
  });

  it('callAi writes an audit row', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAi } = require('@/lib/ai-provider');
    await callAi('classify', 'some prompt');
    const rows = getAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('classify');
  });

  it('writes ok=0 and err message on failure', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const openaiLib = require('@/lib/openai');
    (openaiLib.callAiText as jest.Mock).mockRejectedValueOnce(new Error('network error'));
    const { callAiText } = require('@/lib/ai-provider');
    await expect(callAiText('classify', 'system', 'user')).rejects.toThrow('network error');
    const rows = getAuditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(0);
    expect(rows[0].err).toBe('network error');
  });

  it('multiple calls each write a separate audit row', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('classify', 's', 'u');
    await callAiText('match', 's', 'u');
    await callAiText('recap', 's', 'u');
    const rows = getAuditRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.scope)).toEqual(['classify', 'match', 'recap']);
  });
});

// ─── Tests: getModel ──────────────────────────────────────────────────────────

describe('getModel', () => {
  it('returns gemini model when AI_PROVIDER=gemini', () => {
    const { getModel } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'gemini', AI_MODEL_GEMINI_DEFAULT: 'gemini-2.5-pro' });
    expect(getModel('classify')).toBe('gemini-2.5-pro');
  });

  it('returns bedrock model when AI_PROVIDER=bedrock', () => {
    const { getModel } = require('@/lib/ai-provider');
    setEnv({ AI_PROVIDER: 'bedrock', BEDROCK_MODEL_ID: 'anthropic.claude-opus-4-7' });
    expect(getModel('match')).toBe('anthropic.claude-opus-4-7');
  });

  it('returns default openai model when no env set', () => {
    const { getModel } = require('@/lib/ai-provider');
    // No env set
    const model = getModel('classify');
    expect(typeof model).toBe('string');
    expect(model.length).toBeGreaterThan(0);
  });
});

// ─── QA L-1: cost_usd computation ────────────────────────────────────────────

describe('computeCostUsd — QA L-1', () => {
  it('returns null when prompt or completion tokens missing', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', null, 100)).toBeNull();
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', 100, null)).toBeNull();
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', undefined, undefined)).toBeNull();
  });

  it('returns null for an unknown (provider, model) combo', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    expect(computeCostUsd('gemini', 'made-up-model', 1000, 500)).toBeNull();
    expect(computeCostUsd('openai', 'gpt-5.5', 1000, 500)).toBeNull();
  });

  it('computes gemini-2.5-flash cost at $0.075 in / $0.30 out per 1M', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    // 1000*0.075/1M + 500*0.30/1M = 0.000075 + 0.00015 = 0.000225
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', 1000, 500)).toBeCloseTo(0.000225, 6);
  });

  it('computes gemini-2.5-pro cost at $1.25 in / $5 out per 1M', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    // 10000*1.25/1M + 2000*5/1M = 0.0125 + 0.01 = 0.0225
    expect(computeCostUsd('gemini', 'gemini-2.5-pro', 10000, 2000)).toBeCloseTo(0.0225, 6);
  });

  it('computes bedrock claude-opus-4-7 cost at $15 in / $75 out per 1M', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    // 1000*15/1M + 500*75/1M = 0.015 + 0.0375 = 0.0525
    expect(computeCostUsd(
      'bedrock',
      'anthropic.claude-opus-4-7',
      1000,
      500,
    )).toBeCloseTo(0.0525, 6);
  });

  it('computes bedrock claude-sonnet-4-6 cost at $3 in / $15 out per 1M', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    // 1000*3/1M + 500*15/1M = 0.003 + 0.0075 = 0.0105
    expect(computeCostUsd(
      'bedrock',
      'anthropic.claude-sonnet-4-6',
      1000,
      500,
    )).toBeCloseTo(0.0105, 6);
  });

  it('returns 0 for a zero-token call (rate × 0 = 0)', () => {
    const { computeCostUsd } = require('@/lib/ai-provider');
    expect(computeCostUsd('gemini', 'gemini-2.5-flash', 0, 0)).toBe(0);
  });
});

describe('callAiJson + ai_audit cost_usd integration — QA L-1', () => {
  it('writes non-null cost_usd when Gemini returns usage metadata', async () => {
    setEnv({
      AI_PROVIDER: 'gemini',
      GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      AI_MODEL_GEMINI_DEFAULT: 'gemini-2.5-flash',
    });

    const { GoogleGenAI } = require('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: {
        generateContent: jest.fn().mockResolvedValue({
          text: '{"ok":true}',
          usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
        }),
      },
    }));

    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('classify', 'sys', 'user');

    const row = testDb
      .prepare('SELECT prompt_tokens, completion_tokens, cost_usd FROM ai_audit ORDER BY id DESC LIMIT 1')
      .get() as { prompt_tokens: number; completion_tokens: number; cost_usd: number };

    expect(row.prompt_tokens).toBe(1000);
    expect(row.completion_tokens).toBe(500);
    expect(row.cost_usd).toBeCloseTo(0.000225, 6);
  });

  it('writes null cost_usd when Gemini omits usage metadata', async () => {
    setEnv({
      AI_PROVIDER: 'gemini',
      GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      AI_MODEL_GEMINI_DEFAULT: 'gemini-2.5-flash',
    });

    const { GoogleGenAI } = require('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: {
        generateContent: jest.fn().mockResolvedValue({ text: '{"ok":true}' }),
      },
    }));

    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('classify', 'sys', 'user');

    const row = testDb
      .prepare('SELECT prompt_tokens, completion_tokens, cost_usd FROM ai_audit ORDER BY id DESC LIMIT 1')
      .get() as { prompt_tokens: number | null; completion_tokens: number | null; cost_usd: number | null };

    expect(row.prompt_tokens).toBeNull();
    expect(row.completion_tokens).toBeNull();
    expect(row.cost_usd).toBeNull();
  });

  it('writes non-null cost_usd from Bedrock usage', async () => {
    setEnv({
      AI_PROVIDER: 'bedrock',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'k',
      AWS_SECRET_ACCESS_KEY: 's',
      BEDROCK_MODEL_ID: 'anthropic.claude-opus-4-7',
    });

    const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
    (BedrockRuntimeClient as jest.Mock).mockImplementationOnce(() => ({
      send: jest.fn().mockResolvedValue({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: '{"ok":true}' }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        })),
      }),
    }));

    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('match', 'sys', 'user');

    const row = testDb
      .prepare('SELECT prompt_tokens, completion_tokens, cost_usd FROM ai_audit ORDER BY id DESC LIMIT 1')
      .get() as { prompt_tokens: number; completion_tokens: number; cost_usd: number };

    expect(row.prompt_tokens).toBe(1000);
    expect(row.completion_tokens).toBe(500);
    expect(row.cost_usd).toBeCloseTo(0.0525, 6);
  });

  it('rollback path: AI_PROVIDER=openai still writes audit row with null cost_usd (no regression)', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('classify', 'sys', 'user');

    const row = testDb
      .prepare('SELECT provider, cost_usd FROM ai_audit ORDER BY id DESC LIMIT 1')
      .get() as { provider: string; cost_usd: number | null };

    expect(row.provider).toBe('openai');
    expect(row.cost_usd).toBeNull();
  });
});

// ─── Tests: Gemini structured output (Spec 05) ─────────────────────────────

describe('Gemini structured output (responseSchema)', () => {
  it('passes responseMimeType and responseSchema to Gemini when schema provided', async () => {
    setEnv({
      AI_PROVIDER: 'gemini',
      GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      AI_MODEL_GEMINI_DEFAULT: 'gemini-2.5-flash',
    });

    const mockGenerateContent = jest.fn().mockResolvedValue({
      text: '{"items":[{"name":"test"}]}',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    });
    const { GoogleGenAI } = require('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const testSchema = { type: 'OBJECT', properties: { items: { type: 'ARRAY' } } };
    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('classify', 'sys', 'user', { responseSchema: testSchema });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.config.responseSchema).toBe(testSchema);
  });

  it('does NOT set responseMimeType when no schema provided', async () => {
    setEnv({
      AI_PROVIDER: 'gemini',
      GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
      GOOGLE_CLOUD_PROJECT: 'test-project',
    });

    const mockGenerateContent = jest.fn().mockResolvedValue({
      text: '{"ok":true}',
    });
    const { GoogleGenAI } = require('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const { callAiJson } = require('@/lib/ai-provider');
    await callAiJson('classify', 'sys', 'user');

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.responseMimeType).toBeUndefined();
    expect(callArgs.config.responseSchema).toBeUndefined();
  });

  it('parses clean JSON without fence stripping when schema is provided', async () => {
    setEnv({
      AI_PROVIDER: 'gemini',
      GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
      GOOGLE_CLOUD_PROJECT: 'test-project',
    });

    const { GoogleGenAI } = require('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: {
        generateContent: jest.fn().mockResolvedValue({
          text: '{"classifications":[{"id":"e1","category":"CARGO_INQUIRY"}]}',
        }),
      },
    }));

    const testSchema = { type: 'OBJECT' };
     
    const { callAiJson } = require('@/lib/ai-provider') as { callAiJson: <T>(...args: unknown[]) => Promise<T> };
    const result = await callAiJson<{ classifications: Array<{ id: string; category: string }> }>(
      'classify', 'sys', 'user', { responseSchema: testSchema },
    );

    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].category).toBe('CARGO_INQUIRY');
  });

  it('responseSchema is ignored for non-gemini providers', async () => {
    setEnv({ AI_PROVIDER: 'openai' });
    const testSchema = { type: 'OBJECT' };
    const { callAiJson } = require('@/lib/ai-provider');
    // Should not throw — schema is simply ignored for openai
    const result = await callAiJson('classify', 'sys', 'user', { responseSchema: testSchema });
    expect(result).toEqual({ result: 'openai-json' });
  });

  it('callAiText forwards responseSchema to Gemini', async () => {
    setEnv({
      AI_PROVIDER: 'gemini',
      GOOGLE_APPLICATION_CREDENTIALS: '/dev/null',
      GOOGLE_CLOUD_PROJECT: 'test-project',
    });

    const mockGenerateContent = jest.fn().mockResolvedValue({
      text: '{"items":[]}',
    });
    const { GoogleGenAI } = require('@google/genai');
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: { generateContent: mockGenerateContent },
    }));

    const testSchema = { type: 'OBJECT', properties: { items: { type: 'ARRAY' } } };
    const { callAiText } = require('@/lib/ai-provider');
    await callAiText('parse_vessel', 'sys', 'user', { responseSchema: testSchema });

    const callArgs = mockGenerateContent.mock.calls[0][0];
    expect(callArgs.config.responseMimeType).toBe('application/json');
    expect(callArgs.config.responseSchema).toBe(testSchema);
  });
});
