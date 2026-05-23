/**
 * Tests for POST /api/extension/draft
 *
 * Auth gate (requireSession → 401), missing fields → 400,
 * happy-path returns draftText, length cap enforcement (subject/body).
 */
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/extensions/gmail/inserts/sanitize', () => ({
  sanitizeForCompose: jest.fn((html: string) => html),
}));

import { requireSession } from '@/lib/session';
const mockRequireSession = requireSession as jest.Mock;

const validCargo = {
  emailId: 'msg-1',
  itemIndex: 0,
  originPort: 'Rotterdam',
  destinationPort: 'Singapore',
  cargoDescription: 'Iron ore',
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/extension/draft', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/extension/draft', () => {
  beforeEach(() => {
    mockRequireSession.mockReturnValue({
      sessionId: 'sid-test',
      session: {},
    });
  });

  it('returns 401 when requireSession returns a 401 response', async () => {
    mockRequireSession.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const { POST } = await import('@/app/api/extension/draft/route');
    const res = await POST(makeReq({ parsedCargo: validCargo, vesselId: 'v1', brokerName: 'Acme' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const res = await POST(makeReq({ parsedCargo: validCargo }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/required/i);
  });

  it('returns 200 with draftText on valid payload', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const res = await POST(
      makeReq({ parsedCargo: validCargo, vesselId: 'v1', brokerName: 'Acme Shipping' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.draftText).toBe('string');
    expect(json.draftText).toContain('Acme Shipping');
  });

  it('returns 400 when subject exceeds 200 chars', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const res = await POST(
      makeReq({
        parsedCargo: validCargo,
        vesselId: 'v1',
        brokerName: 'Acme',
        subject: 'x'.repeat(201),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/subject too long/i);
  });

  it('returns 400 when email body exceeds 50 000 chars', async () => {
    const { POST } = await import('@/app/api/extension/draft/route');
    const res = await POST(
      makeReq({
        parsedCargo: validCargo,
        vesselId: 'v1',
        brokerName: 'Acme',
        body: 'x'.repeat(50_001),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/body too long/i);
  });
});
