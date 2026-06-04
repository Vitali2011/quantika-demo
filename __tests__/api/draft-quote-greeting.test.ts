/**
 * #812 — draft-quote MUST NOT inject "CONTACT N" / "contactN" alias into the
 * Address-the-reply-to line of the user prompt. Real sender names pass through.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/csrf', () => ({ validateCsrf: jest.fn(() => true) }));
jest.mock('@/lib/session', () => ({ requireSession: jest.fn() }));

const callAiText = jest.fn(async () => 'Dear Sir/Madam,\n\nDraft.\n\nRegards');
jest.mock('@/lib/ai-provider', () => ({
  callAiText: (...args: unknown[]) => callAiText(...args),
  getProvider: jest.fn(() => 'openai'),
}));

jest.mock('@/lib/knowledge/flags', () => ({
  isRagEnabled: () => false,
  knowledgeBackend: () => 'sqlite',
  ftsTableForSource: (s: string) => `${s}_fts`,
  vecTableForSource: (s: string) => `${s}_vec`,
}));

import { requireSession } from '@/lib/session';
import { POST } from '@/app/api/ai/draft-quote/route';

const mockRequireSession = requireSession as jest.Mock;

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/ai/draft-quote', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function sessionWith(email: { from: string; fromName: string | null }) {
  return {
    emails: [{ id: 'e1', subject: 'Inquiry', body: '', snippet: '', date: '2026-06-04', ...email }],
    parsedCargos: [{ emailId: 'e1', itemIndex: 0, cargoType: 'coal', cargoDescription: { value: 'coal' } }],
  };
}

describe('POST /api/ai/draft-quote — greeting #812', () => {
  beforeEach(() => {
    callAiText.mockClear();
    mockRequireSession.mockReset();
  });

  async function postEmail(email: { from: string; fromName: string | null }) {
    mockRequireSession.mockReturnValue({ session: sessionWith(email), sessionId: 'sid' });
    const res = await POST(makeReq({ emailId: 'e1' }));
    expect(res.status).toBe(200);
    const userPrompt = callAiText.mock.calls[0]?.[2] as string;
    expect(typeof userPrompt).toBe('string');
    return userPrompt;
  }

  it('replaces CONTACT N fromName with Sir/Madam in the address line', async () => {
    const prompt = await postEmail({ fromName: 'CONTACT 1', from: 'contact1@demo.local' });
    const addressLine = prompt.split('\n').find(l => l.startsWith('Address the reply to:')) ?? '';
    expect(addressLine).toMatch(/Sir\/Madam/);
    expect(addressLine).not.toMatch(/CONTACT/i);
    expect(addressLine).not.toMatch(/contact\d+/i);
  });

  it('replaces contactN email local-part with Sir/Madam when fromName is empty', async () => {
    const prompt = await postEmail({ fromName: null, from: 'contact2@demo.local' });
    const addressLine = prompt.split('\n').find(l => l.startsWith('Address the reply to:')) ?? '';
    expect(addressLine).toMatch(/Sir\/Madam/);
    expect(addressLine).not.toMatch(/contact\d+/i);
  });

  it('passes a real sender name through unchanged', async () => {
    const prompt = await postEmail({ fromName: 'Alice Cooper', from: 'alice@acme.com' });
    const addressLine = prompt.split('\n').find(l => l.startsWith('Address the reply to:')) ?? '';
    expect(addressLine).toBe('Address the reply to: Alice Cooper');
  });
});
