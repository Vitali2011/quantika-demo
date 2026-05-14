/**
 * Adversarial QA tests for the email-persistence cache layer.
 * Written by cold-start QA reviewer — intent is to BREAK the feature,
 * not confirm it works.
 *
 * Focus areas: multi-tenant isolation, SQL injection, cache poisoning,
 * auth/accountId, boundary inputs, regressions.
 */

import Database from "better-sqlite3";
import migration031 from "../migrations/031-email-cache";
import {
  getCachedParses,
  saveParsedResults,
  upsertEmails,
  deleteAccountData,
  hashParserVersion,
  ParseType,
} from "../email-cache";
import type { Email } from "../types";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  migration031.up(db);
  return db;
}

const makeEmail = (id: string, overrides: Partial<Email> = {}): Email => ({
  id,
  threadId: "thread-" + id,
  from: "sender@example.com",
  fromName: "Sender",
  fromEmail: "sender@example.com",
  to: "recipient@example.com",
  subject: "Subject " + id,
  date: "Mon, 13 May 2026 10:00:00 +0000",
  body: "Body of " + id,
  snippet: "snippet",
  labelIds: ["INBOX"],
  ...overrides,
});

// ── Focus Area 1: Multi-tenant Isolation ──────────────────────────────────────

describe("Multi-tenant isolation (FA-1)", () => {
  it("account B cannot read account A's parsed results by supplying A's message IDs", () => {
    const db = freshDb();
    // Account A writes a result
    saveParsedResults("alice@example.com", "cargo", "v1", [
      { gmailMessageId: "msg-secret-alice", items: [{ cargoType: "OIL", tons: 50000 }] },
    ], db);

    // Account B queries for the same message ID — must get nothing
    const stolen = getCachedParses(
      "bob@example.com", "cargo", "v1", ["msg-secret-alice"], db
    );
    expect(stolen.size).toBe(0);
  });

  it("account B cannot read account A's emails by querying the emails table directly (isolation in upsertEmails)", () => {
    const db = freshDb();
    upsertEmails("alice@example.com", [makeEmail("msg-alice-private")], db);

    // B tries to read Alice's rows: the DB enforces account_id partition
    const rows = db
      .prepare("SELECT * FROM emails WHERE gmail_message_id=? AND account_id=?")
      .all("msg-alice-private", "bob@example.com");
    expect(rows.length).toBe(0);
  });

  it("deleteAccountData for account A does not touch account B's data", () => {
    const db = freshDb();
    upsertEmails("alice@example.com", [makeEmail("m1")], db);
    upsertEmails("bob@example.com", [makeEmail("m2")], db);
    saveParsedResults("alice@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ x: 1 }] },
    ], db);
    saveParsedResults("bob@example.com", "vessel", "v1", [
      { gmailMessageId: "m2", items: [{ y: 2 }] },
    ], db);

    deleteAccountData("alice@example.com", db);

    // Bob's data must be intact
    const bobEmails = (db.prepare("SELECT COUNT(*) AS c FROM emails WHERE account_id=?").get("bob@example.com") as { c: number }).c;
    const bobParsed = (db.prepare("SELECT COUNT(*) AS c FROM parsed_results WHERE account_id=?").get("bob@example.com") as { c: number }).c;
    expect(bobEmails).toBe(1);
    expect(bobParsed).toBe(1);
  });

  it("parse_type is part of cache key — cargo result does not bleed into vessel query", () => {
    const db = freshDb();
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK" }] },
    ], db);

    const vesselHit = getCachedParses("acc@example.com", "vessel", "v1", ["m1"], db);
    expect(vesselHit.size).toBe(0);

    const recapHit = getCachedParses("acc@example.com", "recap", "v1", ["m1"], db);
    expect(recapHit.size).toBe(0);
  });

  it("parser_version is part of cache key — old version result does not bleed into new version", () => {
    const db = freshDb();
    const oldVersion = hashParserVersion("old prompt");
    const newVersion = hashParserVersion("new prompt — changed");

    saveParsedResults("acc@example.com", "cargo", oldVersion, [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK", stale: true }] },
    ], db);

    // New version must not see old cache
    const miss = getCachedParses("acc@example.com", "cargo", newVersion, ["m1"], db);
    expect(miss.size).toBe(0);
  });
});

// ── Focus Area 2: SQL Injection ───────────────────────────────────────────────

describe("SQL injection hardening (FA-2)", () => {
  it("SQL injection in accountId is neutralised by parameterised queries", () => {
    const db = freshDb();
    // Seed a real account row
    saveParsedResults("legitimate@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ secret: true }] },
    ], db);

    // Attacker crafts an accountId containing SQL injection payload
    const maliciousAccountId = "' OR '1'='1";
    const result = getCachedParses(maliciousAccountId, "cargo", "v1", ["m1"], db);
    // Must return nothing — the WHERE clause is parameterised, no injection
    expect(result.size).toBe(0);
  });

  it("SQL injection in gmail_message_id IN() clause is neutralised", () => {
    const db = freshDb();
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ secret: true }] },
    ], db);

    // Attempt SQL injection through a message ID
    const injectedId = "m1') OR ('1'='1";
    const result = getCachedParses("acc@example.com", "cargo", "v1", [injectedId], db);
    // The legitimate row must not be returned via injection
    expect(result.size).toBe(0);
  });

  it("SQL injection in parseType is neutralised (TypeScript enforces union, DB uses parameterised bind)", () => {
    const db = freshDb();
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ secret: true }] },
    ], db);

    // Cast a malicious string as ParseType (runtime attacker scenario bypassing TS)
    const injectedType = "cargo' OR parse_type='vessel" as ParseType;
    const result = getCachedParses("acc@example.com", injectedType, "v1", ["m1"], db);
    // The parameterised query will treat the whole string as a literal value
    // so it should find nothing
    expect(result.size).toBe(0);
  });

  it("SQL injection in parserVersion is neutralised", () => {
    const db = freshDb();
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ secret: true }] },
    ], db);

    const injectedVersion = "v1' OR '1'='1";
    const result = getCachedParses("acc@example.com", "cargo", injectedVersion, ["m1"], db);
    expect(result.size).toBe(0);
  });

  it("unicode and very long accountId are stored and retrieved correctly (no truncation)", () => {
    const db = freshDb();
    const longId = "attacker@" + "x".repeat(500) + ".example.com";
    saveParsedResults(longId, "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ x: 1 }] },
    ], db);

    // Must not bleed into another account
    const other = getCachedParses("attacker@" + "x".repeat(499) + ".example.com", "cargo", "v1", ["m1"], db);
    expect(other.size).toBe(0);

    // Must be retrievable by exact match
    const exact = getCachedParses(longId, "cargo", "v1", ["m1"], db);
    expect(exact.size).toBe(1);
  });
});

// ── Focus Area 3: Cache Poisoning / Staleness ─────────────────────────────────

describe("Cache poisoning and staleness (FA-3)", () => {
  it("LLM timeout (empty items) is NOT cached — email can be retried", () => {
    const db = freshDb();
    // Simulate a timeout: items = []
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [] },
    ], db);

    // Must not be in cache — the empty-skip guard should have fired
    const result = getCachedParses("acc@example.com", "cargo", "v1", ["m1"], db);
    expect(result.size).toBe(0);
  });

  it("partial timeout batch: only successfully-parsed emails are cached", () => {
    const db = freshDb();
    // m1 parsed OK, m2 timed out
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK" }] },
      { gmailMessageId: "m2", items: [] },  // timeout
    ], db);

    const result = getCachedParses("acc@example.com", "cargo", "v1", ["m1", "m2"], db);
    expect(result.has("m1")).toBe(true);
    expect(result.has("m2")).toBe(false); // not cached — must be retried
  });

  /**
   * FINDING: Equasis verificationWarning is baked into cached vessel parse.
   *
   * After LLM parse, Equasis verification mutates allParsed in-place
   * (parse-vessel/route.ts lines 80-104). saveParsedResults is called AFTER
   * this mutation, so the verificationWarning is persisted. On all subsequent
   * visits the Equasis loop does NOT re-run for cached items (it only runs on
   * allParsed which is empty when all hit cache). A transient "IMO not found"
   * warning becomes permanent.
   *
   * Severity: MEDIUM — stale false-negative verification warnings survive indefinitely.
   */
  it("[FINDING-MEDIUM] verificationWarning stored in cache is served stale on subsequent requests", () => {
    const db = freshDb();
    // Simulate parse-vessel storing a result WITH Equasis warning baked in
    // (this is exactly what happens when Equasis is temporarily down / IMO unregistered)
    const staleCachedVessel = [{
      emailId: "m1",
      vesselName: { value: "MV TEST", confidence: "confirmed" },
      imo: "1234567",
      verificationWarning: "IMO not found in Equasis registry",  // <-- stale, transient
    }];
    saveParsedResults("acc@example.com", "vessel", "v1", [
      { gmailMessageId: "m1", items: staleCachedVessel },
    ], db);

    // On next request: getCachedParses returns the stale warning
    const cached = getCachedParses<typeof staleCachedVessel[0]>("acc@example.com", "vessel", "v1", ["m1"], db);
    expect(cached.has("m1")).toBe(true);
    const cachedItem = cached.get("m1")![0];
    // The stale warning is present — Equasis will NOT be re-run for this cached result
    expect(cachedItem.verificationWarning).toBe("IMO not found in Equasis registry");
    // This is the bug: a valid vessel that was added to Equasis after first parse
    // will continue to show the stale warning on every subsequent visit.
  });

  it("ON CONFLICT DO UPDATE properly overwrites stale result_json", () => {
    const db = freshDb();
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK", version: 1 }] },
    ], db);
    // Same key — overwrites
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "TANKER", version: 2 }] },
    ], db);
    const result = getCachedParses<{ cargoType: string; version: number }>("acc@example.com", "cargo", "v1", ["m1"], db);
    expect(result.get("m1")![0].cargoType).toBe("TANKER");
    expect(result.get("m1")![0].version).toBe(2);
  });
});

// ── Focus Area 5: Auth / accountId handling ───────────────────────────────────

describe("Auth and accountId (FA-5)", () => {
  it("null/undefined accountId bypasses cache — no crash and no cross-session bleed", () => {
    const db = freshDb();
    // Seed legitimate data
    saveParsedResults("legitimate@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK" }] },
    ], db);

    // Route code: `accountId ? getCachedParses(...) : new Map()`
    // When accountId is undefined, the ternary returns an empty Map — no DB call
    const accountId: string | undefined = undefined;
    const cached = accountId
      ? getCachedParses("legitimate@example.com", "cargo", "v1", ["m1"], db)
      : new Map<string, unknown[]>();
    expect(cached.size).toBe(0);  // safe fallback, no cross-session bleed
  });

  it("empty string accountId does not match rows from a real account", () => {
    const db = freshDb();
    saveParsedResults("real@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK" }] },
    ], db);

    const result = getCachedParses("", "cargo", "v1", ["m1"], db);
    expect(result.size).toBe(0);
  });

  it("accountId with special regex/glob chars is stored as a literal string", () => {
    const db = freshDb();
    const tricky = "acc%._%@example.com"; // SQL LIKE wildcards
    saveParsedResults(tricky, "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ x: 1 }] },
    ], db);

    // Should not match 'accXXX@example.com' etc.
    const notMatched = getCachedParses("accABC@example.com", "cargo", "v1", ["m1"], db);
    expect(notMatched.size).toBe(0);

    // Exact match should work
    const matched = getCachedParses(tricky, "cargo", "v1", ["m1"], db);
    expect(matched.size).toBe(1);
  });
});

// ── Focus Area 6: Boundary Inputs ────────────────────────────────────────────

describe("Boundary inputs (FA-6)", () => {
  it("empty gmailMessageIds list returns empty Map without hitting db", () => {
    const db = freshDb();
    const result = getCachedParses("acc@example.com", "cargo", "v1", [], db);
    expect(result.size).toBe(0);
  });

  it("upsertEmails with null fields does not throw", () => {
    const db = freshDb();
    const emailWithNulls: Email = {
      id: "m-nulls",
      threadId: "",
      from: "",
      fromName: null,
      fromEmail: null,
      to: "",
      subject: "",
      date: "",
      body: "",
      snippet: "",
      labelIds: [],
    };
    expect(() => upsertEmails("acc@example.com", [emailWithNulls], db)).not.toThrow();
    const row = db
      .prepare("SELECT gmail_message_id FROM emails WHERE gmail_message_id=?")
      .get("m-nulls");
    expect(row).toBeTruthy();
  });

  it("malformed result_json in DB does not crash the reader (JSON.parse throws)", () => {
    const db = freshDb();
    migration031.up(db);
    // Directly inject corrupted JSON
    db.prepare(
      "INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json, parsed_at) VALUES (?,?,?,?,?, datetime('now'))"
    ).run("acc@example.com", "m-corrupt", "cargo", "v1", "NOT_VALID_JSON{{{");

    // getCachedParses will call JSON.parse on the corrupt row — this should throw
    // Currently there is NO try/catch around JSON.parse in getCachedParses (email-cache.ts:35)
    // This demonstrates the bug: corrupt DB data crashes the route
    expect(() =>
      getCachedParses("acc@example.com", "cargo", "v1", ["m-corrupt"], db)
    ).toThrow();
    // NOTE: This test documents that getCachedParses has NO defensive JSON.parse
    // guard. A corrupt row (hardware error, manual admin edit, or future migration bug)
    // will crash ALL parse routes that hit the cache. Severity: MEDIUM.
  });

  it("large number of message IDs (1000) is handled without SQLite variable limit error", () => {
    const db = freshDb();
    const ids = Array.from({ length: 1000 }, (_, i) => `msg-${i}`);
    expect(() => getCachedParses("acc@example.com", "cargo", "v1", ids, db)).not.toThrow();
  });

  it("unicode accountId and message IDs round-trip correctly", () => {
    const db = freshDb();
    const unicodeAccountId = "用户@邮件.中国";
    const unicodeMsgId = "msg-αβγδ-🚢";
    saveParsedResults(unicodeAccountId, "cargo", "v1", [
      { gmailMessageId: unicodeMsgId, items: [{ test: "unicode" }] },
    ], db);
    const result = getCachedParses<{ test: string }>(unicodeAccountId, "cargo", "v1", [unicodeMsgId], db);
    expect(result.get(unicodeMsgId)).toEqual([{ test: "unicode" }]);
  });
});

// ── Focus Area 7: Regression checks ─────────────────────────────────────────

describe("Regression: split-and-merge logic (FA-7)", () => {
  it("fully-cached batch: mergedCargos contains all cached items (simulated)", () => {
    const db = freshDb();
    // Pre-seed cache for two emails
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK", emailId: "m1" }] },
      { gmailMessageId: "m2", items: [{ cargoType: "OIL", emailId: "m2" }] },
    ], db);

    const emailIds = ["m1", "m2"];
    const cached = getCachedParses<{ cargoType: string; emailId: string }>(
      "acc@example.com", "cargo", "v1", emailIds, db
    );

    // Simulate parse-cargo: toParse is empty (all cached), allParsed is []
    const allParsed: { cargoType: string; emailId: string }[] = [];
    const mergedCargos = [...allParsed, ...Array.from(cached.values()).flat()];

    expect(mergedCargos.length).toBe(2);
    expect(mergedCargos.map(c => c.cargoType).sort()).toEqual(["BULK", "OIL"]);
  });

  it("mixed batch: uncached emails are parsed, cached emails come from store, result is merged", () => {
    const db = freshDb();
    // m1 is already cached
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m1", items: [{ cargoType: "BULK", emailId: "m1" }] },
    ], db);

    const allEmails = ["m1", "m2"];
    const cached = getCachedParses<{ cargoType: string; emailId: string }>(
      "acc@example.com", "cargo", "v1", allEmails, db
    );
    const toParse = allEmails.filter(id => !cached.has(id));
    expect(toParse).toEqual(["m2"]);

    // Simulate parse of m2
    const freshParsed = [{ cargoType: "OIL", emailId: "m2" }];
    saveParsedResults("acc@example.com", "cargo", "v1", [
      { gmailMessageId: "m2", items: freshParsed },
    ], db);

    const mergedCargos = [...freshParsed, ...Array.from(cached.values()).flat()];
    expect(mergedCargos.length).toBe(2);
    const types = mergedCargos.map(c => c.cargoType).sort();
    expect(types).toEqual(["BULK", "OIL"]);
  });

  /**
   * FINDING: IMSBC RAG keywords built from toParse only.
   *
   * When all cargoEmails hit the cache (toParse=[]), cargoKeywords="" and the
   * IMSBC query degrades to generic terms. This is a RAG-quality regression
   * for cached-heavy requests, not a security issue.
   * Severity: LOW.
   */
  it("[FINDING-LOW] when all emails are cached, toParse is empty => IMSBC keywords would be empty string", () => {
    // This test documents the logic regression in parse-cargo/route.ts lines 220-224.
    // The code: `const cargoKeywords = toParse.map(e => e.body.slice(0,200)).join(' ').slice(0,400);`
    // When toParse === [] then cargoKeywords === "" and the IMSBC query becomes
    // "cargo safety stowage hazmat bulk " with no email-specific terms.
    const toParse: { body: string }[] = []; // all cached
    const cargoKeywords = toParse.map(e => e.body.slice(0, 200)).join(' ').slice(0, 400);
    expect(cargoKeywords).toBe("");
    // The final IMSBC query would be: "cargo safety stowage hazmat bulk " — generic, not email-driven
  });
});
