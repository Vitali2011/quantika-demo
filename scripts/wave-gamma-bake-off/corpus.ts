/**
 * Corpus loader for Wave γ parsing bake-off.
 *
 * Reads seed email messages from quantika-demo sample-data + eval fixtures,
 * maps each message to applicable parsing endpoints (heuristic on body text),
 * and optionally attaches a gpt-5.5 reference output from ai_audit.
 *
 * Schema note (P.5): the production `ai_audit` table (migration 012) only
 * stores metadata (scope, provider, model, tokens, cost, latency, ok, err).
 * It has NO `response_text` / `output_json` column, so Mode A reference
 * attachment is impossible from this table — references map will always be
 * empty. The bake-off therefore runs in Mode B globally (judge without
 * gpt-5.5 anchor; lower 80% gate per verification-plan.md). The references
 * field is kept on the type for forward compatibility if a richer log table
 * is added later.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Endpoint = 'parse-cargo' | 'parse-vessel' | 'parse-recap' | 'classify';

export interface CorpusCase {
  id: string;
  email: string;
  endpoints: Endpoint[];
  references: Partial<Record<Endpoint, unknown>>;
  source: string; // which seed file the case came from (for traceability)
}

interface RawSeedMessage {
  id?: string;
  threadId?: string;
  body?: string;
  subject?: string;
  from?: string;
}

/**
 * Seed file paths, relative to repo root. Resolved against process.cwd() at
 * load time. The four files together yield ~27 distinct messages spanning
 * cargo inquiries, fixture recaps, client replies, and eval samples.
 */
const SEED_FILES: { path: string; idPrefix: string }[] = [
  { path: 'lib/sample-data/cargo-inquiries.json', idPrefix: 'cargo' },
  { path: 'lib/sample-data/fixture-recaps.json', idPrefix: 'recap' },
  { path: 'lib/sample-data/client-replies.json', idPrefix: 'reply' },
  { path: 'scripts/eval/email-samples.json', idPrefix: 'eval' },
];

/**
 * Path to the Gemini 2.5 Pro self-baseline (built by `npm run build-reference`).
 * If present, its contents populate `case.references[endpoint]` so the bake-off
 * judge runs in Mode A. Absent → Mode B globally (legacy behaviour).
 */
const BASELINE_PATH = path.join(__dirname, 'baseline-pro25.json');

interface BaselineMap {
  [caseId: string]: Partial<Record<Endpoint, unknown>>;
}

function loadBaselineSafe(): BaselineMap {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    if (parsed && typeof parsed === 'object') return parsed as BaselineMap;
  } catch {
    /* corrupted baseline shouldn't kill the run — fall back to Mode B */
  }
  return {};
}

function detectEndpoints(text: string): Endpoint[] {
  const eps: Endpoint[] = ['classify']; // every email is a classify candidate
  const t = text.toLowerCase();

  // cargo signals: incoterms, tonnage, container types, commodity nouns
  if (
    /\b(cargo|tonnes?|mts?|teu|fcl|lcl|incoterm|cif|fob|cfr|coal|wheat|soy|sugar|fertili[sz]er|bulk|laycan|stowage)\b/.test(
      t
    )
  ) {
    eps.push('parse-cargo');
  }

  // vessel signals: ship identifiers, dimensions, IMO
  if (
    /\b(vessel|m\.?v\.?|m\.?t\.?|imo|dwt|tonnage|loa|beam|draft|built|flag|charterer|bulker|tanker)\b/.test(
      t
    )
  ) {
    eps.push('parse-vessel');
  }

  // recap / fixture signals
  if (/\b(recap|fixture|chrtrs?|owners?|hire|demurrage|despatch|laytime|wog)\b/.test(t)) {
    eps.push('parse-recap');
  }

  return eps;
}

function readSeedFile(absPath: string): RawSeedMessage[] {
  const raw = JSON.parse(readFileSync(absPath, 'utf-8'));
  if (!Array.isArray(raw)) {
    throw new Error(`Seed file ${absPath} is not a JSON array`);
  }
  return raw as RawSeedMessage[];
}

export async function loadCorpus(rootDir: string = process.cwd()): Promise<CorpusCase[]> {
  const out: CorpusCase[] = [];
  const seenIds = new Set<string>();
  const baseline = loadBaselineSafe();

  for (const seed of SEED_FILES) {
    const abs = path.join(rootDir, seed.path);
    if (!existsSync(abs)) {
      // missing optional seed → skip silently, do not fail the loader
      continue;
    }
    const raw = readSeedFile(abs);
    for (const m of raw) {
      const body = m.body ?? '';
      if (body.length < 10) continue;

      // Build composite text used for endpoint detection (subject often
      // carries strong signals like "FIXTURE" / "RECAP").
      const detectionText = `${m.subject ?? ''}\n${body}`;
      const endpoints = detectEndpoints(detectionText);

      let id = m.id ? `${seed.idPrefix}-${m.id}` : `${seed.idPrefix}-${out.length}`;
      // ensure global uniqueness even if two seeds happen to share an id
      let suffix = 1;
      while (seenIds.has(id)) {
        id = `${seed.idPrefix}-${m.id ?? out.length}-${suffix++}`;
      }
      seenIds.add(id);

      // Attach Pro 2.5 self-baseline if present → Mode A; else empty → Mode B.
      const references = baseline[id] ?? {};
      out.push({
        id,
        email: body,
        endpoints,
        references,
        source: seed.path,
      });
    }
  }

  return out;
}
