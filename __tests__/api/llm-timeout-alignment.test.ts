/**
 * wave-γ-1.5-B: positive contract tests — each LLM call site must pass
 * timeoutMs aligned with the route's maxDuration.
 *
 * Formula: endpointLlmTimeout(maxDuration) = Math.max(5000, (maxDuration-5)*1000)
 *   maxDuration=30  → 25_000  (draft-quote, draft-reply)
 *   maxDuration=60  → 55_000  (recap, parse-vessel)
 *   maxDuration=120 → 115_000 (match, parse-recap, classify)
 *   lib sub-calls   → 20_000  hard-coded (image-ocr, voice-transcribe)
 */

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { SessionData } from '@/lib/types';

// ── Global mocks (hoisted before any imports) ─────────────────────────────

jest.mock('@/lib/csrf', () => ({
  validateCsrf: jest.fn().mockReturnValue(true),
  generateCsrfToken: jest.fn().mockReturnValue('mock-csrf'),
}));

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
  createSession: jest.fn().mockReturnValue('mock-session-id'),
  getSession: jest.fn(),
}));

jest.mock('@/lib/openai', () => {
  const ActualErr = jest.requireActual('@/lib/openai').LLMTimeoutError;
  return {
    LLMTimeoutError: ActualErr,
    callAiText: jest.fn(),
    callAiJson: jest.fn(),
  };
});

// Extra mocks needed for route internals
jest.mock('@/lib/parsing/parse-vessel-helpers', () => ({
  buildVesselPrompt: jest.fn().mockReturnValue('vessel-prompt'),
  parseVesselAIResponse: jest.fn().mockReturnValue([]),
}));
jest.mock('@/lib/parsing/geared-fallback', () => ({
  applyGearedFallback: jest.fn().mockReturnValue([]),
}));
jest.mock('@/lib/validation/equasis-client', () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn(),
}));
jest.mock('@/lib/matching/pair-analyzer', () => ({
  analyzePairs: jest.fn().mockImplementation(
    async (_cargos: unknown, _vessels: unknown, aiScorer: (args: unknown) => Promise<unknown>) => {
      await aiScorer({ cargoData: [], vesselData: [], readinessData: {} });
      return { matches: [], blockedMatches: [] };
    },
  ),
}));
jest.mock('@/lib/parsing/parse-recap-helpers', () => ({
  parseRecapAIResponse: jest.fn().mockReturnValue({ emailId: 'email-01' }),
}));
jest.mock('@/lib/commission', () => ({
  summarizeCommissions: jest.fn().mockReturnValue(null),
}));
jest.mock('@/lib/classification-service', () => ({
  classifyEmails: jest.fn().mockReturnValue({ classifications: [], processedEmails: [] }),
  buildProcessedEmails: jest.fn().mockReturnValue([]),
  AiClassification: {},
}));

// ── Static imports (after mocks) ──────────────────────────────────────────

import { requireSession } from '@/lib/session';
import { callAiJson, callAiText } from '@/lib/openai';
import { POST as draftQuotePOST } from '@/app/api/ai/draft-quote/route';
import { POST as draftReplyPOST } from '@/app/api/ai/draft-reply/route';
import { POST as recapPOST } from '@/app/api/ai/recap/route';
import { POST as parseVesselPOST } from '@/app/api/ai/parse-vessel/route';
import { POST as matchPOST } from '@/app/api/ai/match/route';
import { POST as parseRecapPOST } from '@/app/api/ai/parse-recap/route';
import { POST as classifyPOST } from '@/app/api/ai/classify/route';
import { extractTextFromImage } from '@/lib/whatsapp/image-ocr';
import { transcribeAudio } from '@/lib/whatsapp/voice-transcribe';

const mockRequireSession = requireSession as jest.Mock;
const mockCallAiJson = callAiJson as jest.Mock;
const mockCallAiText = callAiText as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'mock-csrf' },
    body: JSON.stringify(body),
  });
}

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    accessToken: 'tok',
    emails: [
      {
        id: 'email-01',
        threadId: 'thread-01',
        from: 'sender@example.com',
        fromName: 'Sender',
        fromEmail: 'sender@example.com',
        to: 'broker@example.com',
        subject: 'Test cargo',
        date: new Date().toISOString(),
        body: 'Test body',
        snippet: 'Test',
        labelIds: ['INBOX'],
      },
    ],
    parsedCargos: [],
    parsedVessels: [],
    parsedRecaps: [],
    parsedFixtureRecaps: [],
    classifications: [],
    matches: [],
    blockedMatches: [],
    isSampleData: false,
    createdAt: new Date(),
    recaps: [],
    ...overrides,
  } as unknown as SessionData;
}

function setupSession(overrides: Partial<SessionData> = {}): void {
  mockRequireSession.mockReturnValue({
    session: makeSession(overrides),
    sessionId: 'mock-session-id',
  } as any);
}

function lastCallOptions(mock: jest.Mock): { timeoutMs?: number } | undefined {
  const calls = mock.mock.calls;
  if (calls.length === 0) return undefined;
  const lastCall = calls[calls.length - 1];
  return lastCall[lastCall.length - 1] as { timeoutMs?: number } | undefined;
}

beforeEach(() => {
  mockCallAiText.mockReset();
  mockCallAiJson.mockReset();
  mockCallAiText.mockResolvedValue('AI response text');
  mockCallAiJson.mockResolvedValue({});
  // U2: these routes/sub-calls go through @/lib/ai-provider. Pin
  // AI_PROVIDER=openai so the shim delegates to the mocked @/lib/openai layer
  // asserted below (ambient .env sets AI_PROVIDER=gemini).
  process.env.AI_PROVIDER = 'openai';
});

// ── 1. draft-quote (maxDuration=30 → 25_000) ──────────────────────────────

// draft-quote route is now async (enqueue → worker). It no longer calls callAiText.
// timeoutMs enforcement now happens inside scripts/quote-workshop/worker.ts.
// TODO: port this test to a worker-level unit test.
describe.skip('draft-quote route (maxDuration=30) [route is now async — skip until worker tests exist]', () => {
  it('passes timeoutMs=25_000 to callAiText', async () => {
    setupSession({
      parsedCargos: [{ emailId: 'email-01', missingInfo: [] } as any],
    });

    await draftQuotePOST(makeRequest('/api/ai/draft-quote', { emailId: 'email-01' }));

    expect(mockCallAiText).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(25_000);
  });
});

// ── 2. draft-reply (maxDuration=30 → 25_000, TWO call paths) ─────────────

describe('draft-reply route (maxDuration=30)', () => {
  it('case 1: emailId path — callAiText gets timeoutMs=25_000', async () => {
    setupSession({
      parsedCargos: [{ emailId: 'email-01', missingInfo: ['port_loading'] } as any],
    });

    await draftReplyPOST(makeRequest('/api/ai/draft-reply', { emailId: 'email-01' }));

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(25_000);
  });

  it('case 2: pendingItems path — callAiText gets timeoutMs=25_000', async () => {
    setupSession();

    await draftReplyPOST(
      makeRequest('/api/ai/draft-reply', {
        pendingItems: [{ topic: 'freight_rate', value: '$30/mt' }],
      }),
    );

    expect(mockCallAiText).toHaveBeenCalledTimes(1);
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(25_000);
  });
});

// ── 3. recap (maxDuration=60 → 55_000) ───────────────────────────────────

describe('recap route (maxDuration=60)', () => {
  it('passes timeoutMs=55_000 to callAiJson', async () => {
    // Need ≥ MIN_THREAD_LENGTH_FOR_RECAP (=5) emails in same thread
    setupSession({
      emails: [
        {
          id: 'e1', threadId: 'thread-A', from: 'a@x.com', fromName: 'A', fromEmail: 'a@x.com',
          to: 'b@x.com', subject: 'Nego', date: new Date('2024-01-01').toISOString(),
          body: 'msg1', snippet: 'm1', labelIds: [],
        },
        {
          id: 'e2', threadId: 'thread-A', from: 'b@x.com', fromName: 'B', fromEmail: 'b@x.com',
          to: 'a@x.com', subject: 'Re: Nego', date: new Date('2024-01-02').toISOString(),
          body: 'msg2', snippet: 'm2', labelIds: [],
        },
        {
          id: 'e3', threadId: 'thread-A', from: 'a@x.com', fromName: 'A', fromEmail: 'a@x.com',
          to: 'b@x.com', subject: 'Re2: Nego', date: new Date('2024-01-03').toISOString(),
          body: 'msg3', snippet: 'm3', labelIds: [],
        },
        {
          id: 'e4', threadId: 'thread-A', from: 'b@x.com', fromName: 'B', fromEmail: 'b@x.com',
          to: 'a@x.com', subject: 'Re3: Nego', date: new Date('2024-01-04').toISOString(),
          body: 'msg4', snippet: 'm4', labelIds: [],
        },
        {
          id: 'e5', threadId: 'thread-A', from: 'a@x.com', fromName: 'A', fromEmail: 'a@x.com',
          to: 'b@x.com', subject: 'Re4: Nego', date: new Date('2024-01-05').toISOString(),
          body: 'msg5', snippet: 'm5', labelIds: [],
        },
      ],
    } as any);
    mockCallAiJson.mockResolvedValue({ points: [], summary: 'OK' });

    await recapPOST(makeRequest('/api/ai/recap'));

    expect(mockCallAiJson).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiJson);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(55_000);
  });
});

// ── 4. parse-vessel (maxDuration=60 after γ-1.5-A → 55_000) ─────────────

describe('parse-vessel route (maxDuration=60)', () => {
  it('passes timeoutMs=55_000 to callAiText', async () => {
    setupSession({
      isSampleData: false,
      parsedVessels: [],
      classifications: [{ emailId: 'email-01', category: 'VESSEL_POSITION' } as any],
    });

    await parseVesselPOST(makeRequest('/api/ai/parse-vessel'));

    expect(mockCallAiText).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(55_000);
  });
});

// ── 5. match (maxDuration=120 → 115_000) ─────────────────────────────────

describe('match route (maxDuration=120)', () => {
  it('passes timeoutMs=115_000 to callAiJson (via aiScorer)', async () => {
    setupSession({
      parsedCargos: [{
        emailId: 'e1', commodity: 'grain', quantityMt: 50000,
        laycanStart: '2024-08-01', laycanEnd: '2024-08-15',
        portLoading: 'Istanbul', portDischarge: 'Lagos',
      } as any],
      parsedVessels: [{
        emailId: 'e2', vesselName: 'MV Test', dwt: 60000,
        positionPort: 'Istanbul', openDate: '2024-08-01',
      } as any],
    });
    mockCallAiJson.mockResolvedValue({ matches: [] });

    await matchPOST(makeRequest('/api/ai/match'));

    expect(mockCallAiJson).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiJson);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(115_000);
  });
});

// ── 6. parse-recap (maxDuration=120 → 115_000) ───────────────────────────

describe('parse-recap route (maxDuration=120)', () => {
  it('passes timeoutMs=115_000 to callAiText', async () => {
    setupSession({
      classifications: [{ emailId: 'email-01', category: 'FIXTURE_RECAP' } as any],
    });

    await parseRecapPOST(makeRequest('/api/ai/parse-recap'));

    expect(mockCallAiText).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(115_000);
  });
});

// ── 7. classify (maxDuration=120 → 115_000) ───────────────────────────────

describe('classify route (maxDuration=120)', () => {
  it('passes timeoutMs=115_000 to callAiJson', async () => {
    setupSession({
      isSampleData: false,
      classifications: [],
    });
    mockCallAiJson.mockResolvedValue({ classifications: [] });

    await classifyPOST(makeRequest('/api/ai/classify'));

    expect(mockCallAiJson).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiJson);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(115_000);
  });
});

// ── 8. image-ocr lib (sub-call in 30s forward-parser → 20_000) ───────────

describe('image-ocr lib (sub-call, hard-coded 20_000)', () => {
  it('passes timeoutMs=20_000 to callAiText', async () => {
    await extractTextFromImage('https://example.com/image.jpg');

    expect(mockCallAiText).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(20_000);
  });
});

// ── 9. voice-transcribe lib (sub-call, hard-coded 20_000) ─────────────────

describe('voice-transcribe lib (sub-call, hard-coded 20_000)', () => {
  it('passes timeoutMs=20_000 to callAiText', async () => {
    await transcribeAudio('https://example.com/audio.ogg', 'audio/ogg');

    expect(mockCallAiText).toHaveBeenCalled();
    const opts = lastCallOptions(mockCallAiText);
    expect(opts).toBeDefined();
    expect(opts!.timeoutMs).toBe(20_000);
  });
});
