import fs from "fs";
import path from "path";
import os from "os";

/**
 * Tests for extract-corpus-cases CLI logic.
 *
 * We import the helper modules directly (corpus-filter-dsl) and simulate
 * the extract behavior using temp dirs + fixture corpus files.
 */

import { parseDsl, matchesFilter } from "../lib/corpus-filter-dsl";

// ---------------------------------------------------------------------------
// Helpers used by both tests and production code
// ---------------------------------------------------------------------------

interface Email {
  id?: string;
  subject?: string;
  body?: string;
  from?: string;
  date?: string;
  [key: string]: unknown;
}

interface SampleDoc {
  id: string;
  category: string;
  edge_case_summary: string;
  input: {
    raw_email: {
      subject: string;
      body: string;
      from: string;
      date: string;
    };
  };
}

function buildSampleDoc(email: Email, category: string, index: number): SampleDoc {
  const sampleNum = String(index + 1).padStart(3, "0");
  return {
    id: `${category}/sample-${sampleNum}`,
    category,
    edge_case_summary: "TODO: fill in",
    input: {
      raw_email: {
        subject: email.subject ?? "",
        body: email.body ?? "",
        from: email.from ?? "",
        date: email.date ?? "",
      },
    },
  };
}

function runExtract(
  emails: Email[],
  whereExpr: string | null,
  count: number,
  toDir: string
): { written: number; error?: string } {
  // Parse filter
  let predicates: ReturnType<typeof parseDsl>["predicates"] = [];
  if (whereExpr) {
    const parsed = parseDsl(whereExpr);
    if (parsed.error) {
      return { written: 0, error: parsed.error };
    }
    predicates = parsed.predicates!;
  }

  // Filter emails
  const filtered = emails.filter((e) => matchesFilter(e, predicates ?? []));
  const selected = filtered.slice(0, count);

  // Ensure output dir exists
  fs.mkdirSync(toDir, { recursive: true });
  const category = path.basename(toDir);

  let written = 0;
  for (let i = 0; i < selected.length; i++) {
    const doc = buildSampleDoc(selected[i], category, i);
    fs.writeFileSync(
      path.join(toDir, `sample-${String(i + 1).padStart(3, "0")}.json`),
      JSON.stringify(doc, null, 2)
    );
    written++;
  }

  return { written };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURE_EMAILS: Email[] = [
  {
    id: "msg-001",
    subject: "Open Position DWCC Vessel",
    body: "DWCC 32000mt available Hamburg. MV Pacific Star.",
    from: "broker@seaship.com",
    date: "2026-05-01",
  },
  {
    id: "msg-002",
    subject: "Cargo Inquiry Grain",
    body: "Wheat 28000mt from Constanta to Damietta. Laycan 25-30 May.",
    from: "charterer@ameropa.com",
    date: "2026-05-02",
  },
  {
    id: "msg-003",
    subject: "Bulk Open Position DWCC 35000",
    body: "Supramax DWCC 35000 open in Rotterdam next week.",
    from: "ops@bulkship.nl",
    date: "2026-05-03",
  },
  {
    id: "msg-004",
    subject: "Tanker Position",
    body: "VLCC tanker available Fujairah.",
    from: "tanker@gulf.ae",
    date: "2026-05-04",
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extract-corpus-cases: filtering", () => {
  it("body matches regex filter works", () => {
    const parsed = parseDsl("body matches /DWCC/i");
    expect(parsed.error).toBeUndefined();
    const filtered = FIXTURE_EMAILS.filter((e) =>
      matchesFilter(e, parsed.predicates!)
    );
    expect(filtered).toHaveLength(2); // msg-001 and msg-003
  });

  it("body contains filter works (case-insensitive)", () => {
    const parsed = parseDsl('body contains "tanker"');
    expect(parsed.error).toBeUndefined();
    const filtered = FIXTURE_EMAILS.filter((e) =>
      matchesFilter(e, parsed.predicates!)
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("msg-004");
  });

  it("subject contains filter works", () => {
    const parsed = parseDsl('subject contains "Open Position"');
    expect(parsed.error).toBeUndefined();
    const filtered = FIXTURE_EMAILS.filter((e) =>
      matchesFilter(e, parsed.predicates!)
    );
    // msg-001 "Open Position DWCC Vessel", msg-003 "Bulk Open Position DWCC 35000"
    expect(filtered).toHaveLength(2);
  });

  it("from contains filter works", () => {
    const parsed = parseDsl('from contains "seaship"');
    expect(parsed.error).toBeUndefined();
    const filtered = FIXTURE_EMAILS.filter((e) =>
      matchesFilter(e, parsed.predicates!)
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("msg-001");
  });

  it("AND filter: both conditions must match", () => {
    const parsed = parseDsl('body matches /DWCC/i AND from contains "bulkship"');
    expect(parsed.error).toBeUndefined();
    const filtered = FIXTURE_EMAILS.filter((e) =>
      matchesFilter(e, parsed.predicates!)
    );
    expect(filtered).toHaveLength(1); // only msg-003
    expect(filtered[0].id).toBe("msg-003");
  });

  it("no filter → all emails returned", () => {
    const filtered = FIXTURE_EMAILS.filter((e) => matchesFilter(e, []));
    expect(filtered).toHaveLength(FIXTURE_EMAILS.length);
  });
});

describe("extract-corpus-cases: --count limit", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("respects --count limit", () => {
    const toDir = path.join(tmpDir, "bulk_open");
    const result = runExtract(FIXTURE_EMAILS, "body matches /DWCC/i", 1, toDir);
    expect(result.error).toBeUndefined();
    expect(result.written).toBe(1);
    const files = fs.readdirSync(toDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe("sample-001.json");
  });

  it("count larger than matches → writes only matched count", () => {
    const toDir = path.join(tmpDir, "bulk_open2");
    const result = runExtract(FIXTURE_EMAILS, "body matches /DWCC/i", 100, toDir);
    expect(result.written).toBe(2); // only 2 DWCC emails
  });

  it("no --where → all emails up to count", () => {
    const toDir = path.join(tmpDir, "all_emails");
    const result = runExtract(FIXTURE_EMAILS, null, 3, toDir);
    expect(result.written).toBe(3);
  });
});

describe("extract-corpus-cases: output shape", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-shape-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("target directory is created automatically", () => {
    const toDir = path.join(tmpDir, "nested", "new_category");
    expect(fs.existsSync(toDir)).toBe(false);
    runExtract(FIXTURE_EMAILS, null, 1, toDir);
    expect(fs.existsSync(toDir)).toBe(true);
  });

  it("sample file has correct shape", () => {
    const category = "test_category";
    const toDir = path.join(tmpDir, category);
    runExtract(FIXTURE_EMAILS, null, 2, toDir);

    const files = fs.readdirSync(toDir).sort();
    expect(files).toEqual(["sample-001.json", "sample-002.json"]);

    const sample = JSON.parse(
      fs.readFileSync(path.join(toDir, "sample-001.json"), "utf-8")
    ) as SampleDoc;

    // Required fields
    expect(sample.id).toBe(`${category}/sample-001`);
    expect(sample.category).toBe(category);
    expect(sample.edge_case_summary).toBe("TODO: fill in");
    expect(sample.input).toBeDefined();
    expect(sample.input.raw_email).toBeDefined();
    expect(sample.input.raw_email.subject).toBe(FIXTURE_EMAILS[0].subject);
    expect(sample.input.raw_email.body).toBe(FIXTURE_EMAILS[0].body);
    expect(sample.input.raw_email.from).toBe(FIXTURE_EMAILS[0].from);
    expect(sample.input.raw_email.date).toBe(FIXTURE_EMAILS[0].date);
  });

  it("category is derived from basename of --to dir", () => {
    const toDir = path.join(tmpDir, "my_custom_category");
    runExtract(FIXTURE_EMAILS, null, 1, toDir);

    const sample = JSON.parse(
      fs.readFileSync(path.join(toDir, "sample-001.json"), "utf-8")
    ) as SampleDoc;

    expect(sample.category).toBe("my_custom_category");
    expect(sample.id).toBe("my_custom_category/sample-001");
  });

  it("files are named sample-NNN.json with zero-padding", () => {
    const toDir = path.join(tmpDir, "padding_test");
    runExtract(FIXTURE_EMAILS, null, 4, toDir);

    const files = fs.readdirSync(toDir).sort();
    expect(files).toEqual([
      "sample-001.json",
      "sample-002.json",
      "sample-003.json",
      "sample-004.json",
    ]);
  });

  it("invalid DSL returns error (not stack trace)", () => {
    const toDir = path.join(tmpDir, "err_test");
    const result = runExtract(FIXTURE_EMAILS, "date contains test", 5, toDir);
    expect(result.error).toBeDefined();
    expect(result.written).toBe(0);
  });
});
