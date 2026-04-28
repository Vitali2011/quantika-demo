import type { WhatsAppClient } from './client';
import type { WhatsAppIncomingMessage } from './types';

const COMING_SOON = '🚧 Coming soon — Forward Anything feature lands in next release';

export async function handleText(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  console.log('[whatsapp] handleText', { id: msg.id, from: msg.from, text: msg.text?.body });
  await client.markAsRead(msg.id);
  await client.sendText(msg.from, COMING_SOON);
}

export async function handleMedia(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  console.log('[whatsapp] handleMedia', { id: msg.id, from: msg.from, type: msg.type });
  await client.markAsRead(msg.id);
  await client.sendText(msg.from, COMING_SOON);
}

export async function handleInteractive(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  console.log('[whatsapp] handleInteractive', { id: msg.id, from: msg.from, interactive: msg.interactive });
  await client.markAsRead(msg.id);
  await client.sendText(msg.from, COMING_SOON);
}

export async function handleUnknown(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  console.log('[whatsapp] handleUnknown', { id: msg.id, from: msg.from, type: msg.type });
  await client.markAsRead(msg.id);
  await client.sendText(msg.from, "I don't understand this yet 🚧");
}

export async function routeIncomingMessage(
  msg: WhatsAppIncomingMessage,
  client: WhatsAppClient,
): Promise<void> {
  switch (msg.type) {
    case 'text':
      await handleText(msg, client);
      break;
    case 'image':
    case 'audio':
    case 'document':
      await handleMedia(msg, client);
      break;
    case 'interactive':
      await handleInteractive(msg, client);
      break;
    default:
      await handleUnknown(msg, client);
  }
}
