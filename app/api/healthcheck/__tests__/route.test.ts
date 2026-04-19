import { GET } from '@/app/api/healthcheck/route';

describe('GET /api/healthcheck', () => {
  it('status-200: returns HTTP 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('status-ok: body.status equals "ok"', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('ts-field: body.ts is a valid ISO 8601 timestamp', async () => {
    const response = await GET();
    const body = await response.json();
    expect(typeof body.ts).toBe('string');
    // Must contain 'T' separator (ISO 8601)
    expect(body.ts).toContain('T');
    // Must end with 'Z' (UTC) or contain timezone offset
    expect(body.ts).toMatch(/Z$|[+-]\d{2}:\d{2}$/);
    // new Date() must parse it as a valid date
    const parsed = new Date(body.ts);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });

  it('contract: response body contains ONLY status and ts fields', async () => {
    const response = await GET();
    const body = await response.json();
    const keys = Object.keys(body).sort();
    expect(keys).toEqual(['status', 'ts']);
  });

  it('no-auth: handler works without session_id cookie (no 401)', async () => {
    // GET requires no request context — call directly without arguments
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
