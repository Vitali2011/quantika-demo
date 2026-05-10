/**
 * Simple DSL parser for corpus email filtering.
 *
 * Supported syntax:
 *   body matches /regex/flags
 *   body contains "literal"
 *   subject contains "literal"
 *   from contains "literal"
 *
 * Multiple predicates joined by: AND (whitespace around it)
 *
 * Example:
 *   body matches /DWCC/i AND subject contains "open"
 */

export type Field = "body" | "subject" | "from";
export type Op = "matches" | "contains";

export interface Predicate {
  field: Field;
  op: Op;
  value: string | RegExp;
}

export interface ParseResult {
  predicates: Predicate[];
  error?: undefined;
}

export interface ParseError {
  error: string;
  predicates?: undefined;
}

const VALID_FIELDS: Field[] = ["body", "subject", "from"];
const VALID_OPS: Op[] = ["matches", "contains"];

function parsePredicate(raw: string): Predicate {
  const trimmed = raw.trim();

  // Match: <field> <op> <value>
  // value is either /regex/flags or "string" or 'string'
  const match = trimmed.match(
    /^(body|subject|from)\s+(matches|contains)\s+([\s\S]+)$/
  );
  if (!match) {
    throw new Error(
      `Invalid predicate: "${trimmed}". Expected: <field> <op> <value> where field ∈ {body, subject, from} and op ∈ {matches, contains}`
    );
  }

  const field = match[1] as Field;
  const op = match[2] as Op;
  const rawValue = match[3].trim();

  if (!VALID_FIELDS.includes(field)) {
    throw new Error(`Unknown field "${field}". Valid fields: ${VALID_FIELDS.join(", ")}`);
  }
  if (!VALID_OPS.includes(op)) {
    throw new Error(`Unknown op "${op}". Valid ops: ${VALID_OPS.join(", ")}`);
  }

  if (op === "matches") {
    // Must be /regex/flags
    const regexMatch = rawValue.match(/^\/(.*)\/([gimsuy]*)$/);
    if (!regexMatch) {
      throw new Error(
        `"matches" operator requires a regex literal like /pattern/flags, got: ${rawValue}`
      );
    }
    const [, pattern, flags] = regexMatch;
    try {
      return { field, op, value: new RegExp(pattern, flags) };
    } catch (e) {
      throw new Error(`Invalid regex /${pattern}/${flags}: ${(e as Error).message}`);
    }
  } else {
    // contains — value must be quoted string
    const quotedMatch = rawValue.match(/^"([\s\S]*)"$/) ?? rawValue.match(/^'([\s\S]*)'$/);
    if (!quotedMatch) {
      throw new Error(
        `"contains" operator requires a quoted string like "value", got: ${rawValue}`
      );
    }
    return { field, op, value: quotedMatch[1] };
  }
}

export function parseDsl(expression: string): ParseResult | ParseError {
  if (!expression || expression.trim() === "") {
    return { error: 'Empty filter expression. Provide a filter like: body matches /DWCC/i' };
  }

  // Split by AND (with surrounding whitespace)
  const parts = expression.split(/\s+AND\s+/);

  const predicates: Predicate[] = [];
  for (const part of parts) {
    try {
      predicates.push(parsePredicate(part));
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  return { predicates };
}

export interface EmailLike {
  subject?: string;
  body?: string;
  from?: string;
  [key: string]: unknown;
}

/**
 * Returns true if the email matches ALL predicates (AND logic).
 */
export function matchesFilter(email: EmailLike, predicates: Predicate[]): boolean {
  for (const pred of predicates) {
    const fieldValue = String(email[pred.field] ?? "");
    if (pred.op === "matches") {
      if (!(pred.value as RegExp).test(fieldValue)) return false;
    } else {
      // contains — case-insensitive substring check
      if (!fieldValue.toLowerCase().includes((pred.value as string).toLowerCase())) return false;
    }
  }
  return true;
}
