/**
 * Regression tests: Extension draft route — input sanitization
 * BUG-D2 (XSS), BUG-D3 (CRLF), BUG-D4 (length limits), BUG-A1-2 (rawBody null)
 *
 * TDD order: write RED first, implement GREEN, commit.
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks (same pattern as test_api_contracts_adv.test.ts)
// ---------------------------------------------------------------------------

jest.mock('@/lib/session-store', () => {
  const sessions = new Map<string, object>();
  return {
    getStore: () => ({
      getSession: (id: string) => sessions.get(id) ?? null,
      createSession: (token: string) => {
        const id = `sess-${token}`;
        sessions.set(id, {
          id,
          accessToken: token,
          createdAt: new Date(),
          emails: [],
          classifications: [],
          processedEmails: [],
          parsedCargos: [],
          parsedVessels: [],
          parsedFixtureRecaps: [],
          matches: [],
          recaps: [],
          commissionSummary: null,
          counterparties: [],
        });
        return id;
      },
      expireOldSessions: () => {},
      getSessionCount: () => sessions.size,
    }),
  };
});

jest.mock('@/lib/migrations/runner', () => ({ runMigrations: jest.fn() }));
jest.mock('@/lib/migrations/index', () => ({ allMigrations: [] }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  url: string,
  options: {
    method?: string;
    cookies?: Record<string, string>;
    body?: string | null;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.cookies && Object.keys(options.cookies).length > 0) {
    headers['cookie'] = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  return new NextRequest(url, {
    method: options.method ?? 'POST',
    headers,
    body: options.body ?? undefined,
  });
}

const baseCargo = {
  emailId: 'e1',
  originPort: 'Dubai',
  destinationPort: 'Rotterdam',
  cargoDescription: 'Steel coils',
  weightMt: 5000,
  laycan: '2026-06-01/2026-06-07',
};

// ---------------------------------------------------------------------------
// Route + session
// ---------------------------------------------------------------------------

const { POST } = require('@/app/api/extension/draft/route') as {
  POST: (req: NextRequest) => Promise<Response>;
};

const { getStore } = require('@/lib/session-store') as {
  getStore: () => { createSession: (t: string) => string };
};

let sessionId: string;

beforeAll(() => {
  sessionId = getStore().createSession('token-stab04');
});

async function postDraft(payload: Record<string, unknown>): Promise<{ res: Response; body: unknown }> {
  const req = makeRequest('http://localhost/api/extension/draft', {
    method: 'POST',
    cookies: { session_id: sessionId },
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req);
  let body: unknown;
  try { body = await res.json(); } catch { body = null; }
  return { res, body };
}

// ---------------------------------------------------------------------------
// D2 — XSS in subject
// ---------------------------------------------------------------------------

describe('BUG-D2 — XSS in subject field', () => {
  test('script tag in subject must be stripped from response', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: '<script>alert(1)</script>Safe Subject',
    });
    // Route must either reject (400) or strip the dangerous tag
    if (res.status === 200) {
      const json = body as { subject?: string };
      expect(json.subject).toBeDefined();
      expect(json.subject).not.toContain('<script>');
      expect(json.subject).not.toContain('</script>');
    } else {
      expect(res.status).toBe(400);
    }
  });

  test('onclick attribute in subject must be stripped', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: '<img onclick="evil()" src="x">Subject',
    });
    if (res.status === 200) {
      const json = body as { subject?: string };
      expect(json.subject).toBeDefined();
      expect(json.subject).not.toMatch(/onclick\s*=/i);
    } else {
      expect(res.status).toBe(400);
    }
  });

  test('javascript: URI in subject must be stripped', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: '<a href="javascript:evil()">click</a>',
    });
    if (res.status === 200) {
      const json = body as { subject?: string };
      expect(json.subject).toBeDefined();
      expect(json.subject).not.toMatch(/javascript:/i);
    } else {
      expect(res.status).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// D3 — CRLF injection in subject
// ---------------------------------------------------------------------------

describe('BUG-D3 — CRLF injection in subject', () => {
  test('CR in subject must be replaced with space', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: 'Good Subject\rX-Injected: header',
    });
    if (res.status === 200) {
      const json = body as { subject?: string };
      expect(json.subject).toBeDefined();
      expect(json.subject).not.toMatch(/\r/);
    } else {
      expect(res.status).toBe(400);
    }
  });

  test('LF in subject must be replaced with space', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: 'Good Subject\nX-Injected: header',
    });
    if (res.status === 200) {
      const json = body as { subject?: string };
      expect(json.subject).toBeDefined();
      expect(json.subject).not.toMatch(/\n/);
    } else {
      expect(res.status).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// D4 — Length limits
// ---------------------------------------------------------------------------

describe('BUG-D4 — Length limits', () => {
  test('subject > 200 chars must return 400', async () => {
    const longSubject = 'S'.repeat(201);
    const { res } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: longSubject,
    });
    expect(res.status).toBe(400);
    // Status 200 with 201-char subject = BUG-D4 confirmed
  });

  test('subject exactly 200 chars must be accepted', async () => {
    const exactSubject = 'S'.repeat(200);
    const { res } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      subject: exactSubject,
    });
    expect(res.status).toBe(200);
  });

  test('body > 50_000 chars must return 400', async () => {
    const longBody = 'B'.repeat(50_001);
    const { res } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      body: longBody,
    });
    expect(res.status).toBe(400);
  });

  test('body exactly 50_000 chars must be accepted', async () => {
    const exactBody = 'B'.repeat(50_000);
    const { res } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'TestBroker',
      body: exactBody,
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Happy path — valid payload must return 200
// ---------------------------------------------------------------------------

describe('Happy path', () => {
  test('valid payload without subject/body → 200 with draftText', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'John Smith',
    });
    expect(res.status).toBe(200);
    const json = body as { draftText: string };
    expect(typeof json.draftText).toBe('string');
    expect(json.draftText.length).toBeGreaterThan(0);
  });

  test('valid payload with clean subject and body → 200', async () => {
    const { res, body } = await postDraft({
      parsedCargo: baseCargo,
      vesselId: 'v-1',
      brokerName: 'John Smith',
      subject: 'Cargo offer for Steel coils',
      body: 'Please find below our competitive offer for the described cargo.',
    });
    expect(res.status).toBe(200);
    const json = body as { draftText: string; subject?: string; body?: string };
    expect(typeof json.draftText).toBe('string');
    // Sanitized subject and body should be echoed back
    expect(json.subject).toBe('Cargo offer for Steel coils');
    expect(json.body).toBe('Please find below our competitive offer for the described cargo.');
  });
});

// ---------------------------------------------------------------------------
// BUG-A1-2 — null/empty request body → 400 (no crash)
// ---------------------------------------------------------------------------

describe('BUG-A1-2 — null request body must not crash', () => {
  test('POST with no body → 400 (not 500)', async () => {
    const req = makeRequest('http://localhost/api/extension/draft', {
      method: 'POST',
      cookies: { session_id: sessionId },
      body: null,
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(500);
  });

  test('POST with literal null body → 400', async () => {
    const req = makeRequest('http://localhost/api/extension/draft', {
      method: 'POST',
      cookies: { session_id: sessionId },
      body: 'null',
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req);
    // null JSON parses OK but fails isValidDraftBody → 400
    expect(res.status).toBe(400);
  });
});
