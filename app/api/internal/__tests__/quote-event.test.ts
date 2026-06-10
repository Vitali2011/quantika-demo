import { POST } from '@/app/api/internal/quote-event/route';
import { NextRequest } from 'next/server';

const SECRET = 'test-secret';
beforeAll(() => { process.env.INTERNAL_EVENT_TOKEN = SECRET; });

function req(body: unknown, token?: string) {
  return new NextRequest('http://localhost/api/internal/quote-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) },
    body: JSON.stringify(body),
  });
}

it('401s without the internal token', async () => {
  const r = await POST(req({ sessionId: 's1', job: { id: 'j1', status: 'done', email_id: 'e1' } }));
  expect(r.status).toBe(401);
});

it('202s and emits with a valid token', async () => {
  const r = await POST(req({ sessionId: 's1', job: { id: 'j1', status: 'done', email_id: 'e1' } }, SECRET));
  expect(r.status).toBe(202);
});
