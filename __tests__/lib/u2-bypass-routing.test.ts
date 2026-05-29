/**
 * U2 (issue 674): bypass-routing fixes.
 *
 * Three call sites previously hard-pinned to OpenAI (lib/openai or raw fetch),
 * skipping AI_PROVIDER routing AND the ai_audit row:
 *   - lib/whatsapp/forward-parser.ts
 *   - lib/economics/route-decision.ts
 *   - scripts/seed-port-da.ts (defaultLlmCaller)
 *
 * These tests prove each now goes through lib/ai-provider:
 *   (a) honors AI_PROVIDER=gemini (the gemini SDK is invoked, not lib/openai), and
 *   (b) writes an ai_audit row.
 *
 * Providers are MOCKED — no real network.
 */

import Database from 'better-sqlite3';
import { runMigrations } from '@/lib/migrations/runner';
import { allMigrations } from '@/lib/migrations/index';

// lib/openai must NOT be the path taken when AI_PROVIDER=gemini. We mock it and
// assert it is NEVER called — a hard-pinned bypass would call it.
const openaiCallAiJson = jest.fn().mockResolvedValue({ missing_info: [] });
const openaiCallAiText = jest.fn().mockResolvedValue('openai-text');
jest.mock('@/lib/openai', () => {
  const ActualErr = jest.requireActual('@/lib/openai').LLMTimeoutError;
  return {
    callAiJson: (...a: unknown[]) => openaiCallAiJson(...a),
    callAiText: (...a: unknown[]) => openaiCallAiText(...a),
    LLMTimeoutError: ActualErr,
  };
});

const mockGeminiGenerate = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGeminiGenerate },
  })),
}), { virtual: true });

let testDb: Database.Database;
jest.mock('@/lib/session-store', () => ({
  getStore: jest.fn(() => ({ getDatabase: jest.fn(() => testDb) })),
}));

jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// forward-parser sub-modules (media extractors) — unused for type='text'.
jest.mock('@/lib/whatsapp/voice-transcribe', () => ({ transcribeAudio: jest.fn() }));
jest.mock('@/lib/whatsapp/image-ocr', () => ({ extractTextFromImage: jest.fn() }));
jest.mock('@/lib/whatsapp/pdf-extract', () => ({ extractTextFromPdf: jest.fn() }));

function setGeminiEnv(): void {
  process.env.AI_PROVIDER = 'gemini';
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/dev/null';
  process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
  process.env.AI_MODEL_GEMINI_DEFAULT = 'gemini-2.5-flash';
}

function clearEnv(): void {
  for (const k of [
    'AI_PROVIDER', 'WHATSAPP_FORWARD_PROVIDER', 'ROUTE_DECISION_PROVIDER', 'SEED_PORT_DA_PROVIDER',
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'AI_MODEL_GEMINI_DEFAULT',
  ]) delete process.env[k];
}

function auditRows() {
  return testDb.prepare('SELECT scope, provider, ok FROM ai_audit ORDER BY id').all() as Array<{
    scope: string; provider: string; ok: number;
  }>;
}

beforeEach(() => {
  testDb = new Database(':memory:');
  runMigrations(testDb, allMigrations);
  clearEnv();
  jest.clearAllMocks();
  const sessionStore = require('@/lib/session-store');
  (sessionStore.getStore as jest.Mock).mockReturnValue({ getDatabase: jest.fn(() => testDb) });
  mockGeminiGenerate.mockResolvedValue({ text: '{"missing_info":[]}' });
});

afterEach(() => testDb.close());

describe('forward-parser routes through ai-provider', () => {
  it('honors AI_PROVIDER=gemini and writes an ai_audit row (not lib/openai)', async () => {
    setGeminiEnv();
    mockGeminiGenerate.mockResolvedValue({
      text: '{"origin_port":{"value":"Istanbul","confidence":"confirmed"},"missing_info":[]}',
    });
    const { parseForwardedMessage } = require('@/lib/whatsapp/forward-parser');
    const client = { downloadMedia: jest.fn() };
    await parseForwardedMessage(
      { id: 'wamid.1', from: '+10000', timestamp: '1', type: 'text', text: { body: 'cargo wheat 50kt istanbul lagos' } },
      client,
    );

    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    expect(openaiCallAiJson).not.toHaveBeenCalled();
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('whatsapp_forward');
    expect(rows[0].provider).toBe('gemini');
  });
});

describe('route-decision routes through ai-provider', () => {
  it('honors AI_PROVIDER=gemini and writes an ai_audit row (not lib/openai)', async () => {
    setGeminiEnv();
    mockGeminiGenerate.mockResolvedValue({ text: 'Suez wins by 2 days.' });
    const { compareRoutes } = require('@/lib/economics/route-decision');
    await compareRoutes(
      'singapore',
      'rotterdam',
      { dwt: 80000, ladenSpeed: 14, ballastSpeed: 14, speedKts: 14 } as any,
      { quantityMt: 70000, type: 'grain' } as any,
      { bunkerPriceUsdPerMt: 600, euaPriceEur: 70 },
    );

    expect(mockGeminiGenerate).toHaveBeenCalled();
    expect(openaiCallAiText).not.toHaveBeenCalled();
    const rows = auditRows();
    expect(rows.some((r) => r.scope === 'route_decision' && r.provider === 'gemini')).toBe(true);
  });
});

describe('seed-port-da defaultLlmCaller routes through ai-provider', () => {
  it('honors AI_PROVIDER=gemini and writes an ai_audit row (no raw OpenAI fetch)', async () => {
    setGeminiEnv();
    mockGeminiGenerate.mockResolvedValue({
      text: '{"vessel_dwt_min":65001,"vessel_dwt_max":80000,"port_dues_usd":12000,"pilotage_usd":4000,"tugs_usd":3000,"stevedoring_usd_per_mt":2.5,"confidence":"estimated"}',
    });
    // Guard: fetch must not be touched by the new path.
    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockImplementation((() => {
      throw new Error('raw fetch must not be called');
    }) as never);

    const { defaultLlmCaller } = require('../../scripts/seed-port-da');
    const result = await defaultLlmCaller('gemini-2.5-flash', 'NLRTM', 'Rotterdam', 'panamax', 65001, 80000);

    expect(result.port_dues_usd).toBe(12000);
    expect(mockGeminiGenerate).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    const rows = auditRows();
    expect(rows.some((r) => r.scope === 'seed_port_da' && r.provider === 'gemini')).toBe(true);

    fetchSpy.mockRestore();
  });
});
