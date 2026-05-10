/**
 * Forward-unwrap utilities.
 * Deterministic string/regex parsing — NO LLM, no network.
 * Supports Gmail web, Apple Mail, and Outlook forwarded message formats.
 */

export interface ForwardUnwrapResult {
  innermostBody: string;
  originalFrom: string | null;
  originalSubject: string | null;
  originalDate: string | null;
  layerCount: number;
}

/**
 * Regex patterns for known forward marker formats.
 * Each pattern captures the block that follows the marker.
 */

/** Gmail web: "---------- Forwarded message ----------" */
const GMAIL_MARKER_RE = /^-{3,}\s*Forwarded message\s*-{3,}\s*$/im;

/** Apple Mail: "Begin forwarded message:" */
const APPLE_MARKER_RE = /^Begin forwarded message:\s*$/im;

/** Outlook: blank line + "From: ... Sent: ... To: ... Subject: ..." block (no explicit "forwarded" label) */
const OUTLOOK_BLOCK_RE =
  /(?:^|\n)\s*From:\s*.+\n\s*Sent:\s*.+\n\s*To:\s*.+\n\s*Subject:\s*.+/im;

/**
 * Attempt to extract forwarded-message headers from a header block that
 * immediately follows a forward marker.
 * Returns null if the block doesn't look like forwarded headers.
 */
function parseForwardedHeaders(block: string): {
  from: string | null;
  subject: string | null;
  date: string | null;
  bodyAfter: string;
} {
  const lines = block.split('\n');
  let from: string | null = null;
  let subject: string | null = null;
  let date: string | null = null;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fromMatch = line.match(/^From:\s*(.+)/i);
    const dateMatch = line.match(/^Date:\s*(.+)/i) || line.match(/^Sent:\s*(.+)/i);
    const subjectMatch = line.match(/^Subject:\s*(.+)/i);

    if (fromMatch) from = fromMatch[1].trim();
    else if (dateMatch) date = dateMatch[1].trim();
    else if (subjectMatch) subject = subjectMatch[1].trim();
    else if (line.trim() === '') {
      // Blank line ends the header block — body starts after
      bodyStart = i + 1;
      break;
    } else if (i > 8) {
      // Too many non-matching lines — stop header parse
      bodyStart = i;
      break;
    }
  }

  const bodyAfter = lines.slice(bodyStart).join('\n').trim();
  return { from, subject, date, bodyAfter };
}

/**
 * Unwrap a single layer of forwarded message.
 * Returns { found: true, ... } if a forward marker was detected, else { found: false }.
 */
function unwrapOneLayer(body: string): {
  found: boolean;
  innerBody: string;
  from: string | null;
  subject: string | null;
  date: string | null;
} {
  // 1. Try Gmail marker
  const gmailIdx = body.search(GMAIL_MARKER_RE);
  if (gmailIdx !== -1) {
    const afterMarker = body.slice(body.indexOf('\n', gmailIdx) + 1);
    const parsed = parseForwardedHeaders(afterMarker);
    return {
      found: true,
      innerBody: parsed.bodyAfter,
      from: parsed.from,
      subject: parsed.subject,
      date: parsed.date,
    };
  }

  // 2. Try Apple Mail marker
  const appleIdx = body.search(APPLE_MARKER_RE);
  if (appleIdx !== -1) {
    const afterMarker = body.slice(body.indexOf('\n', appleIdx) + 1);
    const parsed = parseForwardedHeaders(afterMarker);
    return {
      found: true,
      innerBody: parsed.bodyAfter,
      from: parsed.from,
      subject: parsed.subject,
      date: parsed.date,
    };
  }

  // 3. Try Outlook block (no explicit "forwarded" marker)
  const outlookMatch = body.match(OUTLOOK_BLOCK_RE);
  if (outlookMatch) {
    const matchStart = body.indexOf(outlookMatch[0]);
    const blockText = outlookMatch[0].trim();
    const parsed = parseForwardedHeaders(blockText);
    // Body of the original message is after the Outlook header block
    const afterBlock = body.slice(matchStart + outlookMatch[0].length).trim();
    return {
      found: true,
      innerBody: afterBlock || parsed.bodyAfter,
      from: parsed.from,
      subject: parsed.subject,
      date: parsed.date,
    };
  }

  return { found: false, innerBody: body, from: null, subject: null, date: null };
}

/**
 * Recursively unwrap all forward layers, returning the innermost original message.
 * Degrades gracefully: if nothing can be parsed, returns the original body with layerCount=0.
 */
export function unwrapForwardLayers(
  body: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _headers?: Map<string, string>
): ForwardUnwrapResult {
  if (!body || body.trim() === '') {
    return {
      innermostBody: body,
      originalFrom: null,
      originalSubject: null,
      originalDate: null,
      layerCount: 0,
    };
  }

  let currentBody = body;
  let layerCount = 0;
  let firstFrom: string | null = null;
  let firstSubject: string | null = null;
  let firstDate: string | null = null;

  // Unwrap up to 10 layers (safety limit)
  for (let i = 0; i < 10; i++) {
    let result: ReturnType<typeof unwrapOneLayer>;
    try {
      result = unwrapOneLayer(currentBody);
    } catch {
      // Degrade on any unexpected error
      break;
    }

    if (!result.found) break;

    layerCount++;
    if (layerCount === 1) {
      // Capture the outermost forward's original sender info
      firstFrom = result.from;
      firstSubject = result.subject;
      firstDate = result.date;
    }

    const innerBody = result.innerBody?.trim() ?? '';
    if (!innerBody) break; // Empty inner — stop

    currentBody = innerBody;
  }

  return {
    innermostBody: currentBody,
    originalFrom: firstFrom,
    originalSubject: firstSubject,
    originalDate: firstDate,
    layerCount,
  };
}
