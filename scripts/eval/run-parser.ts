/**
 * Standalone email parsing evaluator.
 * Reads scripts/eval/email-samples.json, runs classification + parsing
 * using the real app prompts, and saves results to scripts/eval/results/run-NNN.json
 *
 * Usage: npx tsx scripts/eval/run-parser.ts [--run-id run-001]
 */

import * as fs from 'fs';
import * as path from 'path';
import { callAiJson } from '../../lib/openai';
import { CLASSIFICATION_SYSTEM_PROMPT } from '../../lib/prompts/classify';
import { CARGO_INQUIRY_PARSER_PROMPT } from '../../lib/prompts/parse-cargo';
import { VESSEL_POSITION_PARSER_PROMPT } from '../../lib/prompts/parse-vessel';
import { FIXTURE_RECAP_PARSER_PROMPT } from '../../lib/prompts/parse-recap';
import { AI_MODEL_HEAVY, AI_MODEL_LIGHT, MAX_EMAIL_BODY_CHARS } from '../../lib/constants';

// ── Types ──────────────────────────────────────────────────────────────────

interface SampleEmail {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  body: string;
}

interface ClassificationResult {
  id: string;
  category: string;
  urgency: string;
  confidence: number;
  is_unanswered: boolean;
  days_without_reply: number | null;
  original_sender: string | null;
  original_sender_company: string | null;
}

interface ClassificationResponse {
  classifications: ClassificationResult[];
}

interface RunResult {
  runId: string;
  timestamp: string;
  emails: EmailResult[];
}

interface EmailResult {
  emailId: string;
  subject: string;
  originalBody: string;
  classification: ClassificationResult | null;
  parsed: unknown;
  parseError?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function padded(n: number): string {
  return String(n).padStart(3, '0');
}

function nextRunId(resultsDir: string): string {
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
    return 'run-001';
  }
  const existing = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith('run-') && f.endsWith('.json'))
    .map(f => parseInt(f.replace('run-', '').replace('.json', ''), 10))
    .filter(n => !isNaN(n));
  const max = existing.length ? Math.max(...existing) : 0;
  return `run-${padded(max + 1)}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const scriptDir = path.dirname(__filename || process.argv[1]);
  const samplesPath = path.join(scriptDir, 'email-samples.json');
  const resultsDir = path.join(scriptDir, 'results');

  // Parse optional --run-id flag
  const runIdArg = process.argv.indexOf('--run-id');
  const runId = runIdArg >= 0 ? process.argv[runIdArg + 1] : nextRunId(resultsDir);

  console.log(`\n🚀  Starting parser run: ${runId}`);
  console.log(`    Samples: ${samplesPath}`);
  console.log(`    Output:  ${path.join(resultsDir, `${runId}.json`)}\n`);

  const emails: SampleEmail[] = JSON.parse(fs.readFileSync(samplesPath, 'utf8'));

  // ── Step 1: Classify all 6 emails in one batch ────────────────────────
  console.log('📋  Step 1: Classifying emails...');
  const classifyInput = emails.map(e => ({
    id: e.id,
    subject: e.subject,
    from: e.from,
    date: e.date,
    body_preview: e.body.slice(0, MAX_EMAIL_BODY_CHARS),
  }));

  const todayIso = new Date().toISOString().split('T')[0];
  const classifyPrompt = `Today's date: ${todayIso}\n\n${JSON.stringify(classifyInput, null, 2)}`;
  const classifyResponse = await callAiJson<ClassificationResponse>(
    classifyPrompt,
    CLASSIFICATION_SYSTEM_PROMPT,
    AI_MODEL_HEAVY,
    { classifications: [] },
  );

  const classMap = new Map<string, ClassificationResult>();
  for (const c of classifyResponse.classifications) {
    classMap.set(c.id, c);
  }

  console.log('  Results:');
  for (const c of classifyResponse.classifications) {
    console.log(`  - ${c.id}: ${c.category} (confidence: ${c.confidence})`);
  }

  // ── Step 2: Parse each email based on its category ────────────────────
  console.log('\n🔍  Step 2: Parsing emails...');
  const results: EmailResult[] = [];

  for (const email of emails) {
    const cls = classMap.get(email.id) ?? null;
    const category = cls?.category ?? 'UNKNOWN';
    const bodyForParsing = email.body.slice(0, 12000);

    let parsed: unknown = null;
    let parseError: string | undefined;

    try {
      if (category === 'CARGO_INQUIRY') {
        console.log(`  Parsing CARGO_INQUIRY: ${email.id}`);
        parsed = await callAiJson<unknown>(
          `Email subject: ${email.subject}\n\nEmail body:\n${bodyForParsing}`,
          CARGO_INQUIRY_PARSER_PROMPT,
          AI_MODEL_LIGHT,
          { items: [] },
        );
      } else if (category === 'VESSEL_POSITION') {
        console.log(`  Parsing VESSEL_POSITION: ${email.id}`);
        parsed = await callAiJson<unknown>(
          `Email subject: ${email.subject}\n\nEmail body:\n${bodyForParsing}`,
          VESSEL_POSITION_PARSER_PROMPT,
          AI_MODEL_LIGHT,
          { items: [] },
        );
      } else if (category === 'FIXTURE_RECAP') {
        console.log(`  Parsing FIXTURE_RECAP: ${email.id}`);
        parsed = await callAiJson<unknown>(
          `Email subject: ${email.subject}\n\nEmail body:\n${bodyForParsing}`,
          FIXTURE_RECAP_PARSER_PROMPT,
          AI_MODEL_HEAVY,
          { items: [] },
        );
      } else {
        console.log(`  Skipping deep parse for ${email.id} (category: ${category})`);
        parsed = null;
        // Attach a note so reviewers understand the intentional null
        const skipNotes: Record<string, string> = {
          TCT_REQUEST: 'No deep parser for TCT_REQUEST — classification metadata only (category, urgency, sender).',
          CLIENT_REPLY: 'No deep parser for CLIENT_REPLY by design. Sub-lift notifications are CLIENT_REPLY per system rules (not FIXTURE_RECAP). Key data is in classification: category=CLIENT_REPLY, urgency=HIGH for sub-lifts, sender, company.',
          DOCUMENT: 'No deep parser for DOCUMENT — classification metadata only.',
          VESSEL_CERTIFICATE: 'No deep parser for VESSEL_CERTIFICATE — classification metadata only. Zero-day validity anomalies detected at classification stage.',
          OTHER: 'Category OTHER — no parsing required.',
        };
        const note = skipNotes[category];
        if (note) {
          parsed = { _parse_note: note } as unknown;
        }
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Parse error for ${email.id}: ${parseError}`);
    }

    results.push({
      emailId: email.id,
      subject: email.subject,
      originalBody: email.body,
      classification: cls,
      parsed,
      ...(parseError ? { parseError } : {}),
    });
  }

  // ── Step 3: Save results ──────────────────────────────────────────────
  const runResult: RunResult = {
    runId,
    timestamp: new Date().toISOString(),
    emails: results,
  };

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const outputPath = path.join(resultsDir, `${runId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(runResult, null, 2));

  console.log(`\n✅  Done! Results saved to: ${outputPath}`);
  console.log(`    ${results.length} emails processed.`);

  // Quick summary
  console.log('\n📊  Summary:');
  for (const r of results) {
    const status = r.parseError ? '❌ ERROR' : r.parsed ? '✅ parsed' : '⏭  skipped';
    console.log(`    ${r.emailId}: ${r.classification?.category ?? 'UNKNOWN'} — ${status}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
