/**
 * BUG-β-stab-04-XSSBypass — blacklist sanitizer in extension/draft is bypassable.
 * Replace with sanitize-html allow-list parser.
 *
 * RED inputs taken straight from findings file.
 */

import { NextRequest } from 'next/server';

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

function makeRequest(url: string, body: string, sid: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { cookie: `session_id=${sid}`, 'content-type': 'application/json' },
    body,
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

const { POST } = require('@/app/api/extension/draft/route') as {
  POST: (req: NextRequest) => Promise<Response>;
};
const { getStore } = require('@/lib/session-store') as {
  getStore: () => { createSession: (t: string) => string };
};

let sid: string;
beforeAll(() => {
  sid = getStore().createSession('tok-stab04-bypass');
});

async function send(field: 'subject' | 'body', value: string): Promise<{ subject?: string; body?: string }> {
  const payload: Record<string, unknown> = {
    parsedCargo: baseCargo,
    vesselId: 'v-1',
    brokerName: 'B',
    [field]: value,
  };
  const req = makeRequest(
    'http://localhost/api/extension/draft',
    JSON.stringify(payload),
    sid,
  );
  const res = await POST(req);
  return (await res.json()) as { subject?: string; body?: string };
}

describe('BUG-β-stab-04 — sanitize-html allow-list', () => {
  it('strips <iframe> from body', async () => {
    const out = await send('body', '<iframe src="//evil"></iframe>hi');
    expect(out.body).toBeDefined();
    expect(out.body!.toLowerCase()).not.toContain('<iframe');
  });

  it('strips <object>/<embed>/<style> from body', async () => {
    const out = await send(
      'body',
      '<object data="x"></object><embed src="x"><style>body{}</style>ok',
    );
    const lc = out.body!.toLowerCase();
    expect(lc).not.toContain('<object');
    expect(lc).not.toContain('<embed');
    expect(lc).not.toContain('<style');
  });

  it('strips <img/onerror> slash-form from body', async () => {
    const out = await send('body', '<img/onerror=alert(1) src=x>');
    expect(out.body!.toLowerCase()).not.toContain('onerror');
  });

  it('strips entity-encoded javascript: URIs from body', async () => {
    const out = await send('body', '<a href="&#106;avascript:alert(1)">x</a>');
    expect(out.body!.toLowerCase()).not.toMatch(/javascript:/);
  });

  it('strips CRLF-broken javascript: scheme from body', async () => {
    const out = await send('body', '<a href="JAVA\nSCRIPT:alert(1)">x</a>');
    // After sanitize-html, href with that scheme is rejected entirely.
    expect(out.body!.toLowerCase()).not.toMatch(/javascript:/);
  });
});
