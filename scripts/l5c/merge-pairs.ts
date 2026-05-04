/**
 * wave-γ-data-l5c-v1 Phase 3 — deterministic merger + symmetry check.
 *
 * Зачем: 18 параллельных субагентов в Phase 2 пишут pairs-from-{cargo}.json.
 * Этот скрипт собирает их в один draft, дедупит по canonical key (lowercase
 * previous|next), и проверяет симметрию: если X→Y compatible:false, а Y→X
 * compatible:true — это CRITICAL conflict (real risk обычно bi-directional).
 *
 * Run: `npx tsx scripts/l5c/merge-pairs.ts`
 * Inputs:  .private/l5c-data/pairs-from-*.json  (18 файлов)
 * Outputs:
 *   - .private/l5c-data/draft-merged.json     (для Phase 4)
 *   - .private/l5c-data/symmetry-conflicts.json
 *
 * Exit codes:
 *   0  — OK
 *   1  — CRITICAL compat conflicts >10% (Phase 2 prompt был bad, escalate)
 */
import * as fs from 'fs';
import * as path from 'path';

type Pair = {
  previous: string;
  next: string;
  compatible: boolean;
  extra_clean?: boolean;
  reason?: string;
};

const INPUT_DIR = '.private/l5c-data';
const OUTPUT_DRAFT = '.private/l5c-data/draft-merged.json';
const SYMMETRY_REPORT = '.private/l5c-data/symmetry-conflicts.json';

const files = fs
  .readdirSync(INPUT_DIR)
  .filter((f) => f.startsWith('pairs-from-') && f.endsWith('.json'));

if (files.length === 0) {
  console.error(`No pairs-from-*.json files found in ${INPUT_DIR}`);
  process.exit(1);
}

const allPairs: Pair[] = files.flatMap((f) => {
  const raw = fs.readFileSync(path.join(INPUT_DIR, f), 'utf-8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.pairs ?? [];
});

console.log(`Loaded ${allPairs.length} candidate pairs from ${files.length} files`);

// Dedup: canonical key = `${previous}|${next}` (case-insensitive, trimmed)
const dedupMap = new Map<string, Pair>();
for (const p of allPairs) {
  const key = `${p.previous.trim().toLowerCase()}|${p.next.trim().toLowerCase()}`;
  if (!dedupMap.has(key)) dedupMap.set(key, p);
}

console.log(`After dedup: ${dedupMap.size} unique pairs`);

// Symmetry check
const conflicts: Array<{
  pair_a: Pair;
  pair_b: Pair;
  type: 'compat' | 'extra_clean';
}> = [];
const seenReverse = new Set<string>();
for (const [key, a] of dedupMap) {
  if (seenReverse.has(key)) continue;
  const [prev, next] = key.split('|');
  if (prev === next) continue;
  const reverseKey = `${next}|${prev}`;
  const b = dedupMap.get(reverseKey);
  if (!b) continue;
  seenReverse.add(reverseKey);
  if (a.compatible !== b.compatible) {
    conflicts.push({ pair_a: a, pair_b: b, type: 'compat' });
  }
  if (!!a.extra_clean !== !!b.extra_clean) {
    conflicts.push({ pair_a: a, pair_b: b, type: 'extra_clean' });
  }
}

const compatConflicts = conflicts.filter((c) => c.type === 'compat').length;
const softConflicts = conflicts.length - compatConflicts;
console.log(
  `Symmetry: ${compatConflicts} CRITICAL (compat), ${softConflicts} SOFT (extra_clean)`,
);

const sorted = [...dedupMap.values()].sort(
  (a, b) =>
    a.previous.localeCompare(b.previous) || a.next.localeCompare(b.next),
);

fs.writeFileSync(OUTPUT_DRAFT, JSON.stringify({ pairs: sorted }, null, 2));
fs.writeFileSync(SYMMETRY_REPORT, JSON.stringify({ conflicts }, null, 2));
console.log(`Wrote ${OUTPUT_DRAFT} and ${SYMMETRY_REPORT}`);

const compatRatio = compatConflicts / Math.max(sorted.length, 1);
if (compatRatio > 0.1) {
  console.error(
    `\nSTOP: compat conflicts ${(compatRatio * 100).toFixed(1)}% (>10% threshold). Phase 2 prompt was bad. Investigate before Phase 4.`,
  );
  process.exit(1);
}

if (softConflicts / Math.max(sorted.length, 1) > 0.3) {
  console.warn(
    `\nWARN: soft (extra_clean) conflicts >30%. Phase 2 расходится в asymmetric cleaning logic — review symmetry-conflicts.json перед merge.`,
  );
}
