// Pipedrive CRM Bridge — shared types (β-02)

export interface PipedriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp seconds
  apiDomain: string; // e.g. "companyname.pipedrive.com"
}

export interface PipedrivePerson {
  id?: number;
  name: string;
  email: string;
}

export interface PipedriveDeal {
  id?: number;
  title: string;
  value: number;
  currency: string;
  person_id?: number;
  status?: 'open' | 'won' | 'lost';
  // custom fields
  route?: string;
  vessel?: string;
  eta?: string;
}

export interface PipedriveDealMapping {
  quoteId: number;
  pipedriveDealId: number;
  syncedAt: number; // Unix timestamp seconds
}

export interface PipedriveWebhookPayload {
  event: string;
  meta?: {
    id?: number;
    object?: string;
  };
  current?: Record<string, unknown>;
  previous?: Record<string, unknown>;
}

// Stage mapping for deal status sync
export const STAGE_ID_MAP: Record<string, number> = {
  open: 1,
  won: 2,
  lost: 3,
};
