/**
 * β-15: lightweight rule-based NLP for SOF (Statement of Facts) recap.
 *
 * Pulls structured fields out of a free-text voice transcript. No LLM,
 * no external deps — regex over canonical phrasings used by the voice
 * memo fixture (and realistic broker dictation patterns).
 *
 * If a field can't be found, falls back to empty/zero defaults so
 * downstream PDF generation never crashes.
 */

export interface SofEvent {
  time: string;
  description: string;
}

export interface SofRecapFields {
  vessel: string;
  port: string;
  arrivalUtc: string;
  laytimeAllowedHrs: number;
  laytimeUsedHrs: number;
  demurrageRateUsd: number;
  events: SofEvent[];
}

export function extractSofFromTranscript(text: string): SofRecapFields {
  const vessel = matchOne(text, /vessel\s+([A-Z][A-Z0-9 .'\-]+?)(?=\s+at\s+port|,|\.)/i);
  const port = matchOne(text, /at\s+port\s+([A-Z][A-Za-z .'\-]+?)(?=[.,]|\s+Arrival)/);
  const arrivalUtc = matchOne(
    text,
    /Arrival\s+UTC\s+([0-9T:\-Z]+)/i,
  );
  const laytimeAllowedHrs = numberAfter(text, /Laytime\s+allowed\s+(\d+)/i);
  const laytimeUsedHrs = numberAfter(text, /Laytime\s+used\s+(\d+)/i);
  const demurrageRateUsd = numberAfter(text, /Demurrage\s+rate\s+(\d+)/i);
  const events = extractEvents(text);

  return {
    vessel: vessel.trim(),
    port: port.trim(),
    arrivalUtc: arrivalUtc.trim(),
    laytimeAllowedHrs,
    laytimeUsedHrs,
    demurrageRateUsd,
    events,
  };
}

function matchOne(text: string, re: RegExp): string {
  const m = text.match(re);
  return m && m[1] ? m[1] : '';
}

function numberAfter(text: string, re: RegExp): number {
  const m = text.match(re);
  return m && m[1] ? parseInt(m[1], 10) : 0;
}

function extractEvents(text: string): SofEvent[] {
  const re = /Event\s+\d+\s+at\s+(\d{1,2}:\d{2})\s+([^.]+?)(?=\.|$)/gi;
  const out: SofEvent[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ time: m[1], description: m[2].trim() });
  }
  return out;
}
