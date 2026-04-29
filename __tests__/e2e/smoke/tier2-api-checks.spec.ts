import { test, expect } from '@playwright/test';

test.describe('Tier 2 — Wave α API endpoints', () => {
  test('Market benchmark responds (200 or graceful 503)', async ({ request }) => {
    const res = await request.get('/api/market/benchmark?indicator=TOEPFER_TMI');
    expect([200, 503]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('indicator');
    }
  });

  test('Audit API is auth-gated — must not 404', async ({ request }) => {
    const res = await request.get('/api/audit?inquiryId=sample-01');
    // Route must exist (200 empty/401/403 all valid — 404 means route missing)
    expect(res.status()).not.toBe(404);
    expect([200, 401, 403]).toContain(res.status());
  });

  test('Economics API route exists — must not 404', async ({ request }) => {
    const res = await request.post('/api/economics', {
      data: {
        route: { fromPort: 'Istanbul', toPort: 'Lagos' },
        vessel: { dwt: 12500, speed: 12 },
      },
    });
    // 200/400/401/403/503 all mean the route exists
    expect(res.status()).not.toBe(404);
    expect([200, 400, 401, 403, 503]).toContain(res.status());
  });
});
