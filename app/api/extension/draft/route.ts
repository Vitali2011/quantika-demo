import { NextRequest, NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { requireSession } from '@/lib/session';
import type { ParsedCargo } from '@/lib/types';

interface DraftRequestBody {
  parsedCargo: ParsedCargo;
  vesselId: string;
  brokerName: string;
  /** Email subject line — sanitized for XSS/CRLF, max 200 chars (BUG-D2/D3/D4). */
  subject?: string;
  /** Email body content — sanitized for XSS, max 50 000 chars (BUG-D2/D4). */
  body?: string;
}

/** Maximum allowed length for brokerName (BUG-D4: length cap). */
const BROKER_NAME_MAX_LEN = 256;
/** Maximum allowed length for email subject (BUG-D4). */
const MAX_SUBJECT = 200;
/** Maximum allowed length for email body (BUG-D4). */
const MAX_BODY = 50_000;

/**
 * Strip dangerous HTML constructs via allow-list parser (sanitize-html).
 * Replaces a fragile blacklist (BUG-β-stab-04-XSSBypass) with an HTML parser
 * that drops any tag/attribute outside an explicit allow-list. Closes
 * <iframe>, <object>, <embed>, <style>, slash-form attribute event handlers,
 * entity-encoded `javascript:` and CRLF-broken schemes — all of which the
 * old regex sanitizer let through.
 */
function stripDangerousTags(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u',
      'ul', 'ol', 'li',
      'a', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    disallowedTagsMode: 'discard',
  });
}

/**
 * Sanitize brokerName before inserting into draft template.
 * - Truncates to BROKER_NAME_MAX_LEN chars (BUG-D4)
 * - Strips CR (\r) and LF (\n) control characters (BUG-D3)
 * - HTML-escapes <, >, &, ", ' to prevent XSS in downstream renderers (BUG-D2)
 */
function sanitizeBrokerName(name: string): string {
  // D4: truncate first
  let s = name.slice(0, BROKER_NAME_MAX_LEN);
  // D3: strip CR and LF
  s = s.replace(/[\r\n]/g, ' ');
  // D2: HTML-escape special chars
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return s;
}

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = requireSession(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidDraftBody(body)) {
    return NextResponse.json(
      { error: 'Missing required fields: parsedCargo, vesselId, brokerName' },
      { status: 400 },
    );
  }

  const { parsedCargo, brokerName, subject, body: emailBody } = body;

  // BUG-D4: length limits for subject and email body
  if (subject !== undefined && subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: 'subject too long' }, { status: 400 });
  }
  if (emailBody !== undefined && emailBody.length > MAX_BODY) {
    return NextResponse.json({ error: 'body too long' }, { status: 400 });
  }

  // BUG-D2 + D3: sanitize subject (strip XSS, strip CRLF)
  const safeSubject =
    subject !== undefined
      ? stripDangerousTags(subject.replace(/[\r\n]/g, ' '))
      : undefined;

  // BUG-D2: sanitize email body (strip XSS)
  const safeEmailBody =
    emailBody !== undefined ? stripDangerousTags(emailBody) : undefined;

  const safeBrokerName = sanitizeBrokerName(brokerName);
  const draftText = buildDraft(parsedCargo, safeBrokerName);

  return NextResponse.json({
    draftText,
    ...(safeSubject !== undefined && { subject: safeSubject }),
    ...(safeEmailBody !== undefined && { body: safeEmailBody }),
  });
}

function isValidDraftBody(body: unknown): body is DraftRequestBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.parsedCargo === 'object' &&
    b.parsedCargo !== null &&
    typeof b.vesselId === 'string' &&
    b.vesselId.length > 0 &&
    typeof b.brokerName === 'string' &&
    b.brokerName.length > 0
  );
}

function buildDraft(cargo: ParsedCargo, brokerName: string): string {
  const origin =
    typeof cargo.originPort === 'object' && cargo.originPort !== null
      ? cargo.originPort.value ?? ''
      : cargo.originPort ?? '';
  const dest =
    typeof cargo.destinationPort === 'object' && cargo.destinationPort !== null
      ? cargo.destinationPort.value ?? ''
      : cargo.destinationPort ?? '';
  const desc =
    typeof cargo.cargoDescription === 'object' && cargo.cargoDescription !== null
      ? cargo.cargoDescription.value ?? ''
      : cargo.cargoDescription ?? '';

  return `Dear ${brokerName},\n\nWith reference to your cargo inquiry, we are pleased to offer suitable tonnage.\n\nCargo: ${desc}\nLoading port: ${origin}\nDischarging port: ${dest}\n\nPlease revert with any questions.\n\nBest regards,\nQuantika`;
}
