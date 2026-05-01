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

// DB row shape (snake_case as stored in SQLite)
export interface PipedriveTokenRow {
  account_id: number;
  access_token: string;
  refresh_token_encrypted: string;
  expires_at: number;
  api_domain: string;
}

export interface PipedriveDealMappingRow {
  quote_id: number;
  pipedrive_deal_id: number;
  synced_at: number;
}

// OAuth token exchange response from Pipedrive
export interface PipedriveOAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  api_domain: string;
}

// Input payload for syncQuoteAccepted
export interface SyncQuotePayload {
  quoteId: number;
  contactEmail: string;
  contactName: string;
  dealValue: number;
  dealCurrency: string;
  route?: string;
  vessel?: string;
  eta?: string;
}

// Pipedrive API response shapes
export interface PipedrivePersonSearchResult {
  success: boolean;
  data: {
    items: Array<{
      item: { id: number; name: string; emails: Array<{ value: string }> };
    }>;
  };
}

export interface PipedriveDealCreateResponse {
  success: boolean;
  data: { id: number };
}
