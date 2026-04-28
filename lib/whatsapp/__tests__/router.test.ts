import { routeIncomingMessage, handleText, handleMedia, handleInteractive, handleUnknown } from '../router';
import { MockWhatsAppClient } from '../__mocks__/client';
import type { WhatsAppIncomingMessage } from '../types';

// Mock dependencies
jest.mock('../forward-parser', () => ({
  parseForwardedMessage: jest.fn().mockResolvedValue({
    parsedCargo: {
      emailId: 'wa-test',
      itemIndex: 0,
      originPort: { value: 'Istanbul', confidence: 'confirmed' },
      destinationPort: { value: 'Lagos', confidence: 'confirmed' },
      cargoDescription: { value: 'Steel coils', confidence: 'confirmed' },
      weightMt: { value: 7500, confidence: 'confirmed' },
      laycan: '10-15 May',
      missingInfo: [],
    },
    confidence: 'verified',
    missingFields: [],
    rawText: 'test cargo text',
  }),
}));

jest.mock('@/lib/audit', () => ({
  logAuditEvent: jest.fn().mockReturnValue({
    id: 'mock-uuid',
    timestamp: '2026-04-28T00:00:00Z',
    sessionId: 'wa-test',
    actor: 'ai',
    action: 'parsed',
  }),
}));

import { logAuditEvent } from '@/lib/audit';

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

describe('handleText', () => {
  it('parses text, logs audit event, sends interactive reply with buttons', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'text', text: { body: '7500 mt steel coils Istanbul Lagos' } });
    await handleText(msg, client as never);

    expect(client.readMessages).toContain(msg.id);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'ai', action: 'parsed' }),
    );
    // Should send interactive message with buttons
    const interactive = client.sentMessages.find(m => m.type === 'interactive');
    expect(interactive).toBeDefined();
    if (interactive && 'interactive' in interactive) {
      expect(interactive.interactive.type).toBe('button');
      expect(interactive.interactive.body.text).toContain('Parsed');
    }
  });
});

describe('handleMedia', () => {
  it('parses media, logs audit event, sends interactive reply', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({ type: 'image', image: { id: 'img1', mime_type: 'image/jpeg', sha256: 'x' } });
    await handleMedia(msg, client as never);

    expect(client.readMessages).toContain(msg.id);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'ai', action: 'parsed' }),
    );
    const interactive = client.sentMessages.find(m => m.type === 'interactive');
    expect(interactive).toBeDefined();
  });
});

describe('handleInteractive', () => {
  it('responds to fwd:quote button', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'fwd:quote', title: 'Open full quote' } },
    });
    await handleInteractive(msg, client as never);
    expect(client.sentMessages.length).toBe(1);
    expect(client.sentMessages[0].type).toBe('text');
  });

  it('responds to fwd:more button', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'fwd:more', title: 'More matches' } },
    });
    await handleInteractive(msg, client as never);
    expect(client.sentMessages.length).toBe(1);
  });

  it('responds to fwd:discard button', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'fwd:discard', title: 'Discard' } },
    });
    await handleInteractive(msg, client as never);
    expect(client.sentMessages.length).toBe(1);
  });

  it('handles unknown button with coming soon', async () => {
    const client = new MockWhatsAppClient();
    const msg = makeMessage({
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'unknown:btn', title: 'Unknown' } },
    });
    await handleInteractive(msg, client as never);
    expect(client.sentMessages.length).toBe(1);
  });
});
