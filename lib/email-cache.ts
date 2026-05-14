import { createHash } from "crypto";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { Email } from "@/lib/types";

export type ParseType = "cargo" | "vessel" | "recap";

/** Stable short hash of a parser's system prompt — used as the cache version key. */
export function hashParserVersion(systemPrompt: string): string {
  return createHash("sha1").update(systemPrompt).digest("hex").slice(0, 12);
}

/** Look up already-parsed results. Returns Map<gmail_message_id, items[]>; misses are absent. */
export function getCachedParses<T>(
  accountId: string,
  parseType: ParseType,
  parserVersion: string,
  gmailMessageIds: string[],
  db: Database.Database = getDb()
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  if (gmailMessageIds.length === 0) return map;
  const placeholders = gmailMessageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT gmail_message_id, result_json FROM parsed_results
       WHERE account_id = ? AND parse_type = ? AND parser_version = ?
         AND gmail_message_id IN (${placeholders})`
    )
    .all(accountId, parseType, parserVersion, ...gmailMessageIds) as {
    gmail_message_id: string;
    result_json: string;
  }[];
  for (const row of rows) {
    try {
      map.set(row.gmail_message_id, JSON.parse(row.result_json) as T[]);
    } catch {
      console.warn(`[email-cache] Skipping corrupt result_json for message ${row.gmail_message_id}`);
    }
  }
  return map;
}

/** Persist fresh parse results. Empty item arrays are skipped so the email can be retried later. */
export function saveParsedResults<T>(
  accountId: string,
  parseType: ParseType,
  parserVersion: string,
  results: { gmailMessageId: string; items: T[] }[],
  db: Database.Database = getDb()
): void {
  const stmt = db.prepare(
    `INSERT INTO parsed_results
       (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id, gmail_message_id, parse_type, parser_version)
     DO UPDATE SET result_json = excluded.result_json, parsed_at = excluded.parsed_at`
  );
  const tx = db.transaction((rows: { gmailMessageId: string; items: T[] }[]) => {
    for (const r of rows) {
      if (!r.items || r.items.length === 0) continue;
      stmt.run(accountId, r.gmailMessageId, parseType, parserVersion, JSON.stringify(r.items));
    }
  });
  tx(results);
}

/** Upsert raw emails. On conflict, refresh body/snippet/labels and fetched_at. */
export function upsertEmails(
  accountId: string,
  emails: Email[],
  db: Database.Database = getDb()
): void {
  const stmt = db.prepare(
    `INSERT INTO emails
       (account_id, gmail_message_id, thread_id, from_addr, from_name, from_email,
        to_addr, subject, date, body, snippet, label_ids, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id, gmail_message_id) DO UPDATE SET
       body = excluded.body, snippet = excluded.snippet,
       label_ids = excluded.label_ids, fetched_at = excluded.fetched_at`
  );
  const tx = db.transaction((rows: Email[]) => {
    for (const e of rows) {
      stmt.run(
        accountId,
        e.id,
        e.threadId,
        e.from,
        e.fromName,
        e.fromEmail,
        e.to,
        e.subject,
        e.date,
        e.body,
        e.snippet,
        JSON.stringify(e.labelIds)
      );
    }
  });
  tx(emails);
}

/** Remove all stored data for one account. Wired behind a future "delete my data" action. */
export function deleteAccountData(accountId: string, db: Database.Database = getDb()): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM parsed_results WHERE account_id = ?").run(accountId);
    db.prepare("DELETE FROM emails WHERE account_id = ?").run(accountId);
  });
  tx();
}
