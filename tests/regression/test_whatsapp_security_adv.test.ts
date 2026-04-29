/**
 * Adversarial Security Tests — Agent A Phase 3
 * Attacks: ATTACK-1, ATTACK-3, ATTACK-7, ATTACK-11
 *
 * RULES:
 * - Never edits feature code
 * - Bugs documented in .test-review/findings.md
 */

import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../../lib/whatsapp/signature';

// ─────────────────────────────────────────────────────────────────────────────
// ATTACK-1: WhatsApp signature.ts — adversarial edge cases
// ─────────────────────────────────────────────────────────────────────────────

function makeSignature(body: string, secret: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

describe('ATTACK-1 — verifyWebhookSignature adversarial edge cases', () => {

  // A1-V1: empty appSecret — already rejected by `!appSecret` guard
  describe('V1: empty appSecret bypass', () => {
    test('empty appSecret with attacker-crafted HMAC-empty-key → false', () => {
      const body = 'payload={"id":1}';
      const attackerSig = makeSignature(body, '');
      // Guard: `!appSecret` returns false before HMAC is computed
      expect(verifyWebhookSignature(body, attackerSig, '')).toBe(false);
    });

    test('empty appSecret + empty body + valid HMAC-empty-key → false', () => {
      const attackerSig = makeSignature('', '');
      expect(verifyWebhookSignature('', attackerSig, '')).toBe(false);
    });

    test('empty appSecret with sha256= prefix only → false', () => {
      expect(verifyWebhookSignature('payload', 'sha256=', '')).toBe(false);
    });
  });

  // A1-V2: undefined appSecret coercion — JS coerces undefined to string "undefined"
  //        This is a CRITICAL vector: `createHmac('sha256', undefined)` throws in Node
  //        but `!appSecret` guard with string "undefined" might not catch it if
  //        TypeScript caller bypasses type safety (e.g., JSON.parse from env var).
  describe('V2: undefined/null appSecret coercion', () => {
    test('undefined appSecret (type-cast bypass) → false, not throw', () => {
      const body = 'payload';
      // Simulate env var not set → process.env returns undefined → cast to string
      // The route does: `process.env.WHATSAPP_APP_SECRET ?? ''` so it becomes ''
      // But direct callers might pass undefined without ?? fallback
      const result = verifyWebhookSignature(body, 'sha256=abc', undefined as unknown as string);
      // Should be false (guard catches !appSecret for undefined/falsy)
      expect(result).toBe(false);
    });

    test('null appSecret (type-cast bypass) → false, not throw', () => {
      const body = 'payload';
      const result = verifyWebhookSignature(body, 'sha256=abc', null as unknown as string);
      expect(result).toBe(false);
    });
  });

  // A1-V3: null rawBody — function signature says string but callers may pass null
  describe('V3: null/undefined rawBody', () => {
    test('null rawBody → false, not throw', () => {
      const secret = 'real-secret';
      const sig = makeSignature('', secret);
      const result = verifyWebhookSignature(null as unknown as string, sig, secret);
      // createHmac('sha256', secret).update(null) will throw in Node 18+
      // The function has no guard for rawBody being null/undefined
      // Expected: should NOT throw, should return false
      expect(result).toBe(false);
    });

    test('undefined rawBody → false, not throw', () => {
      const secret = 'real-secret';
      const result = verifyWebhookSignature(
        undefined as unknown as string,
        'sha256=abc',
        secret,
      );
      expect(result).toBe(false);
    });
  });

  // A1-V4: length-extension / padding attack — signature longer than expected
  describe('V4: length-extension / padding', () => {
    test('signature with appended padding → false', () => {
      const body = 'payload=test';
      const secret = 'real-secret';
      const validSig = makeSignature(body, secret);
      // Append padding — different length → timingSafeEqual throws → catch → false
      const paddedSig = validSig + 'aaaaaaaaaaaa';
      expect(verifyWebhookSignature(body, paddedSig, secret)).toBe(false);
    });

    test('signature with prepended garbage → false', () => {
      const body = 'payload=test';
      const secret = 'real-secret';
      const validSig = makeSignature(body, secret);
      const prependedSig = 'garbage' + validSig;
      expect(verifyWebhookSignature(body, prependedSig, secret)).toBe(false);
    });

    test('sha256=<correct_hex><correct_hex> (doubled hex) → false', () => {
      const body = 'payload';
      const secret = 'secret';
      const hex = createHmac('sha256', secret).update(body).digest('hex');
      const doubledSig = `sha256=${hex}${hex}`;
      expect(verifyWebhookSignature(body, doubledSig, secret)).toBe(false);
    });
  });

  // A1-V5: missing X-Hub-Signature-256 header → empty string passed
  describe('V5: missing signature header', () => {
    test('empty signature string → false (no header)', () => {
      // Simulates req.headers.get('x-hub-signature-256') returning null → ?? '' → ''
      const body = '{"object":"whatsapp_business_account"}';
      const secret = 'real-secret';
      expect(verifyWebhookSignature(body, '', secret)).toBe(false);
    });

    test('whitespace-only signature → false', () => {
      const body = 'payload';
      const secret = 'secret';
      // '   ' is truthy, so guard passes. timingSafeEqual will fail on different lengths.
      expect(verifyWebhookSignature(body, '   ', secret)).toBe(false);
    });
  });

  // A1-V6: raw hex without "sha256=" prefix
  describe('V6: prefix-stripped raw hex', () => {
    test('raw hex (no sha256= prefix) → false', () => {
      const body = 'payload';
      const secret = 'secret';
      const hex = createHmac('sha256', secret).update(body).digest('hex');
      // Length will differ from "sha256=<hex>" (7 chars shorter) → timingSafeEqual throws → false
      expect(verifyWebhookSignature(body, hex, secret)).toBe(false);
    });

    test('"SHA256=<correcthex>" uppercase prefix → false', () => {
      const body = 'test';
      const secret = 'secret';
      const hex = createHmac('sha256', secret).update(body).digest('hex');
      // Same length as "sha256=<hex>" — timingSafeEqual runs but fails (S vs s)
      expect(verifyWebhookSignature(body, `SHA256=${hex}`, secret)).toBe(false);
    });
  });

  // A1-V7: replay attack — no nonce/timestamp prevents replay by design
  //        These tests document the KNOWN LIMITATION (by design, not a crash bug)
  describe('V7: replay attack (known limitation)', () => {
    test('same valid signature presented twice → both return true (replay possible)', () => {
      // This documents that the implementation has NO replay prevention.
      // A valid webhook can be replayed indefinitely.
      // This is a MEDIUM risk — acceptable if Meta ensures timestamp freshness upstream.
      const body = '{"object":"whatsapp_business_account","entry":[]}';
      const secret = 'app-secret';
      const sig = makeSignature(body, secret);
      const first = verifyWebhookSignature(body, sig, secret);
      const second = verifyWebhookSignature(body, sig, secret);
      expect(first).toBe(true);
      expect(second).toBe(true);
      // NOTE: Both are true — replay prevention is absent. Document as finding.
    });
  });

  // Baseline regression — must not regress
  describe('Baseline: correct cases', () => {
    test('valid signature → true', () => {
      const body = '{"message":"hello"}';
      const secret = 'super-secret-123';
      expect(verifyWebhookSignature(body, makeSignature(body, secret), secret)).toBe(true);
    });

    test('tampered body → false', () => {
      const body = '{"message":"hello"}';
      const secret = 'super-secret-123';
      expect(verifyWebhookSignature(body + '!', makeSignature(body, secret), secret)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACK-3: Webhook route — GET verify-token + POST error swallowing
// ─────────────────────────────────────────────────────────────────────────────

// Unit tests mocking Next.js Request — no real server spun up.

function makeNextRequest(url: string, options?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): import('next/server').NextRequest {
  const { NextRequest } = require('next/server') as typeof import('next/server');
  return new NextRequest(url, {
    method: options?.method ?? 'GET',
    headers: options?.headers ?? {},
    body: options?.body,
  });
}

describe('ATTACK-3 — Webhook route GET/POST', () => {
  const VERIFY_TOKEN = 'test-verify-token-123';
  const BASE_URL = 'https://example.com/api/whatsapp/webhook';

  beforeAll(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
  });

  afterAll(() => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
  });

  // GET endpoint tests
  describe('GET — verify-token validation', () => {
    test('A3-V1: GET without hub.verify_token → 403', async () => {
      const { GET } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(`${BASE_URL}?hub.mode=subscribe&hub.challenge=abc`);
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    test('A3-V2: GET with wrong verify_token → 403', async () => {
      const { GET } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(
        `${BASE_URL}?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=testchallenge`,
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    test('A3-V3: GET with correct verify_token → 200 + challenge echoed', async () => {
      const { GET } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(
        `${BASE_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=mychallenge42`,
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('mychallenge42');
    });

    test('A3-V4: GET with correct token but wrong mode → 403', async () => {
      const { GET } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(
        `${BASE_URL}?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc`,
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    test('A3-V5: GET with empty hub.verify_token → 403', async () => {
      const { GET } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(
        `${BASE_URL}?hub.mode=subscribe&hub.verify_token=&hub.challenge=abc`,
      );
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    test('A3-V6: GET with no hub.challenge → 403 (missing required param)', async () => {
      const { GET } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(
        `${BASE_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}`,
      );
      const res = await GET(req);
      // challenge is required per source: `&& challenge` check
      expect(res.status).toBe(403);
    });
  });

  // POST endpoint tests
  describe('POST — error swallowing and invalid JSON', () => {
    test('A3-V7: POST without valid signature → 401', async () => {
      const { POST } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=invalidsig',
        },
        body: '{"object":"whatsapp_business_account","entry":[]}',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    test('A3-V8: POST with invalid JSON body (valid signature) → 200 not crash', async () => {
      // Source: JSON.parse failure returns 200 (fire-and-forget, Meta needs 200 fast)
      // FINDING: invalid JSON is silently swallowed → returns 200 (by design but risky)
      const { POST } = await import('../../app/api/whatsapp/webhook/route');
      const appSecret = process.env.WHATSAPP_APP_SECRET ?? '';
      const invalidJsonBody = 'this is not json {{{';
      const sig = makeSignature(invalidJsonBody, appSecret);
      const req = makeNextRequest(BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'x-hub-signature-256': sig,
        },
        body: invalidJsonBody,
      });
      const res = await POST(req);
      // Per source: JSON.parse failure → returns 200 (error swallowed)
      // This is a FINDING: invalid JSON body with valid sig → 200 (no error to caller)
      expect([200, 400, 500]).toContain(res.status);
    });

    test('A3-V9: POST with completely empty body → should not crash', async () => {
      const { POST } = await import('../../app/api/whatsapp/webhook/route');
      const appSecret = process.env.WHATSAPP_APP_SECRET ?? '';
      const emptyBody = '';
      const sig = makeSignature(emptyBody, appSecret);
      const req = makeNextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'x-hub-signature-256': sig },
        body: emptyBody,
      });
      const res = await POST(req);
      // Should not throw — must return a response
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    test('A3-V10: POST with no x-hub-signature-256 header → 401', async () => {
      const { POST } = await import('../../app/api/whatsapp/webhook/route');
      const req = makeNextRequest(BASE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"object":"whatsapp_business_account","entry":[]}',
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACK-7: OpenSanctions — boundary, network failure, IMO ignored
// ─────────────────────────────────────────────────────────────────────────────

describe('ATTACK-7 — checkVesselSanctions boundary + failure modes', () => {
  // Mock DB layer so cache is always miss
  beforeEach(() => {
    jest.resetModules();
    jest.mock('../../lib/session-store', () => ({
      getStore: () => ({ getDatabase: () => null }),
    }));
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
  });

  function makeOsResponse(score: number) {
    return {
      responses: {
        'q-0': {
          results: [
            {
              id: 'ofac-test-1',
              caption: 'Test Vessel',
              score,
              datasets: ['us_ofac_sdn'],
              properties: {},
            },
          ],
        },
      },
    };
  }

  // A7-V1: Score exactly 0.85 → boundary (>= 0.85 or > 0.85?)
  // Source: `m.score >= SANCTION_THRESHOLD` where SANCTION_THRESHOLD = 0.85
  test('A7-V1: score exactly 0.85 → sanctioned=true (>= boundary)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(makeOsResponse(0.85)), { status: 200 }),
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    const result = await checkVesselSanctions('Test Vessel');
    // Score 0.85 >= 0.85 → blocked
    expect(result.sanctioned).toBe(true);
  });

  // A7-V2: Score 0.849 → pass
  test('A7-V2: score 0.849 → sanctioned=false (below threshold)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(makeOsResponse(0.849)), { status: 200 }),
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    const result = await checkVesselSanctions('Test Vessel');
    expect(result.sanctioned).toBe(false);
  });

  // A7-V3: Score 0.851 → block
  test('A7-V3: score 0.851 → sanctioned=true', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(makeOsResponse(0.851)), { status: 200 }),
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    const result = await checkVesselSanctions('Test Vessel');
    expect(result.sanctioned).toBe(true);
  });

  // A7-V4: Network timeout → should fail CLOSED (sanctioned=false is a false negative)
  //         Source: catch block returns [] → positiveMatches=[] → sanctioned=false
  //         This is FAIL OPEN — a network failure returns "not sanctioned"!
  test('A7-V4: network timeout → returns sanctioned=false (fail-open — FINDING)', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout'));
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    const result = await checkVesselSanctions('Some Vessel');
    // This reveals FAIL-OPEN behavior: network failure → sanctioned=false
    // A blocked vessel could pass if the API is unreachable
    expect(result.sanctioned).toBe(false); // documents current (buggy) behavior
    // The correct behavior should throw or return { sanctioned: true, error: 'unavailable' }
  });

  // A7-V5: Network timeout → does NOT throw (returns gracefully)
  test('A7-V5: network failure → does not throw, returns result object', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    await expect(checkVesselSanctions('Test Vessel')).resolves.toBeDefined();
  });

  // A7-V6: Empty vessel name → does NOT call fetch (cost guard)
  test('A7-V6: empty vessel name → fetch not called, returns not-sanctioned', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    const result = await checkVesselSanctions('');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.sanctioned).toBe(false);
  });

  // A7-V7: whitespace-only vessel name → should be treated as empty (trim check)
  test('A7-V7: whitespace-only vessel name → fetch not called', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    // searchOpenSanctions checks `!name.trim()` but checkVesselSanctions calls
    // searchOpenSanctions(vesselName) — so whitespace-only passes the trim guard
    await checkVesselSanctions('   ');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // A7-V8: IMO parameter is ignored — document this known limitation
  test('A7-V8: imo param provided but ignored — only name is checked (known gap)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(makeOsResponse(0.3)), { status: 200 }), // low score → pass
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    // Even if IMO matches a sanctioned entity, only vessel name score is checked
    // This is a MEDIUM finding — IMO-based lookup reserved for Wave β per source comment
    const result = await checkVesselSanctions('Innocent Ship', 'IMO1234567');
    // Result is based solely on name score (0.3 < 0.85 → not sanctioned)
    expect(result.sanctioned).toBe(false);
    // Documenting: IMO is silently ignored (void imo comment in source)
  });

  // A7-V9: API returns non-200 → returns []
  test('A7-V9: API 500 error → returns sanctioned=false (fail-open)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );
    const { checkVesselSanctions } = await import('../../lib/sanctions/opensanctions');
    const result = await checkVesselSanctions('Sanctioned Ship');
    expect(result.sanctioned).toBe(false); // documents fail-open on HTTP error
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACK-11: Audit log — ownership and deserialization
// ─────────────────────────────────────────────────────────────────────────────

describe('ATTACK-11 — Audit log ownership + JSON deserialization', () => {
  // We test lib/audit.ts directly using an in-memory SQLite DB
  let Database: typeof import('better-sqlite3');
  let db: import('better-sqlite3').Database;

  beforeAll(async () => {
    Database = (await import('better-sqlite3')).default;
    db = new Database(':memory:');
    // Create the audit_events table matching the production schema
    db.exec(`
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        inquiry_id TEXT,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        field TEXT,
        before_value TEXT,
        after_value TEXT,
        reason TEXT
      );
    `);
  });

  afterAll(() => {
    db.close();
  });

  // A11-V1: Ownership check — getAuditTrail by inquiryId returns ALL entries
  //         regardless of sessionId (the ownership check is in the ROUTE, not the lib)
  test('A11-V1: getAuditTrail(inquiryId) returns events regardless of sessionId (lib has no auth)', async () => {
    const { logAuditEvent, getAuditTrail } = await import('../../lib/audit');

    // User A logs an event
    logAuditEvent({
      sessionId: 'session-user-A',
      inquiryId: 'inquiry-001',
      actor: 'user',
      action: 'confirmed',
      field: 'cargo.weight_mt',
    }, db);

    // User B queries same inquiryId — lib returns it (no auth in lib layer)
    const events = getAuditTrail('inquiry-001', db);
    expect(events.length).toBe(1);
    expect(events[0].sessionId).toBe('session-user-A');
    // FINDING: The lib itself does NOT enforce ownership.
    // Protection is at the route layer (audit/route.ts does the sessionId check).
    // If lib is called directly bypassing the route, any inquiry is accessible.
  });

  // A11-V2: payload undefined → logAuditEvent should not crash
  test('A11-V2: event with beforeValue=undefined → no crash, stored as null', async () => {
    const { logAuditEvent } = await import('../../lib/audit');
    const result = logAuditEvent({
      sessionId: 'session-test',
      inquiryId: 'inquiry-002',
      actor: 'ai',
      action: 'parsed',
      beforeValue: undefined,
      afterValue: undefined,
    }, db);
    expect(result.id).toBeTruthy();
    expect(result.timestamp).toBeTruthy();
  });

  // A11-V3: SQL metacharacters in dealId → parameterized query safety check
  test('A11-V3: SQL metacharacters in inquiryId → safe (parameterized query)', async () => {
    const { getAuditTrail } = await import('../../lib/audit');
    const maliciousId = "'; DROP TABLE audit_events; --";
    // Should NOT throw or cause SQL injection — better-sqlite3 uses parameterized queries
    const events = getAuditTrail(maliciousId, db);
    expect(events).toEqual([]); // No results, but no crash/injection
  });

  // A11-V4: SQL metacharacters in sessionId → safe
  test('A11-V4: SQL metacharacters in sessionId for getAuditTrailBySession → safe', async () => {
    const { getAuditTrailBySession } = await import('../../lib/audit');
    const maliciousSession = "'; SELECT * FROM audit_events; --";
    const events = getAuditTrailBySession(maliciousSession, 100, db);
    expect(events).toEqual([]);
  });

  // A11-V5: table still exists after SQL injection attempts (table wasn't dropped)
  test('A11-V5: audit_events table survives SQL injection attempts', async () => {
    const { logAuditEvent } = await import('../../lib/audit');
    // Table should still be intact
    const result = logAuditEvent({
      sessionId: 'survivor-session',
      actor: 'system',
      action: 'sent',
    }, db);
    expect(result.id).toBeTruthy();
  });

  // A11-V6: after_value containing deeply nested JSON → deserializes correctly
  test('A11-V6: deeply nested JSON afterValue → round-trips correctly', async () => {
    const { logAuditEvent, getAuditTrail } = await import('../../lib/audit');
    const complexValue = {
      cargo: { weight_mt: 1500, type: 'BREAKBULK' },
      vessels: [{ imo: '9999999', name: 'Test Ship' }],
      nested: { deep: { deeper: 'value' } },
    };
    logAuditEvent({
      sessionId: 'session-json-test',
      inquiryId: 'inquiry-json-001',
      actor: 'user',
      action: 'overridden',
      field: 'cargo',
      afterValue: complexValue,
    }, db);
    const events = getAuditTrail('inquiry-json-001', db);
    expect(events[0].afterValue).toEqual(complexValue);
  });

  // A11-V7: Cross-session isolation is in the ROUTE layer — verify route enforces it
  //         We test the route's ownership check logic here via mocking
  test('A11-V7: audit route GET rejects cross-session inquiryId access → 403', async () => {
    const { NextRequest } = await import('next/server');

    // Mock requireSession to return session-user-B
    jest.mock('../../lib/session', () => ({
      requireSession: () => ({ sessionId: 'session-user-B' }),
    }));
    // Mock getAuditTrail to return events belonging to session-user-A
    jest.mock('../../lib/audit', () => ({
      ...jest.requireActual('../../lib/audit'),
      getAuditTrail: () => [
        {
          id: 'evt-1',
          timestamp: '2026-04-29T00:00:00Z',
          sessionId: 'session-user-A', // different session!
          inquiryId: 'inquiry-001',
          actor: 'user',
          action: 'confirmed',
        },
      ],
      getAuditTrailBySession: jest.fn(),
      logAuditEvent: jest.fn(),
    }));

    const { GET } = await import('../../app/api/audit/route');
    const req = new NextRequest(
      'https://example.com/api/audit?inquiryId=inquiry-001',
      { method: 'GET' },
    );
    const res = await GET(req);
    // Route should see sessionId mismatch and return 403
    expect(res.status).toBe(403);

    jest.resetModules();
    jest.resetAllMocks();
  });
});
