/**
 * wave-γ-data-l5c-v1 Phase 4 — extract Sonnet/Haiku disagreements.
 *
 * Зачем: Haiku 4.5 прошёл draft и сказал agree/disagree per pair. Здесь
 * вытаскиваем disagreements (~30-50 ожидается) в lib/cargo/_data/
 * для последующего targeted broker review (отдельный PR γ-data-broker-review).
 *
 * Run: `npx tsx scripts/l5c/extract-disagreements.ts`
 * Inputs: .private/l5c-data/haiku-verdicts.json  (Phase 4 LLM output)
 * Output: lib/cargo/_data/disagreements.json     (committed)
 *
 * Exit codes:
 *   0 — OK
 *   1 — disagreement ratio >40% (Sonnet/Haiku расходятся фундаментально)
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

type Verdict = {
  pair: Pair;
  agree: boolean;
  alt_verdict: Pair | null;
  confidence: 'high' | 'medium' | 'low';
};

const INPUT = '.private/l5c-data/haiku-verdicts.json';
const OUTPUT = 'lib/cargo/_data/disagreements.json';

const raw = fs.readFileSync(INPUT, 'utf-8');
const parsed = JSON.parse(raw);
const verdicts: Verdict[] = Array.isArray(parsed) ? parsed : parsed.verdicts ?? [];

const disagreements = verdicts.filter((v) => !v.agree);
const ratio = disagreements.length / Math.max(verdicts.length, 1);

console.log(
  `Disagreements: ${disagreements.length}/${verdicts.length} (${(ratio * 100).toFixed(1)}%)`,
);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(
  OUTPUT,
  JSON.stringify(
    {
      _meta: {
        total_pairs: verdicts.length,
        disagreement_count: disagreements.length,
        disagreement_ratio: ratio,
        next_phase:
          'wave-γ-data-broker-review will resolve these via Dubai/MENA broker spot-check',
      },
      disagreements,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${OUTPUT}`);

if (ratio > 0.4) {
  console.error(
    `\nSTOP: disagreement ratio ${(ratio * 100).toFixed(1)}% (>40% threshold). Sonnet/Haiku расходятся фундаментально, escalate.`,
  );
  process.exit(1);
}
