/**
 * API Route: POST /api/laytime/parse-sof
 * Spec: gamma-06-sof-parser.md
 *
 * Input Contract:
 * - Empty body {} → 400 missing text
 * - Missing text field → 400 missing text
 * - text is null/undefined → 400 text must be string
 * - text is not string → 400 text must be string
 * - LAYTIME_ENGINE_ENABLED !== 'true' → 503 feature disabled
 * - Valid text (empty string) → 200 with empty events
 * - Valid text (SOF data) → 200 with parse result
 */

import { NextRequest, NextResponse } from "next/server";
import { validateCsrf } from "@/lib/csrf";
import { parseSof } from "@/lib/laytime/sof-parser";

export const maxDuration = 10;

export async function POST(request: NextRequest) {
  // Feature flag check
  if (process.env.LAYTIME_ENGINE_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Laytime Engine is not enabled" },
      { status: 503 }
    );
  }

  // CSRF validation
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate body structure
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be an object" },
      { status: 400 }
    );
  }

  const typedBody = body as Record<string, unknown>;

  // Validate text field
  if (!("text" in typedBody)) {
    return NextResponse.json(
      { error: "Missing required field: text" },
      { status: 400 }
    );
  }

  if (typeof typedBody.text !== "string") {
    return NextResponse.json(
      { error: "text must be a string" },
      { status: 400 }
    );
  }

  // Parse SOF
  try {
    const result = parseSof(typedBody.text);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to parse SOF", details: message },
      { status: 500 }
    );
  }
}
