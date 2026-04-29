-- Migration 008: Canal Tariffs
-- Tracks transit fees for Suez, Panama, Kiel, and Bosporus canals.
-- Unit-rate column (per_scnt_fee_usd) is reused across canals:
--   Suez    → per SCNT (Suez Canal Net Tonnage)
--   Panama  → per NT (Net Tonnage)
--   Kiel    → flat fee only (per_scnt_fee_usd = 0)
--   Bosporus→ flat fee only (per_scnt_fee_usd = 0)

CREATE TABLE IF NOT EXISTS canal_tariffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canal TEXT NOT NULL,                -- 'suez'|'panama'|'kiel'|'bosporus'
  vessel_type TEXT NOT NULL,          -- 'bulker'|'tanker'|'container'|'general'
  scnt_min INTEGER,                   -- nullable (Kiel/Bosporus don't use ranges)
  scnt_max INTEGER,
  base_fee_usd REAL NOT NULL,
  per_scnt_fee_usd REAL NOT NULL DEFAULT 0,
  war_risk_zone TEXT,                 -- nullable, e.g. 'red-sea-hra'
  valid_from TEXT NOT NULL,           -- ISO date
  valid_to TEXT,                      -- nullable = open-ended
  source TEXT NOT NULL                -- 'sca-2025'|'acp-2025'|'kiel-2025'|'bosporus-2025'
);

CREATE INDEX IF NOT EXISTS idx_canal_lookup
  ON canal_tariffs(canal, vessel_type, valid_from, valid_to);
