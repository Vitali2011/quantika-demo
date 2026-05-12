/**
 * SOF (Statement of Facts) Parser
 * Spec: gamma-06-sof-parser.md
 *
 * Input Contract:
 * - Empty/falsy: "", null, undefined → empty events, null dates, 0 weatherDelayHours
 * - All whitespace: "   \n  \t  " → same as empty
 * - No timestamp lines: all lines → parseWarnings
 * - Malformed timestamp: line → parseWarnings
 * - Duplicate commence/complete: last one wins
 * - Weather delay start without end: event added, 0 hours
 * - Weather delay end without start: event added, 0 hours
 * - Negative time range: treat as 0 hours + warning
 * - Comment lines (#): skip silently
 * - Blank lines: skip silently
 */

export interface SofEvent {
  timestamp: string; // ISO 8601
  description: string;
  eventType: SofEventType;
}

export type SofEventType =
  | "arrival"
  | "nor-tendered"
  | "nor-accepted"
  | "laytime-commenced"
  | "loading-started"
  | "loading-completed"
  | "departure"
  | "weather-delay-start"
  | "weather-delay-end"
  | "other";

export interface SofParseResult {
  events: SofEvent[];
  commencedAt: string | null; // ISO 8601, from laytime-commenced event
  completedAt: string | null; // ISO 8601, from loading-completed event
  weatherDelayHours: number; // accumulated from weather-delay events
  parseWarnings: string[]; // non-fatal issues found
}

export function parseSof(rawText: string): SofParseResult {
  // Handle empty/falsy inputs
  if (!rawText || rawText.trim() === "") {
    return {
      events: [],
      commencedAt: null,
      completedAt: null,
      weatherDelayHours: 0,
      parseWarnings: [],
    };
  }

  const events: SofEvent[] = [];
  const parseWarnings: string[] = [];
  let commencedAt: string | null = null;
  let completedAt: string | null = null;

  // Track weather delay pairs for accumulation
  const weatherDelayStarts: Array<{ timestamp: Date; description: string }> = [];
  let totalWeatherDelayMs = 0;

  const lines = rawText.split("\n");

  // Pattern: YYYY-MM-DD HH:mm - Description or YYYY-MM-DD HH:MM - Description
  const timestampPattern = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*-\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed === "") {
      continue;
    }

    // Skip comment lines
    if (trimmed.startsWith("#")) {
      continue;
    }

    // Try to match timestamp pattern
    const match = timestampPattern.exec(trimmed);
    if (!match) {
      parseWarnings.push(`Could not parse timestamp from line: ${trimmed}`);
      continue;
    }

    const [, timestampStr, description] = match;

    // Validate timestamp
    const timestamp = new Date(timestampStr.replace(" ", "T") + ":00.000Z");
    if (isNaN(timestamp.getTime())) {
      parseWarnings.push(`Invalid date in line: ${trimmed}`);
      continue;
    }

    const isoTimestamp = timestamp.toISOString();

    // Classify event type
    const eventType = classifyEventType(description);

    // Create event
    const event: SofEvent = {
      timestamp: isoTimestamp,
      description,
      eventType,
    };

    events.push(event);

    // Handle special event types
    if (eventType === "laytime-commenced") {
      commencedAt = isoTimestamp; // Last one wins
    }

    if (eventType === "loading-completed") {
      completedAt = isoTimestamp; // Last one wins
    }

    if (eventType === "weather-delay-start") {
      weatherDelayStarts.push({ timestamp, description });
    }

    if (eventType === "weather-delay-end") {
      // Try to match with a start event
      if (weatherDelayStarts.length > 0) {
        const start = weatherDelayStarts.shift()!;
        const delayMs = timestamp.getTime() - start.timestamp.getTime();

        if (delayMs < 0) {
          parseWarnings.push(
            `Weather delay end before start: ${description} ends before ${start.description}`
          );
        } else {
          totalWeatherDelayMs += delayMs;
        }
      }
      // If no matching start, just add event (0 hours accumulated)
    }
  }

  // Convert accumulated milliseconds to hours
  const weatherDelayHours = totalWeatherDelayMs / (1000 * 60 * 60);

  return {
    events,
    commencedAt,
    completedAt,
    weatherDelayHours,
    parseWarnings,
  };
}

function classifyEventType(description: string): SofEventType {
  const lower = description.toLowerCase();

  // Arrival
  if (lower.includes("arrived") || lower.includes("arrival")) {
    return "arrival";
  }

  // NOR tendered
  if (lower.includes("nor tendered")) {
    return "nor-tendered";
  }

  // NOR accepted / laytime commenced
  if (
    lower.includes("nor accepted") ||
    lower.includes("laytime commenced") ||
    lower.includes("laytime commences")
  ) {
    return "laytime-commenced";
  }

  // Loading completed
  if (
    lower.includes("completed loading") ||
    lower.includes("loading completed")
  ) {
    return "loading-completed";
  }

  // Loading started
  if (lower.includes("loading started") || lower.includes("loading commences")) {
    return "loading-started";
  }

  // Departure
  if (lower.includes("departed") || lower.includes("departure")) {
    return "departure";
  }

  // Weather delay
  if (lower.includes("weather")) {
    // Check for start/commenced keywords
    if (
      lower.includes("commenced") ||
      lower.includes("started") ||
      lower.includes("start") ||
      (lower.includes("delay") && !lower.includes("end"))
    ) {
      return "weather-delay-start";
    }
    // Check for end/ended keywords
    if (lower.includes("ended") || lower.includes("end")) {
      return "weather-delay-end";
    }
  }

  return "other";
}
