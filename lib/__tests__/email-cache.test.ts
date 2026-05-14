import Database from "better-sqlite3";
import migration031 from "../migrations/031-email-cache";
import {
  hashParserVersion,
  getCachedParses,
  saveParsedResults,
  upsertEmails,
  deleteAccountData,
} from "../email-cache";
import type { Email } from "../types";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  migration031.up(db);
  return db;
}

const email = (id: string): Email => ({
  id,
  threadId: "t",
  from: "A <a@x>",
  fromName: "A",
  fromEmail: "a@x",
  to: "b@x",
  subject: "S",
  date: "Mon",
  body: "B",
  snippet: "sn",
  labelIds: [],
});

describe("email-cache", () => {
  it("hashParserVersion is stable and changes with input", () => {
    expect(hashParserVersion("prompt-a")).toBe(hashParserVersion("prompt-a"));
    expect(hashParserVersion("prompt-a")).not.toBe(hashParserVersion("prompt-b"));
  });

  it("getCachedParses returns empty map on miss", () => {
    const db = freshDb();
    const map = getCachedParses("acc", "cargo", "v1", ["m1", "m2"], db);
    expect(map.size).toBe(0);
  });

  it("saveParsedResults then getCachedParses round-trips", () => {
    const db = freshDb();
    saveParsedResults("acc", "cargo", "v1", [{ gmailMessageId: "m1", items: [{ a: 1 }] }], db);
    const map = getCachedParses<{ a: number }>("acc", "cargo", "v1", ["m1", "m2"], db);
    expect(map.get("m1")).toEqual([{ a: 1 }]);
    expect(map.has("m2")).toBe(false);
  });

  it("saveParsedResults skips empty item arrays (allows retry)", () => {
    const db = freshDb();
    saveParsedResults("acc", "cargo", "v1", [{ gmailMessageId: "m1", items: [] }], db);
    expect(getCachedParses("acc", "cargo", "v1", ["m1"], db).size).toBe(0);
  });

  it("parser_version mismatch is a cache miss", () => {
    const db = freshDb();
    saveParsedResults("acc", "cargo", "v1", [{ gmailMessageId: "m1", items: [{ a: 1 }] }], db);
    expect(getCachedParses("acc", "cargo", "v2", ["m1"], db).size).toBe(0);
  });

  it("isolates accounts — one account cannot read another", () => {
    const db = freshDb();
    saveParsedResults("acc1", "cargo", "v1", [{ gmailMessageId: "m1", items: [{ a: 1 }] }], db);
    expect(getCachedParses("acc2", "cargo", "v1", ["m1"], db).size).toBe(0);
  });

  it("upsertEmails inserts then updates body on conflict", () => {
    const db = freshDb();
    upsertEmails("acc", [email("m1")], db);
    upsertEmails("acc", [{ ...email("m1"), body: "UPDATED" }], db);
    const row = db
      .prepare("SELECT body FROM emails WHERE account_id=? AND gmail_message_id=?")
      .get("acc", "m1") as { body: string };
    expect(row.body).toBe("UPDATED");
  });

  it("deleteAccountData removes only that account from both tables", () => {
    const db = freshDb();
    upsertEmails("acc1", [email("m1")], db);
    upsertEmails("acc2", [email("m2")], db);
    saveParsedResults("acc1", "cargo", "v1", [{ gmailMessageId: "m1", items: [{ a: 1 }] }], db);
    deleteAccountData("acc1", db);
    expect(db.prepare("SELECT COUNT(*) c FROM emails").get()).toEqual({ c: 1 });
    expect(db.prepare("SELECT COUNT(*) c FROM parsed_results").get()).toEqual({ c: 0 });
  });

  it("getCachedParses with empty id list does not hit the db", () => {
    const db = freshDb();
    expect(getCachedParses("acc", "cargo", "v1", [], db).size).toBe(0);
  });
});
