import { routeIncomingMessage, handleText, handleMedia, handleInteractive, handleUnknown } from '../router';
import { MockWhatsAppClient } from '../__mocks__/client';
import type { WhatsAppIncomingMessage } from '../types';

function makeMessage(overrides: Partial<WhatsAppIncomingMessage>): WhatsAppIncomingMessage {
  return {
    id: 'wamid.test001',
    from: '+1234567890',
    timestamp: '1714000000',
    type: 'text',
    ...overrides,
  };
}

describe('routeIncomingMessage', () => {
  it('routes text message to handleText and marks as read', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'text', text: { body: 'hello' } });
    await routeIncomingMessage(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
  });

  it('routes image message to handleMedia and marks as read', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'image',
      image: { id: 'media123', mime_type: 'image/jpeg', sha256: 'abc' },
    });
    await routeIncomingMessage(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
  });

  it('routes audio message to handleMedia and marks as read', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'audio',
      audio: { id: 'audio123', mime_type: 'audio/ogg', sha256: 'def' },
    });
    await routeIncomingMessage(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
  });

  it('routes interactive message to handleInteractive and marks as read', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'btn1', title: 'Yes' } },
    });
    await routeIncomingMessage(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
  });

  it('routes unknown type to handleUnknown and sends a reply', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'location' as WhatsAppIncomingMessage['type'] });
    await routeIncomingMessage(msg, client as never);
    expect(client.sentMessages.length).toBeGreaterThan(0);
    expect(client.readMessages).toContain(msg.id);
  });
});

describe('handleUnknown', () => {
  it('sends a "not understood" reply', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'location' as WhatsAppIncomingMessage['type'] });
    await handleUnknown(msg, client as never);
    expect(client.sentMessages.length).toBe(1);
    const sent = client.sentMessages[0];
    expect(sent.type).toBe('text');
  });
});

describe('handleText stub', () => {
  it('marks message as read and sends placeholder reply', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'text', text: { body: 'test' } });
    await handleText(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
    expect(client.sentMessages.length).toBe(1);
  });
});

describe('handleMedia stub', () => {
  it('marks message as read and sends placeholder reply', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'image', image: { id: 'img1', mime_type: 'image/jpeg', sha256: 'x' } });
    await handleMedia(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
    expect(client.sentMessages.length).toBe(1);
  });
});

describe('handleInteractive stub', () => {
  it('marks message as read and sends placeholder reply', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'btn1', title: 'OK' } },
    });
    await handleInteractive(msg, client as never);
    expect(client.readMessages).toContain(msg.id);
    expect(client.sentMessages.length).toBe(1);
  });
});
