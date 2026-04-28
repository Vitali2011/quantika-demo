import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from '../signature';

function makeSignature(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  const secret = 'test-app-secret';
  const body = '{"object":"whatsapp_business_account"}';

  it('returns true for a valid signature', () => {
    const signature = makeSignature(body, secret);
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    expect(verifyWebhookSignature(body, 'sha256=deadbeef', secret)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyWebhookSignature(body, '', secret)).toBe(false);
  });

  it('returns false when body has been tampered', () => {
    const signature = makeSignature(body, secret);
    const tamperedBody = body + ' ';
    expect(verifyWebhookSignature(tamperedBody, signature, secret)).toBe(false);
  });
});
