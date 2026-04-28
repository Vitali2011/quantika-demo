import type { WhatsAppInteractive, WhatsAppOutboundMessage } from '../types';

export class MockWhatsAppClient {
  public sentMessages: WhatsAppOutboundMessage[] = [];
  public readMessages: string[] = [];

  async sendText(to: string, body: string, previewUrl = false) {
    this.sentMessages.push({ to, type: 'text', text: { body, preview_url: previewUrl } });
    return { messageId: `mock-${Date.now()}` };
  }

  async sendTemplate(to: string, templateName: string, languageCode = 'en') {
    this.sentMessages.push({
      to,
      type: 'template',
      template: { name: templateName, language: { code: languageCode } },
    });
    return { messageId: `mock-${Date.now()}` };
  }

  async sendInteractive(to: string, interactive: WhatsAppInteractive) {
    this.sentMessages.push({ to, type: 'interactive', interactive });
    return { messageId: `mock-${Date.now()}` };
  }

  async markAsRead(messageId: string): Promise<void> {
    this.readMessages.push(messageId);
  }

  async downloadMedia(mediaId: string): Promise<{ url: string; mimeType: string }> {
    void mediaId;
    return { url: 'https://mock.example.com/media/123', mimeType: 'image/jpeg' };
  }
}

export function getWhatsAppClient(): MockWhatsAppClient {
  return new MockWhatsAppClient();
}
