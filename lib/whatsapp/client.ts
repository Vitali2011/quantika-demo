import type { WhatsAppInteractive, WhatsAppOutboundMessage } from './types';

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

export class WhatsAppClient {
  constructor(
    private token: string,
    private phoneNumberId: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  private get messagesUrl(): string {
    return `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async post(body: unknown): Promise<unknown> {
    const res = await this.fetcher(this.messagesUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return res.json();
  }

  async sendText(to: string, body: string, previewUrl = false): Promise<{ messageId: string }> {
    const msg: WhatsAppOutboundMessage = {
      to,
      type: 'text',
      text: { body, preview_url: previewUrl },
    };
    const payload = { messaging_product: 'whatsapp', ...msg };
    const data = (await this.post(payload)) as { messages: Array<{ id: string }> };
    return { messageId: data.messages[0].id };
  }

  async sendTemplate(to: string, templateName: string, languageCode = 'en'): Promise<{ messageId: string }> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: languageCode } },
    };
    const data = (await this.post(payload)) as { messages: Array<{ id: string }> };
    return { messageId: data.messages[0].id };
  }

  async sendInteractive(to: string, interactive: WhatsAppInteractive): Promise<{ messageId: string }> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive,
    };
    const data = (await this.post(payload)) as { messages: Array<{ id: string }> };
    return { messageId: data.messages[0].id };
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  async downloadMedia(mediaId: string): Promise<{ url: string; mimeType: string }> {
    const res = await this.fetcher(`${GRAPH_API_BASE}/${mediaId}`, {
      headers: this.headers(),
    });
    const data = (await res.json()) as { url: string; mime_type: string };
    return { url: data.url, mimeType: data.mime_type };
  }
}

export function getWhatsAppClient(): WhatsAppClient | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return new WhatsAppClient(token, phoneNumberId);
}
