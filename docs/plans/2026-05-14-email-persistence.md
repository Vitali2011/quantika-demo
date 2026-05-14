# Email Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist fetched emails and LLM parse results in SQLite so emails are not re-parsed (re-billed, re-waited) on every session.

**Architecture:** Two new tables in `data/sessions.db` (migration 031): `emails` (raw, keyed by `account_id` + Gmail message-id) and `parsed_results` (LLM output, additionally keyed by `parse_type` + `parser_version`). A new `lib/email-cache.ts` helper centralises all SQL. The three parse routes (`cargo` / `vessel` / `recap`) check the cache before calling the LLM and write fresh results back (split-and-merge). A new `account_id` — the Gmail account email, fetched once at OAuth callback — is the multi-tenant owner key.

**Tech Stack:** Next.js 16, TypeScript 5, better-sqlite3, existing migration runner, Jest.

**Design doc:** `docs/plans/2026-05-14-email-persistence-design.md`

**Conventions to follow:**

- Migrations: see `lib/migrations/030-roi-metrics.ts` for the exact format (`version`, `name`, `up`, `down`).
- DB handle: `getDb()` from `@/lib/db` opens a connection to `data/sessions.db` (same file the migration runner uses). The existing parse-cargo RAG code already uses this pattern.
- Tests live next to code under `__tests__/` or `lib/__tests__/`, run with `npx jest <path>`.
- Commit after every task with a green test run.

---

### Task 1: Migration 031 — `emails` + `parsed_results` tables

**Files:**

- Create: `lib/migrations/031-email-cache.ts`
- Modify: `lib/migrations/index.ts` (add import + array entry)
- Test: `lib/migrations/__tests__/031-email-cache.test.ts`

**Step 1: Write the failing test**

```ts
import Database from "better-sqlite3";
import migration031 from "../031-email-cache";

describe("migration 031 — email-cache", () => {
  function freshDb(): Database.Database {
    const db = new Database(":memory:");
    migration031.up(db);
    return db;
  }

  it("creates emails table with composite PK", () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name,
        from_email, to_addr, subject, date, body, snippet, label_ids)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      "acc@x.com",
      "msg1",
      "thr1",
      "A <a@x>",
      "A",
      "a@x",
      "b@x",
      "Subj",
      "Mon",
      "Body",
      "snip",
      "[]"
    );
    const row = db
      .prepare("SELECT * FROM emails WHERE account_id=? AND gmail_message_id=?")
      .get("acc@x.com", "msg1") as { body: string };
    expect(row.body).toBe("Body");
  });

  it("emails PK rejects duplicate (account_id, gmail_message_id)", () => {
    const db = freshDb();
    const ins = db.prepare(
      `INSERT INTO emails (account_id, gmail_message_id, thread_id, from_addr, from_name,
        from_email, to_addr, subject, date, body, snippet, label_ids)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    ins.run("acc", "m1", "t", "f", null, null, "t", "s", "d", "b", "sn", "[]");
    expect(() =>
      ins.run("acc", "m1", "t", "f", null, null, "t", "s", "d", "b", "sn", "[]")
    ).toThrow();
  });

  it("creates parsed_results table with 4-part composite PK", () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json)
       VALUES (?,?,?,?,?)`
    ).run("acc", "m1", "cargo", "v1", '[{"x":1}]');
    const row = db
      .prepare(
        `SELECT result_json FROM parsed_results
       WHERE account_id=? AND gmail_message_id=? AND parse_type=? AND parser_version=?`
      )
      .get("acc", "m1", "cargo", "v1") as { result_json: string };
    expect(JSON.parse(row.result_json)).toEqual([{ x: 1 }]);
  });

  it("parsed_results allows same email under a different parser_version", () => {
    const db = freshDb();
    const ins = db.prepare(
      `INSERT INTO parsed_results (account_id, gmail_message_id, parse_type, parser_version, result_json)
       VALUES (?,?,?,?,?)`
    );
    ins.run("acc", "m1", "cargo", "v1", "[]");
    expect(() => ins.run("acc", "m1", "cargo", "v2", "[]")).not.toThrow();
  });

  it("down() drops both tables", () => {
    const db = freshDb();
    migration031.down(db);
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('emails','parsed_results')`
      )
      .all();
    expect(tables).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/migrations/__tests__/031-email-cache.test.ts`
Expected: FAIL — cannot find module `../031-email-cache`.

**Step 3: Write the migration**

```ts
// lib/migrations/031-email-cache.ts
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
```

Then modify `lib/migrations/index.ts`: add `import migration031 from './031-email-cache';` after the `migration030` import, and append `migration031` to the `allMigrations` array.

**Step 4: Run test to verify it passes**

Run: `npx jest lib/migrations/__tests__/031-email-cache.test.ts`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add lib/migrations/031-email-cache.ts lib/migrations/index.ts lib/migrations/__tests__/031-email-cache.test.ts
git commit -m "feat(email-persistence): migration 031 — emails + parsed_results tables"
```

---

### Task 2: `lib/email-cache.ts` helper

Centralises all email-cache SQL so the three parse routes do not duplicate it.

**Files:**

- Create: `lib/email-cache.ts`
- Test: `lib/__tests__/email-cache.test.ts`

**Step 1: Write the failing test**

The test must run migration 031 against an in-memory DB and inject that DB into the helper. To make the helper testable, every exported function takes an **optional `db` parameter** defaulting to `getDb()`.

```ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/email-cache.test.ts`
Expected: FAIL — cannot find module `../email-cache`.

**Step 3: Write the helper**

```ts
// lib/email-cache.ts
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
    map.set(row.gmail_message_id, JSON.parse(row.result_json) as T[]);
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
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/email-cache.test.ts`
Expected: PASS (9 tests).

**Step 5: Commit**

```bash
git add lib/email-cache.ts lib/__tests__/email-cache.test.ts
git commit -m "feat(email-persistence): lib/email-cache.ts cache helper"
```

---

### Task 3: Account identity — `accountId` on the session

Adds the stable multi-tenant owner key: the Gmail account email, fetched once at the OAuth callback.

**Files:**

- Modify: `lib/types.ts:459-476` (add `accountId?` to `SessionData`)
- Modify: `lib/google.ts` (add `fetchGmailProfile`)
- Modify: `app/api/auth/google/route.ts` (call it, store on session)
- Test: `lib/__tests__/google-profile.test.ts`

**Step 1: Write the failing test**

```ts
import { fetchGmailProfile } from "../google";

jest.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })) },
    gmail: jest.fn().mockReturnValue({
      users: {
        getProfile: jest.fn().mockResolvedValue({ data: { emailAddress: "broker@etm.net" } }),
      },
    }),
  },
}));

describe("fetchGmailProfile", () => {
  it("returns the account email address", async () => {
    await expect(fetchGmailProfile("token")).resolves.toBe("broker@etm.net");
  });

  it("returns null when Gmail returns no emailAddress", async () => {
    const { google } = jest.requireMock("googleapis");
    google.gmail.mockReturnValueOnce({
      users: { getProfile: jest.fn().mockResolvedValue({ data: {} }) },
    });
    await expect(fetchGmailProfile("token")).resolves.toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/google-profile.test.ts`
Expected: FAIL — `fetchGmailProfile` is not exported.

**Step 3: Implement**

In `lib/types.ts`, add to `SessionData` (after `isSampleData?: boolean;`):

```ts
  /** Gmail account email — stable multi-tenant owner key for persisted data. */
  accountId?: string;
```

In `lib/google.ts`, add:

```ts
/** Fetch the Gmail account's own email address — used as the persistence owner key. */
export async function fetchGmailProfile(accessToken: string): Promise<string | null> {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.emailAddress ?? null;
}
```

In `app/api/auth/google/route.ts`, change the success block. It currently does:

```ts
const accessToken = await exchangeCodeForToken(code);
const sessionId = createSession(accessToken);
```

Change to (import `fetchGmailProfile` from `@/lib/google` and `updateSession` from `@/lib/session`):

```ts
const accessToken = await exchangeCodeForToken(code);
const sessionId = createSession(accessToken);
try {
  const accountId = await fetchGmailProfile(accessToken);
  if (accountId) updateSession(sessionId, { accountId });
} catch (err) {
  // Profile lookup is non-fatal — without accountId the app falls back to
  // the legacy ephemeral path (parse, don't cache). Never block login.
  logger.error({ err }, "Gmail profile fetch failed");
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/google-profile.test.ts`
Expected: PASS (2 tests).

Also run the existing auth route tests to confirm no regression:
Run: `npx jest app/api/auth/__tests__`
Expected: PASS.

**Step 5: Commit**

```bash
git add lib/types.ts lib/google.ts app/api/auth/google/route.ts lib/__tests__/google-profile.test.ts
git commit -m "feat(email-persistence): fetch + store Gmail accountId on session"
```

---

### Task 4: Persist raw emails on fetch

**Files:**

- Modify: `app/api/emails/fetch/route.ts`
- Test: `app/api/emails/__tests__/fetch-persists.test.ts`

**Step 1: Write the failing test**

```ts
import { POST } from "../fetch/route";
import * as session from "@/lib/session";
import * as google from "@/lib/google";
import * as cache from "@/lib/email-cache";
import { NextRequest } from "next/server";

jest.mock("@/lib/google");
jest.mock("@/lib/email-cache");

function req(): NextRequest {
  return new NextRequest("http://x/api/emails/fetch", {
    method: "POST",
    headers: { cookie: "session_id=s1" },
  });
}

describe("emails/fetch persists raw emails", () => {
  beforeEach(() => jest.restoreAllMocks());

  it("upserts fetched emails under the session accountId", async () => {
    jest.spyOn(session, "getSession").mockReturnValue({
      id: "s1",
      accountId: "broker@etm.net",
      emails: [],
      isSampleData: false,
    } as never);
    jest.spyOn(session, "updateSession").mockReturnValue(true);
    jest
      .spyOn(google, "fetchGmailEmails")
      .mockResolvedValue([
        {
          id: "m1",
          threadId: "t",
          from: "a",
          fromName: null,
          fromEmail: null,
          to: "b",
          subject: "s",
          date: "d",
          body: "B",
          snippet: "sn",
          labelIds: [],
        },
      ]);
    const upsertSpy = jest.spyOn(cache, "upsertEmails").mockReturnValue();

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(upsertSpy).toHaveBeenCalledWith(
      "broker@etm.net",
      expect.arrayContaining([expect.objectContaining({ id: "m1" })])
    );
  });

  it("does not upsert when session has no accountId (legacy fallback)", async () => {
    jest.spyOn(session, "getSession").mockReturnValue({
      id: "s1",
      emails: [],
      isSampleData: false,
    } as never);
    jest.spyOn(session, "updateSession").mockReturnValue(true);
    jest.spyOn(google, "fetchGmailEmails").mockResolvedValue([]);
    const upsertSpy = jest.spyOn(cache, "upsertEmails").mockReturnValue();

    await POST(req());
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest app/api/emails/__tests__/fetch-persists.test.ts`
Expected: FAIL — `upsertEmails` is never called.

**Step 3: Implement**

In `app/api/emails/fetch/route.ts`, import `upsertEmails` from `@/lib/email-cache`. After the existing `updateSession(sessionId, { emails: truncatedEmails });` line, add:

```ts
// Persist raw emails for the cache layer. accountId may be absent on legacy
// sessions — in that case we keep today's ephemeral behavior (no persistence).
if (session.accountId) {
  try {
    upsertEmails(session.accountId, truncatedEmails);
  } catch (err) {
    // Persistence failure must not break the fetch response.
    logger.error({ err }, "Email persistence (upsertEmails) failed");
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest app/api/emails/__tests__/fetch-persists.test.ts`
Expected: PASS (2 tests).

**Step 5: Commit**

```bash
git add app/api/emails/fetch/route.ts app/api/emails/__tests__/fetch-persists.test.ts
git commit -m "feat(email-persistence): persist raw emails on /api/emails/fetch"
```

---

### Task 5: Wire cache into `parse-cargo`

**Files:**

- Modify: `app/api/ai/parse-cargo/route.ts` (the `POST` handler only)
- Test: `app/api/ai/__tests__/parse-cargo-cache.test.ts`

**Context:** the current `POST` builds `cargoEmails`, optionally builds `imsbcSystemContext`, builds `prompts` from `cargoEmails`, runs `Promise.all` over `cargoEmails` filling `allParsed`, then `updateSession`. We change it to parse only the **uncached** subset and merge.

**Step 1: Write the failing test**

Mock `@/lib/ai-provider` so we can assert the LLM call count.

```ts
import { POST } from "../parse-cargo/route";
import * as session from "@/lib/session";
import * as cache from "@/lib/email-cache";
import * as ai from "@/lib/ai-provider";
import { NextRequest } from "next/server";

jest.mock("@/lib/csrf", () => ({ validateCsrf: () => true }));
jest.mock("@/lib/email-cache");
jest.mock("@/lib/ai-provider");

const mkEmail = (id: string) => ({
  id,
  threadId: "t",
  from: "a",
  fromName: null,
  fromEmail: null,
  to: "b",
  subject: "s",
  date: "d",
  body: "cargo body",
  snippet: "",
  labelIds: [],
});
const mkSession = (ids: string[]) => ({
  id: "s1",
  accountId: "acc@x",
  emails: ids.map(mkEmail),
  classifications: ids.map((id) => ({ emailId: id, category: "CARGO_INQUIRY" })),
  parsedCargos: [],
  parsedVessels: [],
  processedEmails: [],
  classifications2: [],
});

function req() {
  return new NextRequest("http://x/api/ai/parse-cargo", {
    method: "POST",
    headers: { cookie: "session_id=s1" },
  });
}

describe("parse-cargo cache", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(session, "updateSession").mockReturnValue(true);
    jest.spyOn(cache, "hashParserVersion").mockReturnValue("vX");
    jest.spyOn(cache, "saveParsedResults").mockReturnValue();
  });

  it("skips the LLM for emails already in the cache", async () => {
    jest.spyOn(session, "requireSession").mockReturnValue({
      session: mkSession(["m1", "m2"]),
      sessionId: "s1",
    } as never);
    // m1 cached, m2 not
    jest
      .spyOn(cache, "getCachedParses")
      .mockReturnValue(new Map([["m1", [{ emailId: "m1", itemIndex: 0 }]]]));
    const aiSpy = jest.spyOn(ai, "callAiJson").mockResolvedValue({ items: [] } as never);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(aiSpy).toHaveBeenCalledTimes(1); // only m2
  });

  it("zero LLM calls when every email is cached", async () => {
    jest.spyOn(session, "requireSession").mockReturnValue({
      session: mkSession(["m1", "m2"]),
      sessionId: "s1",
    } as never);
    jest.spyOn(cache, "getCachedParses").mockReturnValue(
      new Map([
        ["m1", [{ emailId: "m1", itemIndex: 0 }]],
        ["m2", [{ emailId: "m2", itemIndex: 0 }]],
      ])
    );
    const aiSpy = jest.spyOn(ai, "callAiJson").mockResolvedValue({ items: [] } as never);

    const res = await POST(req());
    const body = await res.json();
    expect(aiSpy).not.toHaveBeenCalled();
    expect(body.count).toBe(2); // merged from cache
  });

  it("persists freshly parsed results", async () => {
    jest.spyOn(session, "requireSession").mockReturnValue({
      session: mkSession(["m1"]),
      sessionId: "s1",
    } as never);
    jest.spyOn(cache, "getCachedParses").mockReturnValue(new Map());
    jest
      .spyOn(ai, "callAiJson")
      .mockResolvedValue({ items: [{ cargo_description: "steel" }] } as never);
    const saveSpy = jest.spyOn(cache, "saveParsedResults");

    await POST(req());
    expect(saveSpy).toHaveBeenCalledWith(
      "acc@x",
      "cargo",
      "vX",
      expect.arrayContaining([expect.objectContaining({ gmailMessageId: "m1" })])
    );
  });

  it("falls back to parsing everything when accountId is absent", async () => {
    const s = mkSession(["m1"]);
    delete (s as { accountId?: string }).accountId;
    jest.spyOn(session, "requireSession").mockReturnValue({ session: s, sessionId: "s1" } as never);
    const getSpy = jest.spyOn(cache, "getCachedParses");
    const aiSpy = jest.spyOn(ai, "callAiJson").mockResolvedValue({ items: [] } as never);

    await POST(req());
    expect(getSpy).not.toHaveBeenCalled();
    expect(aiSpy).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest app/api/ai/__tests__/parse-cargo-cache.test.ts`
Expected: FAIL — LLM called for every email; `saveParsedResults` never called.

**Step 3: Implement**

In `app/api/ai/parse-cargo/route.ts`, import at the top:

```ts
import { getCachedParses, saveParsedResults, hashParserVersion } from "@/lib/email-cache";
```

In `POST`, after the line `const cargoEmails = session.emails.filter(e => cargoInquiryIds.includes(e.id));` and before the `if (cargoEmails.length === 0)` block, insert:

```ts
// Email-cache: parse only the emails we have not parsed before (same prompt
// version). RAG flag is folded into the version because it changes output.
const accountId = session.accountId;
const parserVersion = hashParserVersion(
  CARGO_INQUIRY_PARSER_PROMPT + (isRagEnabled() ? ":rag" : "")
);
const cached = accountId
  ? getCachedParses<ParsedCargo>(
      accountId,
      "cargo",
      parserVersion,
      cargoEmails.map((e) => e.id)
    )
  : new Map<string, ParsedCargo[]>();
const toParse = cargoEmails.filter((e) => !cached.has(e.id));
```

Then replace every later use of `cargoEmails` **inside the parsing section** with `toParse`:

- the `imsbcSystemContext` keyword build (`cargoEmails.map(...)` → `toParse.map(...)`)
- `const prompts = buildCargoPrompts(cargoEmails);` → `buildCargoPrompts(toParse)`
- `await Promise.all(cargoEmails.map((email, i) => ...))` → `toParse.map((email, i) => ...)`

Leave the early-return guard `if (cargoEmails.length === 0)` using `cargoEmails` (correct — nothing to do at all).

After the `Promise.all` fills `allParsed`, before `buildProcessedEmails`, insert:

```ts
// Persist fresh results, then merge with the cached ones for this response.
if (accountId) {
  saveParsedResults<ParsedCargo>(
    accountId,
    "cargo",
    parserVersion,
    toParse.map((e) => ({
      gmailMessageId: e.id,
      items: allParsed.filter((c) => c.emailId === e.id),
    }))
  );
}
const mergedCargos = [...allParsed, ...Array.from(cached.values()).flat()];
```

Then change `buildProcessedEmails(... allParsed, ...)` → `... mergedCargos, ...` and
`updateSession(sessionId, { parsedCargos: allParsed, processedEmails })` →
`updateSession(sessionId, { parsedCargos: mergedCargos, processedEmails })` and
`return NextResponse.json({ count: allParsed.length })` → `{ count: mergedCargos.length }`.

> Note: the `isSampleData` early-return stays exactly as-is, above all of this.

**Step 4: Run tests**

Run: `npx jest app/api/ai/__tests__/parse-cargo-cache.test.ts`
Expected: PASS (4 tests).

Run the existing parse-cargo suite for regression:
Run: `npx jest app/api/ai/__tests__/parse-cargo`
Expected: PASS (existing tests green — route signature unchanged).

**Step 5: Commit**

```bash
git add app/api/ai/parse-cargo/route.ts app/api/ai/__tests__/parse-cargo-cache.test.ts
git commit -m "feat(email-persistence): cache-aware parse-cargo (split-and-merge)"
```

---

### Task 6: Wire cache into `parse-vessel`

Same split-and-merge pattern. `parse-vessel` uses `callAiText` (not `callAiJson`) and runs an Equasis verification pass over `allParsed` — the cached vessels were already verified when first parsed, so they correctly skip Equasis (only `allParsed` from `toParse` goes through it).

**Files:**

- Modify: `app/api/ai/parse-vessel/route.ts`
- Test: `app/api/ai/__tests__/parse-vessel-cache.test.ts`

**Step 1: Write the failing test**

Mirror Task 5's test, adapted: mock `@/lib/ai-provider` `callAiText`, category `VESSEL_POSITION`, type `ParsedVessel`, assert `getCachedParses(accountId, 'vessel', ...)`. Include the same four cases: partial cache → 1 LLM call, full cache → 0 calls + correct `count`, fresh parse → `saveParsedResults` called with `'vessel'`, no `accountId` → no cache use.

**Step 2: Run test — Expected: FAIL.**

**Step 3: Implement**

Import `getCachedParses, saveParsedResults, hashParserVersion` from `@/lib/email-cache`.

After `const vesselEmails = session.emails.filter(e => vesselIds.includes(e.id));`, insert:

```ts
const accountId = session.accountId;
const parserVersion = hashParserVersion(VESSEL_POSITION_PARSER_PROMPT);
const cached = accountId
  ? getCachedParses<ParsedVessel>(
      accountId,
      "vessel",
      parserVersion,
      vesselEmails.map((e) => e.id)
    )
  : new Map<string, ParsedVessel[]>();
const toParse = vesselEmails.filter((e) => !cached.has(e.id));
```

Change `await Promise.all(vesselEmails.map(...))` → `toParse.map(...)`. The Equasis loop stays over `allParsed` (the fresh ones only — correct). After the Equasis loop, before `buildProcessedEmails`:

```ts
if (accountId) {
  saveParsedResults<ParsedVessel>(
    accountId,
    "vessel",
    parserVersion,
    toParse.map((e) => ({
      gmailMessageId: e.id,
      items: allParsed.filter((v) => v.emailId === e.id),
    }))
  );
}
const mergedVessels = [...allParsed, ...Array.from(cached.values()).flat()];
```

Replace `allParsed` with `mergedVessels` in the `buildProcessedEmails` call, the `updateSession({ parsedVessels: ... })`, and the `count` in the response. Keep the `isSampleData` early-return and the `vesselEmails.length === 0` guard as-is.

**Step 4: Run tests**

Run: `npx jest app/api/ai/__tests__/parse-vessel-cache.test.ts`
Expected: PASS.
Run: `npx jest app/api/ai/__tests__/parse-vessel`
Expected: PASS (regression).

**Step 5: Commit**

```bash
git add app/api/ai/parse-vessel/route.ts app/api/ai/__tests__/parse-vessel-cache.test.ts
git commit -m "feat(email-persistence): cache-aware parse-vessel (split-and-merge)"
```

---

### Task 7: Wire cache into `parse-recap`

Same pattern. `parse-recap` has **no `isSampleData` early-return** and computes `commissionSummary` from the full set — so summarise over the **merged** list.

**Files:**

- Modify: `app/api/ai/parse-recap/route.ts`
- Test: `app/api/ai/__tests__/parse-recap-cache.test.ts`

**Step 1: Write the failing test**

Mirror Task 5's test: category `FIXTURE_RECAP`, type `ParsedFixtureRecap`, mock `callAiText`. Four cases (partial / full / fresh-persist / no-accountId). Add one extra assertion: when one recap is cached and one freshly parsed, the response `count` equals 2 (merge correctness).

**Step 2: Run test — Expected: FAIL.**

**Step 3: Implement**

Import `getCachedParses, saveParsedResults, hashParserVersion` from `@/lib/email-cache`.

After `const fixtureEmails = session.emails.filter(e => fixtureIds.includes(e.id));`, insert:

```ts
const accountId = session.accountId;
const parserVersion = hashParserVersion(FIXTURE_RECAP_PARSER_PROMPT);
const cached = accountId
  ? getCachedParses<ParsedFixtureRecap>(
      accountId,
      "recap",
      parserVersion,
      fixtureEmails.map((e) => e.id)
    )
  : new Map<string, ParsedFixtureRecap[]>();
const toParse = fixtureEmails.filter((e) => !cached.has(e.id));
```

Change `fixtureEmails.map(...)` in the `Promise.all` → `toParse.map(...)`. After `parsedFixtureRecaps` is built (the filtered non-null array), insert:

```ts
if (accountId) {
  saveParsedResults<ParsedFixtureRecap>(
    accountId,
    "recap",
    parserVersion,
    toParse.map((e) => ({
      gmailMessageId: e.id,
      items: parsedFixtureRecaps.filter((r) => r.emailId === e.id),
    }))
  );
}
const mergedRecaps = [...parsedFixtureRecaps, ...Array.from(cached.values()).flat()];
```

Change `summarizeCommissions(parsedFixtureRecaps)` → `summarizeCommissions(mergedRecaps)`,
`updateSession(sessionId, { parsedFixtureRecaps, commissionSummary })` →
`{ parsedFixtureRecaps: mergedRecaps, commissionSummary }`, and the response
`count: parsedFixtureRecaps.length` → `count: mergedRecaps.length`. Keep the
`fixtureEmails.length === 0` guard as-is.

> Note: `ParsedFixtureRecap` must expose `emailId` for the `.filter(r => r.emailId === e.id)`
> grouping — confirm in `lib/types.ts` during implementation; `parseRecapAIResponse(raw, email.id)`
> already receives the id, so it should be present.

**Step 4: Run tests**

Run: `npx jest app/api/ai/__tests__/parse-recap-cache.test.ts`
Expected: PASS.
Run: `npx jest app/api/ai/__tests__/parse-recap`
Expected: PASS (regression).

**Step 5: Commit**

```bash
git add app/api/ai/parse-recap/route.ts app/api/ai/__tests__/parse-recap-cache.test.ts
git commit -m "feat(email-persistence): cache-aware parse-recap (split-and-merge)"
```

---

### Task 8: Full-suite regression + typecheck

**Step 1:** Run the type checker.
Run: `npx tsc --noEmit`
Expected: no errors.

**Step 2:** Run the full test suite.
Run: `npx jest`
Expected: all green (pre-existing skips allowed; 0 fail).

**Step 3:** If anything fails, fix it before proceeding — do not rewrite test expectations to match (PI3: >5 test-expectation changes = STOP and reassess).

**Step 4: Commit** (only if fixes were needed)

```bash
git commit -am "fix(email-persistence): regression fixes from full-suite run"
```

---

## Done — Definition of Success

- Migration 031 applies cleanly on a fresh DB and on the existing `data/sessions.db`.
- A second parse of the same emails (same prompt version) makes **zero** LLM calls.
- Two different `accountId`s never see each other's emails or parses.
- Sessions without `accountId` behave exactly as before (parse, no cache) — no crashes.
- `npx tsc --noEmit` clean; `npx jest` green.

## Out of Scope (later, separate work)

History UI, email search, deal-over-time analytics, retention cron / TTL, "delete my data"
UI button, privacy policy / landing copy update. `import-gmail-emails.ts` writing to the
`emails` table was considered and deferred — the corpus flow is independent of the web cache.
