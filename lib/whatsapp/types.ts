export interface WhatsAppMedia {
  id: string;
  mime_type: string;
  sha256: string;
  caption?: string;
  filename?: string;
}

export interface WhatsAppInteractiveReply {
  type: 'button_reply' | 'list_reply';
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
}

export interface WhatsAppIncomingMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'video' | 'interactive' | 'location' | 'contacts';
  text?: { body: string };
  image?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  document?: WhatsAppMedia;
  interactive?: WhatsAppInteractiveReply;
}

export interface WhatsAppMessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WhatsAppIncomingMessage[];
        statuses?: WhatsAppMessageStatus[];
      };
      field: 'messages';
    }>;
  }>;
}

export interface WhatsAppButtonAction {
  buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
}

export interface WhatsAppListAction {
  button: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

export interface WhatsAppInteractive {
  type: 'button' | 'list';
  body: { text: string };
  action: WhatsAppButtonAction | WhatsAppListAction;
}

export type WhatsAppOutboundMessage =
  | { to: string; type: 'text'; text: { body: string; preview_url?: boolean } }
  | { to: string; type: 'template'; template: { name: string; language: { code: string } } }
  | { to: string; type: 'interactive'; interactive: WhatsAppInteractive };
