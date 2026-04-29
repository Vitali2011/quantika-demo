import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string,
): boolean {
  if (rawBody == null || !signature || !appSecret) return false;

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const expectedFull = `sha256=${expected}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedFull),
    );
  } catch {
    return false;
  }
}
