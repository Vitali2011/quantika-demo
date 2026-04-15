jest.mock('@/lib/session', () => ({
  getSessionCount: jest.fn().mockReturnValue(7),
}));

import { GET } from '@/app/api/health/route';
import { getSessionCount } from '@/lib/session';

const mockedGetSessionCount = getSessionCount as jest.MockedFunction<typeof getSessionCount>;

describe('GET /api/health', () => {
  it('status-200: returns HTTP 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('status-ok: body.status equals "ok"', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('sessions-field: body.sessions equals mocked getSessionCount() value', async () => {
    mockedGetSessionCount.mockReturnValue(7);
    const response = await GET();
    const body = await response.json();
    expect(body.sessions).toBe(7);
  });

  it('uptime-field: body.uptime is a number >= 0', async () => {
    const response = await GET();
    const body = await response.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('version-field: body.version equals "0.1.0"', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.version).toBe('0.1.0');
  });

  it('no-auth: handler without cookies returns 200, not 401', async () => {
    // GET handler requires no cookies — invoke without any request context
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.status).not.toBe(401);
  });
});
