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

  it('ts-iso8601: body.ts is a valid ISO 8601 timestamp', async () => {
    const response = await GET();
    const body = await response.json();
    expect(new Date(body.ts).toISOString()).toBe(body.ts);
  });

  it('no-auth: handler without cookies returns 200, not 401', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.status).not.toBe(401);
  });
});
