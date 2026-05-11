#!/usr/bin/env -S npx tsx
/**
 * Phase 0 Step 3: Convert ground truth to progonq corpus format.
 *
 * Creates .progonq/corpus/etms-{endpoint}/scenario-NNN.json for each
 * (email, endpoint) pair. Auto-detects category from email body signals.
 *
 * Output structure per scenario:
 *   {
 *     id: "etms-classify-001",
 *     source_email_id: "<gmail-id>",
 *     category: "forwarded_chain",   // auto-detected
 *     input: { subject, from, date, body },
 *     reference_output: { ... }      // from ground truth
 *   }
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/progonq/build-progonq-corpus.ts [--endpoint classify]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ClassifiedEmail } from './classify-corpus';

type Endpoint = 'classify' | 'parse-cargo' | 'parse-vessel' | 'parse-recap';
type GroundTruth = Record<string, Partial<Record<Endpoint, unknown>>>;

const CLASSIFIED_PATH = path.resolve(process.cwd(), '.private/etms-corpus-classified.json');
const GT_PATH = path.resolve(process.cwd(), '.private/etms-corpus-ground-truth.json');
const CORPUS_ROOT = path.resolve(process.cwd(), '.progonq/corpus');

const ENDPOINT_CATEGORIES: Record<Endpoint, string[]> = {
  classify: ['simple_clean', 'forwarded_chain', 'mixed_languages', 'ambiguous_intent', 'multi_intent'],
  'parse-cargo': ['single_cargo', 'multi_cargo', 'incomplete_data', 'hedged_language', 'numeric_edge', 'forwarded'],
  'parse-vessel': ['single_vessel', 'multi_vessel', 'position_only', 'full_specs', 'dwcc_edge'],
  'parse-recap': ['bulk_recap', 'project_recap', 'partial_recap', 'multi_clause'],
};

function detectCategory(endpoint: Endpoint, email: ClassifiedEmail): string {
  const body = (email.body || email.snippet || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();

  if (endpoint === 'classify') {
    if (body.includes('forwarded message') || body.includes('fw:') || subject.includes('fw:') || body.includes('-----original message-----')) return 'forwarded_chain';
    if (/[Ѐ-ӿ]/.test(body) || /[؀-ۿ]/.test(body)) return 'mixed_languages'; // Cyrillic or Arabic
    if (email.classification.confidence < 0.85) return 'ambiguous_intent';
    const cats = ['cargo_inquiry', 'vessel_position', 'fixture_recap', 'client_reply', 'document', 'tct_request'];
    const matched = cats.filter((c) => body.includes(c.replace('_', ' ')) || subject.includes(c.replace('_', ' ')));
    if (matched.length > 1) return 'multi_intent';
    return 'simple_clean';
  }

  if (endpoint === 'parse-cargo') {
    if (body.includes('forwarded') || body.includes('-----original message-----')) return 'forwarded';
    if (body.match(/cargo\s*[12]|lot\s*[12]|item\s*[12]/i) || body.match(/\band\b.*\band\b.*port/i)) return 'multi_cargo';
    if (body.includes('abt') || body.includes('about') || body.includes('approx') || body.includes('tbc') || body.includes('tbd')) return 'hedged_language';
    if (body.includes('10%') || body.includes('moloo') || body.includes('molco') || body.match(/\d+[\/,]\d+\s*mt/i)) return 'numeric_edge';
    if (!body.match(/\d+\s*(?:mt|mts|tons?)/i) || body.match(/tba|tbd|tbc/i)) return 'incomplete_data';
    return 'single_cargo';
  }

  if (endpoint === 'parse-vessel') {
    if (body.includes('fleet') || body.match(/vessel\s+[12]/i) || body.match(/mv\s+\w+.*mv\s+\w+/i)) return 'multi_vessel';
    if (body.includes('dwcc') || body.includes('deadweight') || body.match(/\d{4,6}\s*dwt/i)) return 'dwcc_edge';
    if (body.includes('dwtcc') || body.includes('dwat') || body.includes('nrt') || body.includes('grt') || body.includes('built') || body.includes('imo')) return 'full_specs';
    if (body.match(/open\s+\w+|available\s+\w+|eta\s+\w+/i) && !body.match(/imo\s*\d{7}/i)) return 'position_only';
    return 'single_vessel';
  }

  if (endpoint === 'parse-recap') {
    if (body.includes('additional clause') || body.includes('clause') || body.match(/\d+\.\s+[A-Z]/)) return 'multi_clause';
    if (body.includes('project') || body.includes('heavy lift') || body.includes('break bulk')) return 'project_recap';
    if (!body.match(/freight|hire|rate/i) || !body.match(/load|discharge/i)) return 'partial_recap';
    return 'bulk_recap';
  }

  return 'simple_clean';
}

function padNum(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

async function main() {
  const endpointFilter = process.argv.includes('--endpoint')
    ? [process.argv[process.argv.indexOf('--endpoint') + 1] as Endpoint]
    : (['classify', 'parse-cargo', 'parse-vessel', 'parse-recap'] as Endpoint[]);

  if (!existsSync(CLASSIFIED_PATH)) {
    console.error(`ERROR: ${CLASSIFIED_PATH} not found — run classify-corpus.ts first`);
    process.exit(1);
  }
  if (!existsSync(GT_PATH)) {
    console.error(`ERROR: ${GT_PATH} not found — run build-ground-truth.ts first`);
    process.exit(1);
  }

  const classified: ClassifiedEmail[] = JSON.parse(readFileSync(CLASSIFIED_PATH, 'utf-8'));
  const gt: GroundTruth = JSON.parse(readFileSync(GT_PATH, 'utf-8'));

  const stats: Partial<Record<Endpoint, { written: number; skipped: number }>> = {};

  for (const endpoint of endpointFilter) {
    const applicable = classified.filter((e) => e.applicable_endpoints.includes(endpoint));
    const dir = path.join(CORPUS_ROOT, `etms-${endpoint}`);
    mkdirSync(dir, { recursive: true });

    let written = 0;
    let skipped = 0;

    for (let i = 0; i < applicable.length; i++) {
      const email = applicable[i];
      const ref = gt[email.id]?.[endpoint];

      if (ref === undefined || (typeof ref === 'object' && ref !== null && '__error' in ref)) {
        skipped++;
        continue;
      }

      const category = detectCategory(endpoint, email);
      const scenario = {
        id: `etms-${endpoint}-${padNum(i + 1, 3)}`,
        source_email_id: email.id,
        category,
        input: {
          subject: email.subject,
          from: email.from,
          date: email.date,
          body: email.body || email.snippet,
        },
        reference_output: ref,
      };

      const outFile = path.join(dir, `scenario-${padNum(i + 1, 3)}.json`);
      writeFileSync(outFile, JSON.stringify(scenario, null, 2));
      written++;
    }

    stats[endpoint] = { written, skipped };
    console.error(`[${endpoint}] ${written} scenarios written, ${skipped} skipped (no GT or error)`);
  }

  // Write manifest
  const manifest = {
    generated_at: new Date().toISOString(),
    extractor_model: 'us.anthropic.claude-sonnet-4-6',
    endpoints: endpointFilter.map((ep) => ({
      endpoint: ep,
      dir: `etms-${ep}`,
      categories: ENDPOINT_CATEGORIES[ep],
      ...stats[ep],
    })),
  };
  writeFileSync(path.join(CORPUS_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.error('\n[build-progonq-corpus] DONE');
  console.error('Stats:', JSON.stringify(stats, null, 2));
  console.error(`Corpus root: ${CORPUS_ROOT}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
