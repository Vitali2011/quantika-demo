-- β-02: Pipedrive CRM Bridge tables
-- Applied via lib/migrations/008-pipedrive-tables.ts (TypeScript migration runner)

CREATE TABLE IF NOT EXISTS pipedrive_tokens (
  account_id              INTEGER PRIMARY KEY,
  access_token            TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at              INTEGER NOT NULL,
  api_domain              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pipedrive_deal_mapping (
  quote_id           INTEGER PRIMARY KEY,
  pipedrive_deal_id  INTEGER NOT NULL,
  synced_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pd_mapping_deal
  ON pipedrive_deal_mapping(pipedrive_deal_id);
