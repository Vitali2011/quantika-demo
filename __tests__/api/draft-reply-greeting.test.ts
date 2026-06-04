/**
 * #812 — draft-reply MUST NOT inject "CONTACT N" alias into the Client-name
 * line of the user prompt. Real sender names pass through.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/csrf', () => ({ validateCsrf: jest.fn(() => true) }));
jest.mock('@/lib/session', () => ({ requireSession: jest.fn() }));
jest.mock('@/lib/ai-provider', () => ({
  callAiText: jest.fn(async () => 'Dear Sir/Madam,\n\nFollow-up.\n\nRegards'),
}));

import { requireSession } from '@/lib/session';
import { callAiText } from '@/lib/ai-provider';
import { POST } from '@/app/api/ai/draft-reply/route';

const mockRequireSession = requireSession as jest.Mock;
const mockCallAiText = callAiText as jest.Mock;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/draft-reply', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function sessionWith(email: { from: string; fromName: string | null }) {
  return {
    emails: [{ id: 'e1', subject: 'Re: Inquiry', body: '', snippet: '', date: '2026-06-04', fromEmail: email.from, ...email }],
    parsedCargos: [{ emailId: 'e1', itemIndex: 0, missingInfo: ['weight'] }],
  };
}

describe('POST /api/ai/draft-reply — greeting #812', () => {
  beforeEach(() => {
    mockCallAiText.mockClear();
    mockRequireSession.mockReset();
  });

  async function post(email: { from: string; fromName: string | null }) {
    mockRequireSession.mockReturnValue({ session: sessionWith(email), sessionId: 'sid' });
    const res = await POST(makeReq({ emailId: 'e1' }));
    expect(res.status).toBe(200);
    const calls = mockCallAiText.mock.calls as unknown[][];
    const userPrompt = calls[0]?.[2] as string;
    return userPrompt;
  }

  it('replaces CONTACT N fromName with Sir/Madam on the client-name line', async () => {
    const prompt = await post({ fromName: 'CONTACT 1', from: 'contact1@demo.local' });
    const nameLine = prompt.split('\n').find(l => l.startsWith('Client name:')) ?? '';
    expect(nameLine).toMatch(/Sir\/Madam/);
    expect(nameLine).not.toMatch(/CONTACT/i);
    expect(nameLine).not.toMatch(/contact\d+/i);
  });

  it('replaces contactN email local-part with Sir/Madam when fromName is empty', async () => {
    const prompt = await post({ fromName: null, from: 'contact2@demo.local' });
    const nameLine = prompt.split('\n').find(l => l.startsWith('Client name:')) ?? '';
    expect(nameLine).toMatch(/Sir\/Madam/);
    expect(nameLine).not.toMatch(/contact\d+/i);
  });

  it('passes a real sender name through unchanged', async () => {
    const prompt = await post({ fromName: 'Alice Cooper', from: 'alice@acme.com' });
    const nameLine = prompt.split('\n').find(l => l.startsWith('Client name:')) ?? '';
    expect(nameLine).toBe('Client name: Alice Cooper');
  });
});
