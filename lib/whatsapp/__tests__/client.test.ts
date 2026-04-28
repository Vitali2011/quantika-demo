import { WhatsAppClient } from '../client';

const TOKEN = 'test-token';
const PHONE_ID = '123456789';
const BASE_URL = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;

function makeFetcher(responseBody: unknown, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseBody),
  });
}

describe('WhatsAppClient.sendText', () => {
  it('POSTs to the correct URL with Authorization header', async () => {
    const fetcher = makeFetcher({ messages: [{ id: 'wamid.123' }] });
    const client = new WhatsAppClient(TOKEN, PHONE_ID, fetcher as unknown as typeof fetch);

    await client.sendText('+1234567890', 'Hello');

    expect(fetcher).toHaveBeenCalledWith(
      BASE_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('sends correct text message body', async () => {
    const fetcher = makeFetcher({ messages: [{ id: 'wamid.456' }] });
    const client = new WhatsAppClient(TOKEN, PHONE_ID, fetcher as unknown as typeof fetch);

    await client.sendText('+1234567890', 'Hello world');

    const call = fetcher.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '+1234567890',
      type: 'text',
      text: { body: 'Hello world' },
    });
  });

  it('returns messageId from response', async () => {
    const fetcher = makeFetcher({ messages: [{ id: 'wamid.789' }] });
    const client = new WhatsAppClient(TOKEN, PHONE_ID, fetcher as unknown as typeof fetch);

    const result = await client.sendText('+1234567890', 'Hi');
    expect(result).toEqual({ messageId: 'wamid.789' });
  });

  it('throws on network error', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('Network error'));
    const client = new WhatsAppClient(TOKEN, PHONE_ID, fetcher as unknown as typeof fetch);

    await expect(client.sendText('+1234567890', 'Hi')).rejects.toThrow('Network error');
  });
});

describe('WhatsAppClient.markAsRead', () => {
  it('POSTs read status with correct message_id', async () => {
    const fetcher = makeFetcher({ success: true });
    const client = new WhatsAppClient(TOKEN, PHONE_ID, fetcher as unknown as typeof fetch);

    await client.markAsRead('wamid.read123');

    const call = fetcher.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.read123',
    });
  });
});
