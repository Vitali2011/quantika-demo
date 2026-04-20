export type RecapType = "TC" | "VOYAGE" | "UNKNOWN";

const TC_PATTERNS: RegExp[] = [
  /\bDELY\b/i,
  /\bREDELY\b/i,
  /\bTCT\b/i,
  /time\s+charter/i,
  /hire\s+rate/i,
  /daily\s+hire/i,
  /period\s+charter/i,
  /trip\s+charter/i,
  /\bPDPR\b/i,
  /delivery.{0,60}redelivery/is,
  /dely.{0,60}redely/is,
];

const VOYAGE_PATTERNS: RegExp[] = [
  /freight\s+rate/i,
  /load\s+port/i,
  /disch(?:arge)?\s+port/i,
  /\blaycan\b/i,
  /\bdemurrage\b/i,
  /\bPOL\b/i,
  /\bPOD\b/i,
];

export function classifyRecapType(text: string): RecapType {
  if (!text || !text.trim()) return "UNKNOWN";

  if (TC_PATTERNS.some((re) => re.test(text))) return "TC";
  if (VOYAGE_PATTERNS.some((re) => re.test(text))) return "VOYAGE";

  return "UNKNOWN";
}
