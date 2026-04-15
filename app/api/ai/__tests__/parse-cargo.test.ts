import { POST } from '../parse-cargo/route';
import { getSession, updateSession } from '@/lib/session';
import { callAiJson } from '@/lib/openai';

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/openai', () => ({
  callAiJson: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: unknown, init?: { status?: number }) => ({
      _data: data,
      _status: init?.status ?? 200,
    })),
  },
  NextRequest: class {},
}));

const mockGetSession = getSession as jest.Mock;
const mockUpdateSession = updateSession as jest.Mock;
const mockCallAiJson = callAiJson as jest.Mock;

import { NextResponse } from 'next/server';
const mockJsonResponse = NextResponse.json as jest.Mock;

function makeRequest(sessionId?: string) {
  return {
    cookies: {
      get: (name: string) =>
        name === 'session_id' && sessionId ? { value: sessionId } : undefined,
    },
  };
}

function makeEmail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    threadId: 'thread-1',
    from: 'shipper@cargo.com',
    fromName: 'Shipper',
    fromEmail: 'shipper@cargo.com',
    to: 'broker@mine.com',
    subject: 'Cargo Inquiry',
    date: new Date().toISOString(),
    body: '10,000 MT steel from Rotterdam to Hamburg, laycan Jan 2025',
    snippet: 'Steel cargo inquiry',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parse-cargo route — auth & session guards', () => {
  it('returns 401 when no session cookie', async () => {
    await POST(makeRequest() as never);
    expect(mockJsonResponse).toHaveBeenCalledWith({ error: 'No session' }, { status: 401 });
  });

  it('returns 401 when session not found', async () => {
    mockGetSession.mockReturnValue(null);
    await POST(makeRequest('sess-123') as never);
    expect(mockJsonResponse).toHaveBeenCalledWith(
      { error: 'Session expired' },
      { status: 401 },
    );
  });

  it('returns count:0 when no CARGO_INQUIRY emails in session', async () => {
    mockGetSession.mockReturnValue({
      emails: [makeEmail('e1')],
      classifications: [{ emailId: 'e1', category: 'VESSEL_POSITION' }],
    });

    await POST(makeRequest('sess-123') as never);

    expect(mockUpdateSession).toHaveBeenCalledWith('sess-123', { parsedCargos: [] });
    expect(mockJsonResponse).toHaveBeenCalledWith({ count: 0 });
  });
});

describe('parse-cargo route — parsing logic', () => {
  it('parses a cargo email into a ParsedCargo item', async () => {
    const email = makeEmail('e1');
    mockGetSession.mockReturnValue({
      emails: [email],
      classifications: [{ emailId: 'e1', category: 'CARGO_INQUIRY' }],
    });
    mockCallAiJson.mockResolvedValue({
      items: [
        {
          origin_port: 'Rotterdam',
          destination_port: 'Hamburg',
          cargo_description: 'Steel coils',
          weight_mt: 10000,
          cargo_type: 'BULK',
        },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.parsedCargos).toHaveLength(1);
    expect(update.parsedCargos[0].emailId).toBe('e1');
    expect(update.parsedCargos[0].itemIndex).toBe(0);
    expect(update.parsedCargos[0].cargoType).toBe('BULK');
  });

  it('wraps plain string fields in ConfidenceField with confirmed', async () => {
    const email = makeEmail('e1');
    mockGetSession.mockReturnValue({
      emails: [email],
      classifications: [{ emailId: 'e1', category: 'CARGO_INQUIRY' }],
    });
    mockCallAiJson.mockResolvedValue({
      items: [
        {
          origin_port: 'Rotterdam',
          cargo_description: 'Iron ore',
          cargo_type: 'BULK',
        },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    const cargo = update.parsedCargos[0];
    expect(cargo.originPort).toEqual({
      value: 'Rotterdam',
      confidence: 'confirmed',
      sourceText: undefined,
    });
  });

  it('preserves confidence from AI object fields', async () => {
    const email = makeEmail('e1');
    mockGetSession.mockReturnValue({
      emails: [email],
      classifications: [{ emailId: 'e1', category: 'CARGO_INQUIRY' }],
    });
    mockCallAiJson.mockResolvedValue({
      items: [
        {
          origin_port: { value: 'Antwerp', confidence: 'interpreted', source_text: 'load port Antwerp' },
          cargo_type: 'BULK',
        },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.parsedCargos[0].originPort).toEqual({
      value: 'Antwerp',
      confidence: 'interpreted',
      sourceText: 'load port Antwerp',
    });
  });

  it('handles null/missing fields gracefully', async () => {
    const email = makeEmail('e1');
    mockGetSession.mockReturnValue({
      emails: [email],
      classifications: [{ emailId: 'e1', category: 'CARGO_INQUIRY' }],
    });
    mockCallAiJson.mockResolvedValue({
      items: [{ cargo_type: 'OTHER' }],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    const cargo = update.parsedCargos[0];
    expect(cargo.originPort).toBeNull();
    expect(cargo.destinationPort).toBeNull();
    expect(cargo.cargoDescription).toBeNull();
    expect(cargo.missingInfo).toEqual([]);
  });

  it('parses multiple items from AI response', async () => {
    const email = makeEmail('e1');
    mockGetSession.mockReturnValue({
      emails: [email],
      classifications: [{ emailId: 'e1', category: 'CARGO_INQUIRY' }],
    });
    mockCallAiJson.mockResolvedValue({
      items: [
        { origin_port: 'Rotterdam', cargo_type: 'BULK' },
        { origin_port: 'Hamburg', cargo_type: 'FCL' },
      ],
    });

    await POST(makeRequest('sess-123') as never);

    const [, update] = mockUpdateSession.mock.calls[0];
    expect(update.parsedCargos).toHaveLength(2);
    expect(update.parsedCargos[0].itemIndex).toBe(0);
    expect(update.parsedCargos[1].itemIndex).toBe(1);
    expect(mockJsonResponse).toHaveBeenCalledWith({ count: 2 });
  });
});
