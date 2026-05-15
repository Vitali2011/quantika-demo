import type { Migration } from "./types";

const migration031: Migration = {
  version: 31,
  name: "email-cache",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        account_id        TEXT NOT NULL,
        gmail_message_id  TEXT NOT NULL,
        thread_id         TEXT,
        from_addr         TEXT,
        from_name         TEXT,
        from_email        TEXT,
        to_addr           TEXT,
        subject           TEXT,
        date              TEXT,
        body              TEXT,
        snippet           TEXT,
        label_ids         TEXT,
        fetched_at        TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, gmail_message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id);

      CREATE TABLE IF NOT EXISTS parsed_results (
        account_id        TEXT NOT NULL,
        gmail_message_id  TEXT NOT NULL,
        parse_type        TEXT NOT NULL,
        parser_version    TEXT NOT NULL,
        result_json       TEXT NOT NULL,
        parsed_at         TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (account_id, gmail_message_id, parse_type, parser_version)
      );
      CREATE INDEX IF NOT EXISTS idx_parsed_lookup
        ON parsed_results(account_id, parse_type, parser_version);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_parsed_lookup;
      DROP TABLE IF EXISTS parsed_results;
      DROP INDEX IF EXISTS idx_emails_account;
      DROP TABLE IF EXISTS emails;
    `);
  },
};

export default migration031;
