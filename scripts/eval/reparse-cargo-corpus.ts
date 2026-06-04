#!/usr/bin/env -S npx tsx
/**
 * Re-parse the demo cargo corpus through the updated CARGO_INQUIRY_PARSER_PROMPT
 * (#791 cause C — PIECE-AGGREGATE RULE). Writes a sibling JSON; does NOT overwrite
 * the live fixture. Use scripts/eval/parity-check-parsed-cargoes.ts to validate.
 *
 * USAGE (dev-VPS only):
 *   AI_PROVIDER=claude-cli PARSE_CARGO_PROVIDER=claude-cli \
 *     npx tsx scripts/eval/reparse-cargo-corpus.ts \
 *       --raw-dir /root/work/quantika-demo/.private/raw-emails \
 *       --old-parsed lib/sample-data/demo-parsed-cargoes.json \
 *       --out /tmp/demo-parsed-cargoes.reparsed.json
 *
 * NOTES:
 *  - claude-cli must be on PATH. Re-parse touches ~82 cargo emails, ETA ≈ 25-40 min.
 *  - Per .claude/rules/ai-provider.md: claude-cli is allowed in scripts, NOT in
 *    Next.js request handlers. This script never imports from app/.
 *  - Only emails that already appear in --old-parsed are re-parsed (parity scope).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false });

import { callAiText, extractJson } from '@/lib/ai-provider';
import { CARGO_INQUIRY_PARSER_PROMPT } from '@/lib/prompts/parse-cargo';
import { PARSE_CARGO_SCHEMA } from '@/lib/schemas';
import { buildCargoPrompts, parseCargoAIResponse } from '@/lib/parsing/parse-cargo-ai';
import { normalizeRawEmail, type FlatEmail } from '@/scripts/demo-seed/analyze';
import type { Email, ParsedCargo } from '@/lib/types';

const LLM_TIMEOUT_MS = 180_000;
const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_BUDGET = 5.0;

interface Args {
  rawDir: string;
  oldParsedPath: string;
  outPath: string;
  model: string;
  maxBudget: number;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(k);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    rawDir: path.resolve(get('--raw-dir') ?? '.private/raw-emails'),
    oldParsedPath: path.resolve(get('--old-parsed') ?? 'lib/sample-data/demo-parsed-cargoes.json'),
    outPath: path.resolve(get('--out') ?? '/tmp/demo-parsed-cargoes.reparsed.json'),
    model: get('--model') ?? DEFAULT_MODEL,
    maxBudget: parseFloat(get('--max-budget') ?? String(DEFAULT_MAX_BUDGET)),
    limit: get('--limit') ? parseInt(get('--limit')!, 10) : null,
  };
}

function flatToEmail(flat: FlatEmail): Email {
  return {
    id: flat.messageId,
    threadId: flat.threadId,
    from: flat.fromName ? `${flat.fromName} <${flat.fromEmail ?? ''}>` : (flat.fromEmail ?? ''),
    fromName: flat.fromName ?? null,
    fromEmail: flat.fromEmail ?? null,
    to: '',
    subject: flat.subject ?? '',
    date: flat.date,
    body: flat.body,
    snippet: flat.body.slice(0, 200),
    labelIds: [],
  };
}

function loadCargoEmailIds(oldParsedPath: string): Set<string> {
  const oldArr = JSON.parse(fs.readFileSync(oldParsedPath, 'utf8')) as Array<{ emailId: string }>;
  return new Set(oldArr.map((c) => c.emailId));
}

function loadEmailFromRaw(rawDir: string, emailId: string): Email | null {
  const filePath = path.join(rawDir, `${emailId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const flat = normalizeRawEmail(raw);
  return flatToEmail(flat);
}

async function reparseCargo(email: Email, model: string, maxBudget: number): Promise<ParsedCargo[]> {
  const prompt = buildCargoPrompts([email])[0];
  const raw = await callAiText('PARSE_CARGO', CARGO_INQUIRY_PARSER_PROMPT, prompt, {
    timeoutMs: LLM_TIMEOUT_MS,
    responseSchema: PARSE_CARGO_SCHEMA,
    model,
    maxBudgetUsd: maxBudget,
  });
  return parseCargoAIResponse(extractJson(raw), email.id);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.rawDir)) {
    console.error(`Raw dir does not exist: ${args.rawDir}`);
    process.exit(2);
  }
  if (!fs.existsSync(args.oldParsedPath)) {
    console.error(`Old parsed JSON does not exist: ${args.oldParsedPath}`);
    process.exit(2);
  }

  const cargoEmailIds = Array.from(loadCargoEmailIds(args.oldParsedPath));
  const targetIds = args.limit ? cargoEmailIds.slice(0, args.limit) : cargoEmailIds;
  console.log(
    `[reparse-cargo] re-parsing ${targetIds.length} cargo emails (model=${args.model}, max-budget=$${args.maxBudget})`,
  );

  const out: ParsedCargo[] = [];
  let failures = 0;
  const t0 = Date.now();

  for (let i = 0; i < targetIds.length; i++) {
    const emailId = targetIds[i];
    process.stdout.write(`[${i + 1}/${targetIds.length}] ${emailId}… `);
    const email = loadEmailFromRaw(args.rawDir, emailId);
    if (!email) {
      console.log('MISSING raw email file — skipping');
      failures++;
      continue;
    }
    const tStart = Date.now();
    try {
      const parsed = await reparseCargo(email, args.model, args.maxBudget);
      out.push(...parsed);
      console.log(`${((Date.now() - tStart) / 1000).toFixed(1)}s → ${parsed.length} items`);
    } catch (e) {
      console.log(`FAIL (${e instanceof Error ? e.message.slice(0, 80) : 'error'})`);
      failures++;
    }
    fs.writeFileSync(args.outPath, JSON.stringify(out, null, 2));
  }

  const elapsedMin = ((Date.now() - t0) / 60_000).toFixed(1);
  console.log(
    `\n[reparse-cargo] Done in ${elapsedMin}min. ${out.length} items written. ${failures} failures.`,
  );
  console.log(`  → ${args.outPath}`);
  if (failures > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[reparse-cargo] FATAL:', err);
    process.exit(1);
  });
}
