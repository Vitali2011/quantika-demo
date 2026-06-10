import { sanitizeEmailBody } from '@/lib/utils';

describe('sanitizeEmailBody — anonymization token stripping', () => {
  it('strips <SENDER N> angle-bracket token from forwarded header', () => {
    const body = 'To: ETMS Management <SENDER 1>; chartering\n<SENDER 3>';
    const result = sanitizeEmailBody(body);
    expect(result).not.toContain('<SENDER 1>');
    expect(result).not.toContain('<SENDER 3>');
  });

  it('strips <CONTACT N> token', () => {
    const body = 'From: Some Org <CONTACT 6>';
    expect(sanitizeEmailBody(body)).not.toContain('<CONTACT 6>');
  });

  it('strips <BROKER N> token', () => {
    const body = 'Reply-To: <BROKER 2>';
    expect(sanitizeEmailBody(body)).not.toContain('<BROKER 2>');
  });

  it('strips <AGENT N> token', () => {
    const body = 'Cc: <AGENT 10>';
    expect(sanitizeEmailBody(body)).not.toContain('<AGENT 10>');
  });

  it('is case-insensitive', () => {
    expect(sanitizeEmailBody('From: <sender 1>')).not.toContain('<sender 1>');
    expect(sanitizeEmailBody('From: <Broker 3>')).not.toContain('<Broker 3>');
  });

  it('preserves surrounding text when stripping token', () => {
    const body = 'To: ETMS Management ; chartering\n<SENDER 3>\nBody continues here.';
    const result = sanitizeEmailBody(body);
    expect(result).toContain('ETMS Management');
    expect(result).toContain('Body continues here.');
  });

  it('leaves real email addresses intact', () => {
    const body = 'From: Alice <alice@example.com>';
    const result = sanitizeEmailBody(body);
    expect(result).toContain('<alice@example.com>');
  });

  it('preserves existing mailto: → address behavior alongside new rule', () => {
    const body = 'See <mailto:broker@demo.local> and <SENDER 1>';
    const result = sanitizeEmailBody(body);
    expect(result).toContain('broker@demo.local');
    expect(result).not.toContain('<mailto:broker@demo.local>');
    expect(result).not.toContain('<SENDER 1>');
  });
});
