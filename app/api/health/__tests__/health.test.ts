import { GET } from '../route';

jest.mock('@/lib/session', () => ({
  getSessionCount: jest.fn(() => 3),
}));

describe('GET /api/health', () => {
  it('returns HTTP 200', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('returns status: ok', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('returns sessions equal to mocked getSessionCount()', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.sessions).toBe(3);
  });

  it('returns uptime as a positive number', async () => {
    const response = await GET();
    const body = await response.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns version: 0.1.0', async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.version).toBe('0.1.0');
  });
});
