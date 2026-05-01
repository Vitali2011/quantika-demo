/**
 * Real-time quote-quality scorer (0-100), Lavender-style.
 *
 * 4 factors, each 0-25:
 *   - clarity:        LLM-rated readability (heuristic fallback on timeout/inject)
 *   - completeness:   coverage of mandatory freight terms
 *   - tone:           rule-based (caps ratio, exclamation density, greeting)
 *   - freightNumbers: regex presence of rate / tonnage / route
 *
 * Latency budget: < 500ms p95.
 * LLM call has hard 400ms timeout; on timeout falls back to heuristic clarity.
 */

export interface QuoteScore {
  total: number;
  clarity: number;
  completeness: number;
  tone: number;
  freightNumbers: number;
  hints: string[];
}

export type ClarityScorer = (draft: string) => Promise<number>;

export interface ScoreOptions {
  /** Inject custom clarity scorer (LLM client / test mock). */
  clarityScorer?: ClarityScorer;
  /** LLM timeout in ms (default 400). */
  llmTimeoutMs?: number;
}

const REQUIRED_TERMS: Array<{ key: string; pattern: RegExp; hint: string }> = [
  { key: 'laycan', pattern: /\blaycan\b/i, hint: 'Add a laycan window (e.g. "Laycan: 10-20 May").' },
  { key: 'demurrage', pattern: /\bdemurrage\b/i, hint: 'Specify demurrage rate (USD /day).' },
  { key: 'despatch', pattern: /\bdespatch\b/i, hint: 'State despatch rate (often half demurrage).' },
  { key: 'incoterms', pattern: /\b(incoterms|cfr|cif|fob|fas|exw|dap)\b/i, hint: 'Add INCOTERMS (CFR / CIF / FOB).' },
  { key: 'vessel', pattern: /\b(vessel|mv|mt|tbn|dwt)\b/i, hint: 'Mention vessel name / type / dwt.' },
  { key: 'qty', pattern: /\b\d{1,3}[,.]?\d{0,3}\s*(mt|tons?|tonnes?|dwt|kt)\b/i, hint: 'State cargo quantity in mt.' },
  { key: 'route', pattern: /\b[A-Z][A-Z\s]{2,}\s*[-/]\s*[A-Z][A-Z\s]{2,}\b|\b(loading|discharge|load port|disch port|loading port|discharge port)\b/i, hint: 'Add load/discharge port pair (e.g. "SANTOS - QINGDAO").' },
];

function heuristicClarity(draft: string): number {
  const text = draft.trim();
  if (text.length === 0) return 0;
  const sentences = text.split(/[.!?\n]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 3;
  const avgLen = sentences.reduce((s, x) => s + x.trim().split(/\s+/).length, 0) / sentences.length;
  // Sweet spot ~ 8-22 words/sentence.
  let score = 20;
  // Quote-style line-by-line drafts naturally have short "sentences";
  // only penalise extremes.
  if (avgLen > 35 || avgLen < 2) score -= 12;
  else if (avgLen > 28) score -= 6;
  if (text.length < 30) score -= 18;
  else if (text.length < 80) score -= 11;
  else if (text.length < 150) score -= 7;
  // Excessive run-on lines (no whitespace structure)
  if (!/\n/.test(text) && text.length > 200) score -= 5;
  // ALL-CAPS hurts readability — but port names (CAPS) are normal in quotes.
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 20) {
    const upper = letters.replace(/[^A-Z]/g, '').length;
    const ratio = upper / letters.length;
    if (ratio > 0.6) score -= 14;
    else if (ratio > 0.45) score -= 6;
  }
  return Math.max(0, Math.min(25, score));
}

function scoreCompleteness(draft: string): { score: number; missing: string[] } {
  const missing: string[] = [];
  let hits = 0;
  for (const t of REQUIRED_TERMS) {
    if (t.pattern.test(draft)) hits += 1;
    else missing.push(t.hint);
  }
  // Non-linear: hitting all terms is much more valuable than hitting most.
  // 7→25, 6→18, 5→13, 4→9, 3→6, 2→3, 1→1, 0→0
  const ladder = [0, 1, 3, 5, 7, 10, 16, 24];
  const score = ladder[Math.min(hits, ladder.length - 1)];
  return { score: Math.min(25, score), missing };
}

function scoreTone(draft: string): { score: number; hints: string[] } {
  const hints: string[] = [];
  if (draft.trim().length === 0) return { score: 0, hints: ['Draft is empty.'] };
  const letters = draft.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const capsRatio = letters.length > 0 ? upper / letters.length : 0;
  const exclamations = (draft.match(/!/g) || []).length;
  const words = draft.trim().split(/\s+/).length;
  const exclDensity = words > 0 ? exclamations / words : 0;
  const hasGreeting = /\b(dear|hello|hi|good (morning|day|afternoon|evening)|sirs?|charterers?)\b/i.test(draft);
  const hasSignoff = /\b(best regards|kind regards|sincerely|regards|br\b)\b/i.test(draft);

  let score = 21;
  if (capsRatio > 0.55) {
    score -= 19;
    hints.push('Reduce ALL-CAPS — looks like shouting.');
  } else if (capsRatio > 0.42) {
    score -= 8;
    hints.push('Too many capitalised words — soften the tone.');
  }
  if (exclDensity > 0.1) {
    score -= 14;
    hints.push('Too many exclamation marks — keep it professional.');
  } else if (exclDensity > 0.04) {
    score -= 6;
    hints.push('Trim exclamation marks.');
  }
  if (!hasGreeting) {
    score -= 6;
    hints.push('Add a professional greeting (e.g. "Dear Charterers,").');
  }
  if (!hasSignoff) {
    score -= 4;
    hints.push('Add a sign-off ("Best regards,").');
  }
  // Very short drafts can't be "professional" regardless of greeting words
  if (words < 15) {
    score -= 10;
    hints.push('Draft is too short for a professional quote.');
  } else if (words < 30) {
    score -= 4;
  }
  return { score: Math.max(0, Math.min(25, score)), hints };
}

function scoreFreightNumbers(draft: string): { score: number; hints: string[] } {
  const hints: string[] = [];
  const hasRate = /\b(usd|us\$|\$)\s*\d+(?:[.,]\d+)?\s*(?:\/?\s*mt|\/?\s*ton)?\b/i.test(draft) || /\bws\s*\d+/i.test(draft);
  const hasTonnage = /\b\d{2,6}[,.]?\d{0,3}\s*(mt|dwt|tons?|tonnes?|kt)\b/i.test(draft);
  const hasRoute = /\b[A-Z][A-Z\s]{2,}\s*[-/]\s*[A-Z][A-Z\s]{2,}\b/.test(draft) ||
    /\b(loading|load port|discharge|disch port|loading port|discharge port)[:\s]/i.test(draft) ||
    /\b\w{4,}\s+to\s+\w{4,}\b/i.test(draft);
  const hasLaycanDate = /\b\d{1,2}\s*[-/]\s*\d{1,2}\s+\w+\b/i.test(draft) ||
    /\blaycan[:\s]+\d/i.test(draft);

  let score = 0;
  if (hasRate) score += 7; else hints.push('State a freight rate (USD /mt or WS).');
  if (hasTonnage) score += 6; else hints.push('Add cargo tonnage (mt or dwt).');
  if (hasRoute) score += 7; else hints.push('Specify load/discharge ports.');
  if (hasLaycanDate) score += 4; else hints.push('Include a laycan date range.');
  // Route is critical for a quote — without it, cap the factor hard.
  if (!hasRoute) score = Math.min(score, 5);
  return { score: Math.min(22, score), hints };
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(Number.isFinite(v as unknown as number) ? v : fallback);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export async function scoreQuote(
  draft: string,
  options: ScoreOptions = {},
): Promise<QuoteScore> {
  const { clarityScorer, llmTimeoutMs = 400 } = options;

  const heuristic = heuristicClarity(draft);
  let clarity = heuristic;
  if (clarityScorer && draft.trim().length > 0) {
    const llm = await withTimeout(
      Promise.resolve().then(() => clarityScorer(draft)),
      llmTimeoutMs,
      heuristic,
    );
    if (Number.isFinite(llm)) {
      // Blend LLM and heuristic — LLM may overrate ALL-CAPS / messy text
      // that heuristic correctly penalises. Cap at heuristic + 4 so an
      // optimistic LLM cannot rescue clearly broken drafts.
      const blended = (llm * 0.5) + (heuristic * 0.5);
      const capped = Math.min(blended, heuristic + 4);
      clarity = Math.max(0, Math.min(25, Math.round(capped)));
    }
  }

  const comp = scoreCompleteness(draft);
  const tone = scoreTone(draft);
  const fn = scoreFreightNumbers(draft);

  const total = clarity + comp.score + tone.score + fn.score;
  const hints: string[] = [];
  if (clarity < 15) hints.push('Improve clarity — break long sentences, structure as a quote.');
  hints.push(...comp.missing);
  hints.push(...tone.hints);
  hints.push(...fn.hints);

  return {
    total: Math.max(0, Math.min(100, Math.round(total))),
    clarity: Math.round(clarity),
    completeness: comp.score,
    tone: tone.score,
    freightNumbers: fn.score,
    hints: hints.slice(0, 8),
  };
}
