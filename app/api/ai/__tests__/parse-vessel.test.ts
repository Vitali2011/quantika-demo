jest.mock('@/lib/openai', () => ({
  callAiText: jest.fn(),
  callAiJson: jest.fn(),
}));

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
  updateSession: jest.fn(),
}));

jest.mock('@/lib/validation/equasis-client', () => ({
  lookupVesselByImo: jest.fn().mockResolvedValue(null),
  compareVesselRecord: jest.fn().mockReturnValue(null),
}));

import {
  buildVesselPrompt,
  parseVesselAIResponse,
} from '@/app/api/ai/parse-vessel/route';
import type { Email } from '@/lib/types';

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    from: 'test@example.com',
    fromName: 'Test User',
    fromEmail: 'test@example.com',
    to: 'broker@example.com',
    subject: 'MV OCEAN STAR - Open Position',
    date: '2024-01-15T10:00:00Z',
    body: 'Vessel MV OCEAN STAR open Gibraltar Jan 20.',
    snippet: 'Vessel MV OCEAN STAR open Gibraltar Jan 20.',
    labelIds: ['INBOX'],
    ...overrides,
  };
}

// ── buildVesselPrompt ─────────────────────────────────────────────────────────

describe('buildVesselPrompt', () => {
  it('includes From, Subject, Date and body in the prompt', () => {
    const email = makeEmail();
    const prompt = buildVesselPrompt(email);
    expect(prompt).toContain(`From: ${email.from}`);
    expect(prompt).toContain(`Subject: ${email.subject}`);
    expect(prompt).toContain(`Date: ${email.date}`);
    expect(prompt).toContain(email.body);
  });

  it('formats fields with correct newline separators', () => {
    const email = makeEmail({ from: 'a@b.com', subject: 'Test', date: '2024-01-01' });
    const prompt = buildVesselPrompt(email);
    expect(prompt.startsWith('From: a@b.com\nSubject: Test\nDate: 2024-01-01\n\n')).toBe(true);
  });
});

// ── parseVesselAIResponse ─────────────────────────────────────────────────────

describe('parseVesselAIResponse', () => {
  it('returns a ParsedVessel on happy-path single vessel JSON', () => {
    const raw = JSON.stringify({
      vessel_name: { value: 'OCEAN STAR', confidence: 'confirmed' },
      imo: '9074729',
      flag: 'Panama',
      dwt_summer: { value: 75000, confidence: 'confirmed' },
      open_position: { value: 'Gibraltar', confidence: 'confirmed' },
      open_date: { value: '2024-01-20', confidence: 'confirmed' },
      restrictions: [],
      special_features: [],
    });
    const results = parseVesselAIResponse(raw, 'email-1');
    expect(results).toHaveLength(1);
    expect(results[0].emailId).toBe('email-1');
    expect(results[0].vesselName?.value).toBe('OCEAN STAR');
    expect(results[0].imo).toBe('9074729');
  });

  it('parses multiple vessels from an items array', () => {
    const raw = JSON.stringify({
      items: [
        { vessel_name: { value: 'SHIP A', confidence: 'confirmed' }, restrictions: [], special_features: [] },
        { vessel_name: { value: 'SHIP B', confidence: 'uncertain' }, restrictions: [], special_features: [] },
      ],
    });
    const results = parseVesselAIResponse(raw, 'email-2');
    expect(results).toHaveLength(2);
    expect(results[0].itemIndex).toBe(0);
    expect(results[1].itemIndex).toBe(1);
  });

  it('returns [] for an empty items array', () => {
    const raw = JSON.stringify({ items: [] });
    const results = parseVesselAIResponse(raw, 'email-3');
    expect(results).toHaveLength(0);
  });

  it('returns [] on malformed JSON', () => {
    const results = parseVesselAIResponse('not valid json {{{', 'email-4');
    expect(results).toEqual([]);
  });

  it('returns [] on empty string', () => {
    const results = parseVesselAIResponse('', 'email-5');
    expect(results).toEqual([]);
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify({ vessel_name: { value: 'FENCED', confidence: 'confirmed' }, restrictions: [], special_features: [] }) + '\n```';
    const results = parseVesselAIResponse(raw, 'email-6');
    expect(results).toHaveLength(1);
    expect(results[0].vesselName?.value).toBe('FENCED');
  });

  it('handles missing optional fields gracefully (returns null)', () => {
    const raw = JSON.stringify({ vessel_name: null, restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'email-7');
    expect(results).toHaveLength(1);
    expect(results[0].vesselName).toBeNull();
    expect(results[0].imo).toBeNull();
    expect(results[0].dwtSummer).toBeNull();
  });

  it('rejects an invalid IMO and stores null', () => {
    // 1234560 has checksum digit 0 but correct value is 7 — fails mod-10 check
    const raw = JSON.stringify({ imo: '1234560', restrictions: [], special_features: [] });
    const results = parseVesselAIResponse(raw, 'email-8');
    expect(results[0].imo).toBeNull();
  });
});
