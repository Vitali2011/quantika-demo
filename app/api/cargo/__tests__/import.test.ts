/**
 * PI2 behavioral tests for POST /api/cargo/import
 * Real handler invocation — verifies session update via updateSession call.
 */

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
  updateSession: jest.fn(),
}));

import { requireSession, updateSession } from '@/lib/session';
import { POST } from '../import/route';
import type { ParsedCargo } from '@/lib/types';

const mockRequireSession = requireSession as jest.MockedFunction<typeof requireSession>;
const mockUpdateSession = updateSession as jest.MockedFunction<typeof updateSession>;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/cargo/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const EMPTY_SESSION = { parsedCargos: [] as ParsedCargo[], emails: [], matches: [] };

describe('POST /api/cargo/import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('adds items to session and returns added count', async () => {
    mockRequireSession.mockReturnValue({
      session: { ...EMPTY_SESSION } as never,
      sessionId: 'sess-1',
    });

    const req = makeRequest({
      items: [
        {
          commodity: 'Wheat',
          originPort: 'Odessa',
          destinationPort: 'Rotterdam',
          quantityMt: 35000,
          laycan: 'Jun 2026',
        },
      ],
    });

    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.added).toBe(1);
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);

    const [sessionId, updates] = mockUpdateSession.mock.calls[0];
    expect(sessionId).toBe('sess-1');
    const added = (updates as { parsedCargos: ParsedCargo[] }).parsedCargos;
    expect(added).toHaveLength(1);
    expect(added[0].cargoDescription?.value).toBe('Wheat');
    expect(added[0].originPort?.value).toBe('Odessa');
    expect(added[0].weightMt?.value).toBe(35000);
    expect(added[0].laycan).toBe('Jun 2026');
  });

  it('returns 400 when items array is empty', async () => {
    mockRequireSession.mockReturnValue({
      session: { ...EMPTY_SESSION } as never,
      sessionId: 'sess-1',
    });

    const res = await POST(makeRequest({ items: [] }) as never);
    expect(res.status).toBe(400);
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it('returns 400 when items is not an array', async () => {
    mockRequireSession.mockReturnValue({
      session: { ...EMPTY_SESSION } as never,
      sessionId: 'sess-1',
    });

    const res = await POST(makeRequest({ items: 'not-array' }) as never);
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session cookie is present', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'No session' }, { status: 401 }),
    );

    const res = await POST(makeRequest({ items: [{ commodity: 'Coal' }] }) as never);
    expect(res.status).toBe(401);
  });

  it('appends new cargoes to existing session parsedCargos', async () => {
    const existingCargo = { emailId: 'old-1', itemIndex: 0 } as ParsedCargo;
    mockRequireSession.mockReturnValue({
      session: { ...EMPTY_SESSION, parsedCargos: [existingCargo] } as never,
      sessionId: 'sess-2',
    });

    const res = await POST(
      makeRequest({ items: [{ commodity: 'Sugar', quantityMt: 20000 }] }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.added).toBe(1);

    const [, updates] = mockUpdateSession.mock.calls[0];
    const cargoes = (updates as { parsedCargos: ParsedCargo[] }).parsedCargos;
    expect(cargoes).toHaveLength(2);
    expect(cargoes[0].emailId).toBe('old-1');
    expect(cargoes[1].cargoDescription?.value).toBe('Sugar');
  });
});
