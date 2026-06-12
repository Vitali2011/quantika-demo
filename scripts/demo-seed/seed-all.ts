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
  const demoWindowDays = parseInt(get('--window') ?? '14', 10);
  const manifestPath = path.resolve('scripts/demo-seed/manifest.json');
  const outDb = path.resolve('data/demo-seed.db');

  // 1. Clerk (separate process so AI_PROVIDER env is unambiguous)
  console.log('[seed-all] 1/6 parse (Opus clerk)…');
  const parse = spawnSync(
    'npx',
    ['tsx', 'scripts/demo-seed/parse-llm-direct.ts', '--raw-dir', rawDir, '--model', model],
    { stdio: 'inherit', env: { ...process.env, AI_PROVIDER: 'claude-cli' } },
  );
  if (parse.status !== 0) throw new Error('parse step failed');

  // 2. Analyst
  console.log('[seed-all] 2/6 reconcile (Opus analyst)…');
  const rec = await reconcile({ rawDir, model });

  // H1/M7: Add real person names from originalSender to brokers map so they get
  // anonymized in body text and assigned as per-email from_name (sender variety)
  const seedCache = loadLlmCacheIfAny(rawDir);
  if (seedCache) {
    let contactCounter = 0;
    const seenContacts = new Set<string>();
    for (const cls of seedCache.classifications) {
      const name = cls.originalSender?.trim();
      if (!name || seenContacts.has(name.toLowerCase())) continue;
      seenContacts.add(name.toLowerCase());
      if (!rec.anonymization.brokers[name]) {
        contactCounter++;
        rec.anonymization.brokers[name] = `CONTACT ${contactCounter}`;
        // Add uppercase form too
        if (name !== name.toUpperCase() && !rec.anonymization.brokers[name.toUpperCase()]) {
          rec.anonymization.brokers[name.toUpperCase()] = `CONTACT ${contactCounter}`;
        }
        // Add first AND last name individually (for "Dear Sherif", "Schuster" in quoted headers).
        // Skip generic English/corporate words to prevent false-positive body corruption.
        const NAME_STOP = new Set([
          'and', 'the', 'of', 'for', 'say', 'co', 'bv', 'nv', 'llc', 'ltd', 'inc', 'srl',
          'mr', 'mrs', 'ms', 'dr', 'capt', 'dept', 'group', 'corp', 'via', 'attn',
        ]);
        const parts = name.split(/\s+/);
        for (const part of parts) {
          if (part.length < 3) continue;
          if (NAME_STOP.has(part.toLowerCase())) continue;
          if (!rec.anonymization.brokers[part]) {
            rec.anonymization.brokers[part] = `CONTACT ${contactCounter}`;
          }
          const upper = part.toUpperCase();
          if (upper !== part && !rec.anonymization.brokers[upper]) {
            rec.anonymization.brokers[upper] = `CONTACT ${contactCounter}`;
          }
        }
      }
    }
  }

  // M5: Add known leaked vessel names that appear in email subjects/bodies
  const M5_LEAKED_VESSELS: Record<string, string> = {
    'Gandolf': 'M/V SEAGULL 200',
    'SC GUOJI': 'M/V SEAGULL 201',
    'YU LAN': 'M/V SEAGULL 202',
    'SSF DREAM': 'M/V SEAGULL 203',
    'Everest Bay': 'M/V SEAGULL 204',
    'Green Magic': 'M/V SEAGULL 205',
  };
  for (const [real, alias] of Object.entries(M5_LEAKED_VESSELS)) {
    if (!rec.anonymization.vessels[real]) {
      rec.anonymization.vessels[real] = alias;
    }
    // Also add uppercase variant
    if (real.toUpperCase() !== real && !rec.anonymization.vessels[real.toUpperCase()]) {
      rec.anonymization.vessels[real.toUpperCase()] = alias;
    }
  }

  // Known-PII substrings the entity-name reconciler won't map on its own (bare
  // sender domain + broker name appear in every forwarded ETM email). They MUST be
  // in the anonymization MAP (not only build's leak-check forbidden list), or build
  // checks for them yet never replaces them → hard leak failure. Reconcile pseudonyms
  // for full email addresses are longer keys, so build's longest-first replace handles
  // "x@etm-services.net" before this bare-domain fallback fires.
  rec.anonymization.sender_emails['etm-services.net'] = 'demo.local';
  rec.anonymization.sender_emails['etm-services'] = 'demo-broker';
  rec.anonymization.brokers['ETM Services'] = 'DEMO BROKER';

  // Residual PII names that the reconcile step or originalSender loop won't add:
  // salutation first-names ("Dear Elif"), display-name surnames, To: company variants.
  for (const [raw, alias] of [
    ['Elif', 'CONTACT 80'], ['ELIF', 'CONTACT 80'],
    ['SEA TRANSIT DENIZ TASIMACILIGI', 'TRANSIT BROKER'],
    ['Sea Transit Deniz Tasimaciligi', 'TRANSIT BROKER'],
    ['SEA TRANSIT', 'TRANSIT BROKER'], ['Sea Transit', 'TRANSIT BROKER'],
  ] as [string, string][]) {
    if (!rec.anonymization.brokers[raw]) rec.anonymization.brokers[raw] = alias;
  }

  // Compound-word and Unicode-variant forms that word-boundary guards in applyAnonymization
  // correctly leave intact as substrings (e.g. "Agantaship" is one token, not "Aganta"+"ship")
  // but that still identify the company/person if left in the DB.
  // Istanbul: Turkish locale uses İ (U+0130) instead of ASCII I; JS regex /i flag doesn't equate them.
  const istanbulAlias = rec.anonymization.brokers['Istanbul'] ?? rec.anonymization.brokers['ISTANBUL'] ?? 'CONTACT 3';
  const agantaAlias = rec.anonymization.charterers['Aganta'] ?? rec.anonymization.charterers['Aganta Shipping'] ?? 'GRAIN TRADER H';
  const multiAlias = rec.anonymization.charterers['Multiservice'] ?? rec.anonymization.charterers['Multiservice Shipping'] ?? 'GRAIN TRADER AL';
  for (const [raw, alias] of [
    ['İstanbul', istanbulAlias], ['İSTANBUL', istanbulAlias],
    ['Agantaship', agantaAlias], ['AGANTASHIP', agantaAlias],
    ['Multiserviceshipping', multiAlias], ['MULTISERVICESHIPPING', multiAlias],
  ] as [string, string][]) {
    if (!rec.anonymization.brokers[raw] && !rec.anonymization.charterers[raw]) {
      rec.anonymization.charterers[raw] = alias;
    }
  }

  // Expand each canonical name into shorter forms so partial mentions are also
  // anonymized — emails use "Varan" for "Varan Shipping", "SIS MARINE" for the
  // full company name, etc. Map the significant first token (≥4 chars, not a
  // generic shipping/corporate word) and the 2-word prefix to the same pseudonym.
  const STOP = new Set([
    'shipping', 'marine', 'maritime', 'trade', 'trading', 'services', 'service', 'management',
    'group', 'company', 'lines', 'line', 'bulk', 'grain', 'chartering', 'international', 'global',
    'and', 'the', 'of', 'for', 'dept', 'department', 'shipmanagement',
  ]);
  const expandBucket = (map: Record<string, string>): void => {
    for (const [real, pseudo] of Object.entries({ ...map })) {
      const words = real.split(/[\s,/\-()]+/).filter(Boolean);
      const w0 = words[0]?.toLowerCase() ?? '';
      // Don't add bare first-word shortcut when alias already has a vessel prefix —
      // otherwise "MV SEAGULL N" in body would become "MV M/V SEAGULL N" (L4).
      const aliasHasVesselPrefix = pseudo.startsWith('M/V ') || pseudo.startsWith('M/T ');
      if (words[0] && words[0].length >= 4 && !STOP.has(w0) && !(words[0] in map) && !aliasHasVesselPrefix) {
        map[words[0]] = pseudo;
      }
      // Require both words >= 2 chars to prevent "M V" from vessel names (L4 corruption).
      if (words.length >= 2 && !STOP.has(w0) && words[0].length >= 2 && words[1].length >= 2) {
        const p2 = `${words[0]} ${words[1]}`;
        if (!(p2 in map)) map[p2] = pseudo;
      }
    }
  };
  expandBucket(rec.anonymization.vessels);
  expandBucket(rec.anonymization.charterers);
  expandBucket(rec.anonymization.brokers);

  // 3. Analyze (offsets + merge reconcile anonymization)
  console.log('[seed-all] 3/6 analyze (date offsets)…');
  const manifest = await analyze({ rawDir, frozenDate, demoWindowDays, seedAnonymization: rec.anonymization });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // 4. Build
  console.log('[seed-all] 4/6 build…');
  const forbidden = [
    ...Object.keys(rec.anonymization.vessels),
    ...Object.keys(rec.anonymization.charterers),
    ...Object.keys(rec.anonymization.brokers),
    ...Object.keys(rec.anonymization.sender_emails),
    'etm-services.net',
    'ETM Services',
  ].filter((s) => s.length >= 3);
  await build({ rawDir, manifestPath, outDb, forbiddenSubstrings: forbidden });

  // 5. Canonical matches (audit B.4/B.5): build()'s matches stage is a bootstrap
  // heuristic (base-60 score, flat bunker). Replace it through the REAL engine —
  // regenerate-matches runs analyzePairs with a deterministic offline scorer
  // (no LLM) and rewrites the seed buckets in canonical row shape, so
  // `npm run seed:all` now produces the same matches as the manual regen.
  console.log('[seed-all] 5/6 regenerate matches (real engine)…');
  const regen = spawnSync(
    'npx',
    ['tsx', 'scripts/demo-seed/regenerate-matches.ts', '--db', outDb],
    { stdio: 'inherit', env: process.env },
  );
  if (regen.status !== 0) throw new Error('regenerate-matches step failed');

  // 6. Validate + summary
  console.log('[seed-all] 6/6 validate…');
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
