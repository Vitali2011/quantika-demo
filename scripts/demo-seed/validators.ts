// scripts/demo-seed/validators.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export interface SanityIssue {
  kind: 'NULL_STRING' | 'ZERO_NUMERIC' | 'ZERO_YOB' | 'DATE_OUT_OF_WINDOW' | 'LOW_MATCH_COUNT';
  emailId?: string;
  detail: string;
}

interface ParsedRow {
  gmail_message_id: string;
  parse_type: string;
  result_json: string;
}

function walk(node: unknown, visit: (v: unknown) => void): void {
  visit(node);
  if (node && typeof node === 'object') {
    for (const val of Object.values(node as Record<string, unknown>)) walk(val, visit);
  }
}

export function sanityCheckRows(rows: ParsedRow[]): SanityIssue[] {
  const issues: SanityIssue[] = [];
  for (const r of rows) {
    let obj: unknown;
    try {
      obj = JSON.parse(r.result_json);
    } catch {
      issues.push({ kind: 'NULL_STRING', emailId: r.gmail_message_id, detail: 'invalid JSON' });
      continue;
    }
    walk(obj, (v) => {
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (o.value === 'null') {
          issues.push({ kind: 'NULL_STRING', emailId: r.gmail_message_id, detail: 'value is the string "null"' });
        }
        if (o.value === 0 && o.source_text === '') {
          issues.push({ kind: 'ZERO_NUMERIC', emailId: r.gmail_message_id, detail: 'value 0 with empty source_text' });
        }
        if ('vessel_yob' in o && o.vessel_yob === 0) {
          issues.push({ kind: 'ZERO_YOB', emailId: r.gmail_message_id, detail: 'vessel_yob is 0' });
        }
      }
    });
  }
  return issues;
}

export interface ValidateResult {
  ok: boolean;
  issues: SanityIssue[];
  matchCount: number;
}

export function validateDb(dbPath: string, opts: { minMatches?: number } = {}): ValidateResult {
  const db = new Database(dbPath, { readonly: true });
  sqliteVec.load(db);
  try {
    const rows = db
      .prepare('SELECT gmail_message_id, parse_type, result_json FROM parsed_results')
      .all() as ParsedRow[];
    const issues = sanityCheckRows(rows);
    const { c: matchCount } = db
      .prepare("SELECT COUNT(*) AS c FROM matches WHERE status = 'shortlist'")
      .get() as { c: number };
    const minMatches = opts.minMatches ?? 120;
    if (matchCount < minMatches) {
      issues.push({ kind: 'LOW_MATCH_COUNT', detail: `${matchCount} active matches < ${minMatches}` });
    }
    return { ok: issues.length === 0, issues, matchCount };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };
  const dbPath = get('--db') ?? 'data/demo-seed.db';
  const res = validateDb(dbPath);
  for (const i of res.issues) console.error(`[validate] ${i.kind} ${i.emailId ?? ''} — ${i.detail}`);
  console.log(`[validate] matches=${res.matchCount} issues=${res.issues.length} ok=${res.ok}`);
  if (!res.ok) process.exit(1);
}
