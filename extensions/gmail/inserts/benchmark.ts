/**
 * Insert: latest market benchmark (Toepfer TMI / route rate).
 * Spec β-13.
 */
import type { InsertResult } from './index';

export interface BenchmarkRow {
  route: string;
  rate: number;
  date: string;
  source: string;
}

export interface BenchmarkOpts {
  fetcher?: (route: string) => Promise<BenchmarkRow | null>;
}

const defaultFetcher = async (route: string): Promise<BenchmarkRow | null> => {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`/api/benchmark?route=${encodeURIComponent(route)}`);
    if (!res.ok) return null;
    return (await res.json()) as BenchmarkRow;
  } catch {
    return null;
  }
};

export async function buildBenchmarkInsert(
  route: string,
  opts: BenchmarkOpts = {},
): Promise<InsertResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const row = await fetcher(route);

  if (!row) {
    const html =
      `<table border="1" cellpadding="4" cellspacing="0">` +
      `<thead><tr><th>Route</th><th>Rate</th><th>Date</th><th>Source</th></tr></thead>` +
      `<tbody><tr><td>${esc(route)}</td><td>n/a</td><td>n/a</td><td>n/a</td></tr></tbody>` +
      `</table>`;
    const plain = `Route\tRate\tDate\tSource\n${route}\tn/a\tn/a\tn/a`;
    return { html, plain };
  }

  const formattedRate = row.rate.toLocaleString('en-US');
  const html =
    `<table border="1" cellpadding="4" cellspacing="0">` +
    `<thead><tr><th>Route</th><th>Rate (USD/day)</th><th>Date</th><th>Source</th></tr></thead>` +
    `<tbody><tr>` +
    `<td>${esc(row.route)}</td>` +
    `<td>${formattedRate}</td>` +
    `<td>${esc(row.date)}</td>` +
    `<td>${esc(row.source)}</td>` +
    `</tr></tbody></table>`;

  const plain =
    `Route\tRate\tDate\tSource\n` +
    `${row.route}\t${row.rate}\t${row.date}\t${row.source}`;

  return { html, plain };
}

// Extend escape to cover " and ' so the helper is safe in both text and
// attribute contexts (BUG-β-13-AttrXSS family).
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
