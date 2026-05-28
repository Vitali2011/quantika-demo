// scripts/demo-seed/seed-all.ts
// Run with: AI_PROVIDER=claude-cli npx tsx scripts/demo-seed/seed-all.ts [--frozen-date YYYY-MM-DD] [--model claude-opus-4-8]
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { reconcile } from './reconcile';
import { analyze } from './analyze';
import { build } from './build';
import { validateDb } from './validators';
import { formatSummary } from './summary';
import { loadLlmCacheIfAny } from './llm-cache';

const argv = process.argv.slice(2);
const get = (k: string) => {
  const i = argv.indexOf(k);
  return i === -1 ? undefined : argv[i + 1];
};

async function main(): Promise<void> {
  const rawDir = path.resolve(get('--raw-dir') ?? '.private/raw-emails');
  const frozenDate = get('--frozen-date') ?? new Date().toISOString().slice(0, 10);
  const model = get('--model') ?? 'claude-opus-4-8';
  const manifestPath = path.resolve('scripts/demo-seed/manifest.json');
  const outDb = path.resolve('data/demo-seed.db');

  // 1. Clerk (separate process so AI_PROVIDER env is unambiguous)
  console.log('[seed-all] 1/5 parse (Opus clerk)…');
  const parse = spawnSync(
    'npx',
    ['tsx', 'scripts/demo-seed/parse-llm-direct.ts', '--raw-dir', rawDir, '--model', model],
    { stdio: 'inherit', env: { ...process.env, AI_PROVIDER: 'claude-cli' } },
  );
  if (parse.status !== 0) throw new Error('parse step failed');

  // 2. Analyst
  console.log('[seed-all] 2/5 reconcile (Opus analyst)…');
  const rec = await reconcile({ rawDir, model });

  // 3. Analyze (offsets + merge reconcile anonymization)
  console.log('[seed-all] 3/5 analyze (date offsets)…');
  const manifest = await analyze({ rawDir, frozenDate, demoWindowDays: 14, seedAnonymization: rec.anonymization });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // 4. Build
  console.log('[seed-all] 4/5 build…');
  const forbidden = [
    ...Object.keys(rec.anonymization.vessels),
    ...Object.keys(rec.anonymization.charterers),
    ...Object.keys(rec.anonymization.brokers),
    ...Object.keys(rec.anonymization.sender_emails),
    'etm-services.net',
    'ETM Services',
  ].filter((s) => s.length >= 3);
  await build({ rawDir, manifestPath, outDb, forbiddenSubstrings: forbidden });

  // 5. Validate + summary
  console.log('[seed-all] 5/5 validate…');
  const res = validateDb(outDb);
  const cache = loadLlmCacheIfAny(rawDir);
  if (!cache) throw new Error('[seed-all] llm-cache missing after parse step');
  console.log(
    formatSummary({
      counts: {
        cargo: cache.parsedCargos.length,
        vessel: cache.parsedVessels.length,
        recap: cache.parsedFixtureRecaps.length,
        classify: cache.classifications.length,
      },
      matchCount: res.matchCount,
      anonymization: rec.anonymization,
      conflicts: rec.conflicts,
    }),
  );
  if (!res.ok) {
    console.error('[seed-all] VALIDATION FAILED — see issues above');
    process.exit(1);
  }
  console.log('[seed-all] OK — review summary, then `bash scripts/demo-seed/deploy.sh` to ship to prod');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
