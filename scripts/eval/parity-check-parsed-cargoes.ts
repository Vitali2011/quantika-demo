#!/usr/bin/env -S npx tsx
/**
 * Parity-check utility for parsed-cargoes JSON re-parse (#791 cause C).
 *
 * Pure compare (no LLM): diff old vs. new ParsedCargo arrays keyed by
 * (emailId, itemIndex). Reports `populated_now_null`, `null_now_populated`,
 * `value_changed`. Used by scripts/eval/reparse-cargo-corpus.ts and as a
 * unit-testable building block.
 *
 * Non-zero exit ONLY on populated→null regressions in non-weight fields.
 * weightMt → null is expected for range cargoes (info shifts into
 * weightMtMin / weightMtMax).
 */
import { readFileSync, writeFileSync } from 'node:fs';

export type ParsedCargoLike = Record<string, unknown> & {
  emailId: string;
  itemIndex: number;
};

export interface ParityReport {
  total: number;
  populated_now_null: Array<{ emailId: string; itemIndex: number; field: string; old: unknown }>;
  null_now_populated: Array<{ emailId: string; itemIndex: number; field: string; new: unknown }>;
  value_changed: Array<{ emailId: string; itemIndex: number; field: string; old: unknown; new: unknown }>;
}

function keyOf(c: ParsedCargoLike): string {
  return `${c.emailId}::${c.itemIndex}`;
}

function isNullish(v: unknown): boolean {
  return v == null;
}

export function diffParsed(oldArr: ParsedCargoLike[], newArr: ParsedCargoLike[]): ParityReport {
  const oldMap = new Map(oldArr.map((c) => [keyOf(c), c]));
  const report: ParityReport = {
    total: oldArr.length,
    populated_now_null: [],
    null_now_populated: [],
    value_changed: [],
  };
  for (const n of newArr) {
    const k = keyOf(n);
    const o = oldMap.get(k);
    if (!o) continue;
    for (const field of Object.keys(o)) {
      if (field === 'emailId' || field === 'itemIndex') continue;
      const oVal = JSON.stringify((o as Record<string, unknown>)[field] ?? null);
      const nVal = JSON.stringify((n as Record<string, unknown>)[field] ?? null);
      if (oVal === nVal) continue;
      const oIsNull = isNullish((o as Record<string, unknown>)[field]);
      const nIsNull = isNullish((n as Record<string, unknown>)[field]);
      if (!oIsNull && nIsNull) {
        report.populated_now_null.push({
          emailId: o.emailId,
          itemIndex: o.itemIndex,
          field,
          old: (o as Record<string, unknown>)[field],
        });
      } else if (oIsNull && !nIsNull) {
        report.null_now_populated.push({
          emailId: o.emailId,
          itemIndex: o.itemIndex,
          field,
          new: (n as Record<string, unknown>)[field],
        });
      } else {
        report.value_changed.push({
          emailId: o.emailId,
          itemIndex: o.itemIndex,
          field,
          old: (o as Record<string, unknown>)[field],
          new: (n as Record<string, unknown>)[field],
        });
      }
    }
  }
  return report;
}

export function diffParsedFromPaths(oldPath: string, newPath: string): ParityReport {
  const oldArr = JSON.parse(readFileSync(oldPath, 'utf8')) as ParsedCargoLike[];
  const newArr = JSON.parse(readFileSync(newPath, 'utf8')) as ParsedCargoLike[];
  return diffParsed(oldArr, newArr);
}

if (require.main === module) {
  const [oldPath, newPath, outPath] = process.argv.slice(2);
  if (!oldPath || !newPath) {
    console.error('Usage: tsx parity-check-parsed-cargoes.ts <old.json> <new.json> [out.json]');
    process.exit(2);
  }
  const r = diffParsedFromPaths(oldPath, newPath);
  const summary = {
    total: r.total,
    populated_now_null_count: r.populated_now_null.length,
    null_now_populated_count: r.null_now_populated.length,
    value_changed_count: r.value_changed.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (outPath) writeFileSync(outPath, JSON.stringify(r, null, 2));
  const regressions = r.populated_now_null.filter((d) => !d.field.startsWith('weightMt'));
  if (regressions.length > 0) {
    console.error(`PARITY FAIL — ${regressions.length} populated→null regressions on non-weight fields`);
    process.exit(1);
  }
}
