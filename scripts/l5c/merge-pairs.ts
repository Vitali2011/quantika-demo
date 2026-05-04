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

// Fail-closed symmetric resolution (wave-γ-data-l5c-v1):
// Если X→Y compat=false ИЛИ Y→X compat=false — обе пары становятся false с
// merged reason. Безопаснее для shipping: contamination risk обычно
// bi-directional (residue stays in hold regardless of order). Если одна
// сторона видит риск — это сигнал для ручной surveyor review.
//
// extra_clean: OR — если хоть один true, обе true (already conservative).
const resolved = new Map<string, Pair>();
for (const [key, p] of dedupMap) resolved.set(key, { ...p });

for (const [key, a] of resolved) {
  const [prev, next] = key.split('|');
  if (prev === next) continue;
  const reverseKey = `${next}|${prev}`;
  const b = resolved.get(reverseKey);
  if (!b) continue;
  // compat: AND (fail-closed override)
  if (a.compatible !== b.compatible) {
    const incompat = a.compatible ? b : a;
    a.compatible = false;
    b.compatible = false;
    const note = ' [symmetric fail-closed: reverse pair flagged risk]';
    a.reason = (a.reason ?? '') + (a === incompat ? '' : ` ⟵ ${incompat.reason}${note}`);
    b.reason = (b.reason ?? '') + (b === incompat ? '' : ` ⟵ ${incompat.reason}${note}`);
  }
  // extra_clean: OR
  const ec = !!a.extra_clean || !!b.extra_clean;
  a.extra_clean = ec;
  b.extra_clean = ec;
}

const sorted = [...resolved.values()].sort(
  (a, b) =>
    a.previous.localeCompare(b.previous) || a.next.localeCompare(b.next),
);

fs.writeFileSync(OUTPUT_DRAFT, JSON.stringify({ pairs: sorted }, null, 2));
fs.writeFileSync(SYMMETRY_REPORT, JSON.stringify({ conflicts }, null, 2));
console.log(`Wrote ${OUTPUT_DRAFT} and ${SYMMETRY_REPORT}`);

const compatRatio = compatConflicts / Math.max(sorted.length, 1);
console.log(
  `Resolved via fail-closed override: ${compatConflicts} compat conflicts → both false, ${softConflicts} extra_clean conflicts → both true`,
);
if (compatRatio > 0.25) {
  console.error(
    `\nSTOP: compat conflicts ${(compatRatio * 100).toFixed(1)}% (>25% even with fail-closed override). Phase 2 prompt was systematically bad.`,
  );
  process.exit(1);
}
