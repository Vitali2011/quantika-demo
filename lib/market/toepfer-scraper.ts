import type { MarketBenchmark } from '@/lib/types';

const SOURCE_URL = 'https://heavyliftpfi.com/market-data/';

/**
 * Extracts the numeric USD value from strings like "$12,683" or "12683".
 */
function parseUsdValue(text: string): number | null {
  const match = text.match(/\$?([\d,]+)/);
  if (!match) return null;
  const numeric = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(numeric) ? null : numeric;
}

/**
 * Extracts a period string like "April 2026" from the page HTML.
 */
function parsePeriod(html: string): string | null {
  // Match month names followed by a 4-digit year
  const match = html.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i,
  );
  if (!match) return null;
  // Capitalise first letter, rest lower
  const month = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return `${month} ${match[2]}`;
}

/**
 * Parses the Toepfer TMI value from raw HTML.
 * Looks for the tmi-value element pattern used on heavyliftpfi.com.
 * Returns null if the value cannot be found.
 */
function parseTmiFromHtml(html: string): { value: number; period: string } | null {
  // Try structured element with class tmi-value first
  const valueMatch = html.match(/class="tmi-value"[^>]*>\s*\$?([\d,]+)/);
  const value = valueMatch ? parseUsdValue(valueMatch[1]) : null;

  // Fallback: look for a dollar amount near "TMI" or "per day" context
  const fallbackMatch =
    !value &&
    html.match(/TMI[^<]*?>\s*\$?([\d,]+)|>\s*\$?([\d,]+)\s*<[^<]+per\s+day/i);
  const resolvedValue =
    value ??
    (fallbackMatch
      ? parseUsdValue((fallbackMatch[1] ?? fallbackMatch[2]) || '')
      : null);

  if (resolvedValue === null) return null;

  const period = parsePeriod(html);
  if (!period) return null;

  return { value: resolvedValue, period };
}

/**
 * Fetches the Toepfer TMI from heavyliftpfi.com.
 * Returns null on any network or parse error (graceful fallback).
 */
export async function fetchToepferTmi(): Promise<MarketBenchmark | null> {
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) return null;

    const html = await response.text();
    const parsed = parseTmiFromHtml(html);
    if (!parsed) return null;

    return {
      indicator: 'TOEPFER_TMI',
      value: parsed.value,
      unit: 'USD/day',
      period: parsed.period,
      sourceUrl: SOURCE_URL,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
