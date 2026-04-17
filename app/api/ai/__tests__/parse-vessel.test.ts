import { buildVesselPrompt, parseVesselAIResponse } from '@/app/api/ai/parse-vessel/route';
import { Email } from '@/lib/types';

jest.mock('@/lib/session');
jest.mock('@/lib/openai');
jest.mock('@/lib/validation/equasis-client', () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn().mockReturnValue(null),
}));

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'owner@shipping.com',
    fromName: 'Owner',
    fromEmail: 'owner@shipping.com',
    to: 'broker@example.com',
    subject: 'MV OCEAN STAR - Open Rotterdam',
    date: '2024-01-15',
    body: 'MV OCEAN STAR, IMO 9123456, DWT 45000, open Rotterdam 20 Jan',
    snippet: 'MV OCEAN STAR open Rotterdam',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

// ── buildVesselPrompt ────────────────────────────────────────────────────────

describe('buildVesselPrompt', () => {
  it('includes From, Subject, Date and body in the prompt', () => {
    const email = makeEmail();
    const prompt = buildVesselPrompt(email);
    expect(prompt).toContain(`From: ${email.from}`);
    expect(prompt).toContain(`Subject: ${email.subject}`);
    expect(prompt).toContain(`Date: ${email.date}`);
    expect(prompt).toContain(email.body);
  });

  it('returns a non-empty string for any valid email', () => {
    const prompt = buildVesselPrompt(makeEmail({ body: '' }));
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('formats the prompt with newline-separated header fields', () => {
    const email = makeEmail({ from: 'a@b.com', subject: 'Subj', date: '2024-01-01', body: 'body' });
    const prompt = buildVesselPrompt(email);
    expect(prompt).toBe('From: a@b.com\nSubject: Subj\nDate: 2024-01-01\n\nbody');
  });
});

// ── parseVesselAIResponse ────────────────────────────────────────────────────

const happyRaw = JSON.stringify({
  items: [
    {
      vessel_name: { value: 'OCEAN STAR', confidence: 'confirmed' },
      imo: '9074729',
      flag: 'PA',
      built: 2005,
      dwt_summer: { value: 45000, confidence: 'confirmed' },
      open_position: { value: 'Rotterdam', confidence: 'confirmed' },
      open_date: { value: '2024-01-20', confidence: 'interpreted' },
      last_cargoes: ['grain', 'coal'],
      restrictions: [],
      special_features: [],
    },
  ],
});

describe('parseVesselAIResponse', () => {
  it('happy path: returns one ParsedVessel with correct fields', () => {
    const result = parseVesselAIResponse(happyRaw, 'email-1');
    expect(result).toHaveLength(1);
    const v = result[0];
    expect(v.emailId).toBe('email-1');
    expect(v.itemIndex).toBe(0);
    expect((v.vesselName as { value: string } | null)?.value).toBe('OCEAN STAR');
    expect(v.flag).toBe('PA');
    expect(v.built).toBe(2005);
  });

  it('joins last_cargoes array into comma-separated string', () => {
    const result = parseVesselAIResponse(happyRaw, 'email-1');
    expect(result[0].lastCargoes).toBe('grain, coal');
  });

  it('returns null lastCargoes when last_cargoes is absent', () => {
    const raw = JSON.stringify({ items: [{ vessel_name: 'MV TEST', imo: null }] });
    const result = parseVesselAIResponse(raw, 'email-1');
    expect(result[0].lastCargoes).toBeNull();
  });

  it('treats missing items field as single-item array', () => {
    const raw = JSON.stringify({ vessel_name: 'SOLO', imo: null });
    const result = parseVesselAIResponse(raw, 'email-2');
    expect(result).toHaveLength(1);
    expect(result[0].emailId).toBe('email-2');
  });

  it('returns empty array of restrictions when restrictions missing', () => {
    const raw = JSON.stringify({ items: [{ vessel_name: 'MV A' }] });
    const result = parseVesselAIResponse(raw, 'e1');
    expect(result[0].restrictions).toEqual([]);
  });

  it('marks verificationWarning as null by default', () => {
    const result = parseVesselAIResponse(happyRaw, 'email-1');
    expect(result[0].verificationWarning).toBeNull();
  });

  it('returns geared=false when special_features contains "gearless"', () => {
    const raw = JSON.stringify({
      items: [{ vessel_name: 'GEARLESS SHIP', special_features: ['gearless'] }],
    });
    const result = parseVesselAIResponse(raw, 'e1');
    expect(result[0].geared).toBe(false);
  });

  it('throws on malformed JSON input', () => {
    expect(() => parseVesselAIResponse('not valid json', 'e1')).toThrow();
  });
});
