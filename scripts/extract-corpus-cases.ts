#!/usr/bin/env tsx
/**
 * extract-corpus-cases.ts
 *
 * CLI helper to export a subset of the email corpus into /progonq sample format.
 *
 * Usage:
 *   npm run corpus:extract -- --where 'body matches /DWCC/i' --count 5 --to .progonq/test-extract/
 *
 * Output: <--to>/sample-001.json ... sample-NNN.json
 * Format compatible with .progonq/corpus/<category>/sample-NNN.json
 */

import fs from "fs";
import path from "path";
import { parseDsl, matchesFilter, EmailLike, Predicate } from "./lib/corpus-filter-dsl";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]): {
  where: string | null;
  count: number;
  to: string | null;
} {
  let where: string | null = null;
  let count = 10;
  let to: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--where" && argv[i + 1]) {
      where = argv[++i];
    } else if (argv[i] === "--count" && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      if (isNaN(n) || n < 1) {
        console.error("ERROR: --count must be a positive integer");
        process.exit(1);
      }
      count = n;
    } else if (argv[i] === "--to" && argv[i + 1]) {
      to = argv[++i];
    }
  }

  return { where, count, to };
}

// ---------------------------------------------------------------------------
// Email type (minimal, matching what build-corpus produces)
// ---------------------------------------------------------------------------
interface Email {
  id?: string;
  subject?: string;
  body?: string;
  from?: string;
  date?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.to) {
    console.error("ERROR: --to <directory> is required");
    process.exit(1);
  }

  // Build predicates from --where (optional; if omitted → no filter)
  let predicates: Predicate[] = [];
  if (args.where) {
    const parsed = parseDsl(args.where);
    if (parsed.error) {
      console.error(`ERROR: invalid --where expression: ${parsed.error}`);
      process.exit(1);
    }
    predicates = parsed.predicates!;
  }

  // Read corpus
  const corpusPath = path.resolve(process.cwd(), ".private/etms-corpus.json");
  if (!fs.existsSync(corpusPath)) {
    console.error(`ERROR: ${corpusPath} not found. Run npm run build:corpus first.`);
    process.exit(1);
  }

  let emails: Email[];
  try {
    const raw = fs.readFileSync(corpusPath, "utf-8");
    emails = JSON.parse(raw) as Email[];
  } catch (e) {
    console.error(`ERROR: failed to parse ${corpusPath}: ${(e as Error).message}`);
    process.exit(1);
  }

  if (!Array.isArray(emails)) {
    console.error("ERROR: corpus file must contain a JSON array of emails");
    process.exit(1);
  }

  // Filter
  const filtered = emails.filter((email) => matchesFilter(email as EmailLike, predicates));

  if (filtered.length === 0) {
    console.warn("WARNING: no emails matched the filter expression.");
  }

  // Take first N
  const selected = filtered.slice(0, args.count);

  // Prepare output directory
  const toDir = path.resolve(process.cwd(), args.to);
  fs.mkdirSync(toDir, { recursive: true });

  // Category = basename of --to dir
  const category = path.basename(toDir);

  // Write sample-NNN.json files
  let written = 0;
  for (let i = 0; i < selected.length; i++) {
    const email = selected[i];
    const sampleNum = String(i + 1).padStart(3, "0");
    const id = `${category}/sample-${sampleNum}`;
    const filename = `sample-${sampleNum}.json`;

    const sampleDoc = {
      id,
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

    const outPath = path.join(toDir, filename);
    fs.writeFileSync(outPath, JSON.stringify(sampleDoc, null, 2));
    written++;
  }

  console.log(
    `Wrote ${written} sample(s) to ${toDir}/ (${filtered.length} matched, ${emails.length} total in corpus)`
  );
}

if (require.main === module) {
  main();
}
