/**
 * β-05 — POST /api/voyage/tce integration test.
 * Latency target < 3s. Uses fixture body with pre-resolved canal/DA values
 * to avoid DB dependency in CI.
 */

import fs from 'fs';
import path from 'path';
import { POST } from '@/app/api/voyage/tce/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/voyage/tce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/voyage/tce', () => {
  it('returns valid breakdown JSON within SLA', async () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'tests', 'fixtures', 'voyage-tce', 'antwerp-singapore-cape.json'),
        'utf8',
      ),
    );
    const t0 = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest(fixture.input) as any);
    const dt = Date.now() - t0;
    const json = await res.json();
    expect({
      status: res.status,
      hasBreakdown: typeof json.breakdown === 'object' && json.breakdown !== null,
      dailyTceMatches: json.daily_tce_usd === fixture.expected.daily_tce_usd,
      withinSla: dt < 3000,
    }).toEqual({ status: 200, hasBreakdown: true, dailyTceMatches: true, withinSla: true });
  });

  it('rejects invalid body with 400', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(makeRequest({ wrong: 'shape' }) as any);
    expect(res.status).toBe(400);
  });
});
