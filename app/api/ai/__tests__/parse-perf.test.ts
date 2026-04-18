/**
 * Concurrency cap test: parse routes must use pLimit(3).
 * Verifies that parse-cargo, parse-vessel, and parse-recap each invoke
 * p-limit with concurrency = 3 (not 5 or unbounded).
 */

const capturedConcurrency: number[] = [];
jest.mock('p-limit', () => {
  return (concurrency: number) => {
    capturedConcurrency.push(concurrency);
    return (fn: () => unknown) => Promise.resolve((fn as () => unknown)());
  };
});

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn().mockResolvedValue({ items: [] }),
  callAiText: jest.fn().mockResolvedValue(''),
}));

jest.mock('@/lib/validation/equasis-client', () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn().mockReturnValue(null),
}));

jest.mock('@/lib/session', () => {
  const { NextResponse } = jest.requireActual('next/server');
  return {
    requireSession: jest.fn(),
    updateSession: jest.fn(),
    getSession: jest.fn(),
    NextResponse,
  };
});

import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { POST as parseCargoPOST } from '@/app/api/ai/parse-cargo/route';
import { POST as parseVesselPOST } from '@/app/api/ai/parse-vessel/route';
import { POST as parseRecapPOST } from '@/app/api/ai/parse-recap/route';
import { requireSession, updateSession } from '@/lib/session';

const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/parse-cargo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
      Cookie: 'session_id=sess-1',
    },
  });
}

function makeSession(emailCategory: string) {
  return {
    id: 'sess-1',
    accessToken: 'token',
    createdAt: new Date(),
    emails: [
      { id: 'e1', threadId: 't1', from: 'a@b.com', fromName: null, fromEmail: 'a@b.com', to: '', subject: 'Test', date: '2024-01-01', body: 'body', snippet: '', labelIds: [] },
      { id: 'e2', threadId: 't2', from: 'a@b.com', fromName: null, fromEmail: 'a@b.com', to: '', subject: 'Test2', date: '2024-01-02', body: 'body2', snippet: '', labelIds: [] },
    ],
    classifications: [
      { emailId: 'e1', category: emailCategory, confidence: 1 },
      { emailId: 'e2', category: emailCategory, confidence: 1 },
    ],
    processedEmails: [],
    parsedCargos: [],
    parsedVessels: [],
    parsedFixtureRecaps: [],
    matches: [],
    recaps: [],
    commissionSummary: null,
    counterparties: [],
  };
}

beforeEach(() => {
  capturedConcurrency.length = 0;
  mockUpdateSession.mockReset();
});

describe('parse-cargo: pLimit concurrency', () => {
  it('uses pLimit(3) for AI calls', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession('CARGO_INQUIRY') as never,
      sessionId: 'sess-1',
    });

    await parseCargoPOST(makeRequest());

    expect(capturedConcurrency).toContain(3);
    // Must NOT use a higher cap
    const aiLimitCalls = capturedConcurrency.filter(c => c !== 3 && c !== 10);
    expect(aiLimitCalls).toHaveLength(0);
  });
});

describe('parse-vessel: pLimit concurrency', () => {
  it('uses pLimit(3) for AI calls', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession('VESSEL_POSITION') as never,
      sessionId: 'sess-1',
    });

    await parseVesselPOST(makeRequest());

    // parse-vessel may call pLimit twice (AI + equasis), both should be ≤ 3
    const concurrencies = [...capturedConcurrency];
    expect(concurrencies.some(c => c === 3)).toBe(true);
    expect(concurrencies.every(c => c <= 3)).toBe(true);
  });
});

describe('parse-recap: pLimit concurrency', () => {
  it('uses pLimit(3) for AI calls', async () => {
    mockRequireSession.mockReturnValue({
      session: makeSession('FIXTURE_RECAP') as never,
      sessionId: 'sess-1',
    });

    await parseRecapPOST(makeRequest());

    expect(capturedConcurrency).toContain(3);
    const aiLimitCalls = capturedConcurrency.filter(c => c !== 3 && c !== 10);
    expect(aiLimitCalls).toHaveLength(0);
  });
});
