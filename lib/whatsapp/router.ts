import type { WhatsAppClient } from './client';
import type { WhatsAppIncomingMessage } from './types';
import { startOnboarding, handleRegionReply, isOnboarded } from './onboarding';
import { parseForwardedMessage } from './forward-parser';
import type { ForwardParseResult } from './forward-parser';
import { logAuditEvent } from '@/lib/audit';
import { cfValue } from '@/lib/types';
import { logger } from '@/lib/logger';

function buildParseReply(result: ForwardParseResult): string {
  const cargo = result.parsedCargo;
  if (!cargo) {
    return `⚠️ Could not parse cargo details from this message.\n\nRaw text:\n${result.rawText.slice(0, 300)}`;
  }

  const weight = cfValue(cargo.weightMt);
  const description = cfValue(cargo.cargoDescription) ?? 'cargo';
  const origin = cfValue(cargo.originPort) ?? '?';
  const dest = cfValue(cargo.destinationPort) ?? '?';
  const laycan = cargo.laycan ?? 'TBD';

  const weightStr = weight ? `${weight.toLocaleString()} mt` : '? mt';
  const summary = `✅ Parsed: ${weightStr} ${description} ${origin}→${dest} · laycan ${laycan}`;

  const missing = result.missingFields.length > 0
    ? `\n\n⚠️ Missing: ${result.missingFields.join(', ')}`
    : '';

  return `${summary}${missing}`;
}

export async function handleText(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  logger.info({ id: msg.id, from: msg.from }, '[whatsapp] handleText → forward-parse');
  await client.markAsRead(msg.id);

  const result = await parseForwardedMessage(msg, client);
  const replyText = buildParseReply(result);

  logAuditEvent({
    sessionId: `wa-${msg.from}`,
    actor: 'ai',
    action: 'parsed',
    reason: `WhatsApp text forward from ${msg.from}`,
    afterValue: result.parsedCargo ?? null,
  });

  await client.sendInteractive(msg.from, {
    type: 'button',
    body: { text: replyText },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'fwd:quote', title: 'Open full quote' } },
        { type: 'reply', reply: { id: 'fwd:more', title: 'More matches' } },
        { type: 'reply', reply: { id: 'fwd:discard', title: 'Discard' } },
      ],
    },
  });
}

export async function handleMedia(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  logger.info({ id: msg.id, from: msg.from, type: msg.type }, '[whatsapp] handleMedia → forward-parse');
  await client.markAsRead(msg.id);

  const result = await parseForwardedMessage(msg, client);
  const replyText = buildParseReply(result);

  logAuditEvent({
    sessionId: `wa-${msg.from}`,
    actor: 'ai',
    action: 'parsed',
    reason: `WhatsApp ${msg.type} forward from ${msg.from}`,
    afterValue: result.parsedCargo ?? null,
  });

  await client.sendInteractive(msg.from, {
    type: 'button',
    body: { text: replyText },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'fwd:quote', title: 'Open full quote' } },
        { type: 'reply', reply: { id: 'fwd:more', title: 'More matches' } },
        { type: 'reply', reply: { id: 'fwd:discard', title: 'Discard' } },
      ],
    },
  });
}

export async function handleInteractive(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  logger.info({ id: msg.id, from: msg.from, interactive: msg.interactive }, '[whatsapp] handleInteractive');

  const buttonId = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? '';
  const regionMatch = buttonId.match(/^region:(MENA|Med|WAFR|Other)$/);
  if (regionMatch) {
    await handleRegionReply(client, msg, regionMatch[1]);
    return;
  }

  await client.markAsRead(msg.id);

  if (buttonId === 'fwd:quote') {
    await client.sendText(msg.from, '📋 Opening full quote view — check the dashboard for details.');
  } else if (buttonId === 'fwd:more') {
    await client.sendText(msg.from, '🔍 Searching for more matches…');
  } else if (buttonId === 'fwd:discard') {
    await client.sendText(msg.from, '🗑️ Discarded. Send another message to try again.');
  } else {
    await client.sendText(msg.from, '🚧 Coming soon');
  }
}

export async function handleUnknown(msg: WhatsAppIncomingMessage, client: WhatsAppClient): Promise<void> {
  logger.info({ id: msg.id, from: msg.from, type: msg.type }, '[whatsapp] handleUnknown');
  await client.markAsRead(msg.id);
  await client.sendText(msg.from, "I don't understand this yet 🚧");
}

export async function routeIncomingMessage(
  msg: WhatsAppIncomingMessage,
  client: WhatsAppClient,
): Promise<void> {
  const onboarded = await isOnboarded(msg.from);
  if (!onboarded) {
    await startOnboarding(client, msg);
    return;
  }

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
