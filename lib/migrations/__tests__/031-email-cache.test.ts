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
