/**
 * Insert: vessel passport (name, IMO, dwt, year, flag, last 3 fixtures).
 * Spec β-13.
 */
import type { InsertResult } from './index';

export interface VesselFixture {
  date: string;
  route: string;
  rate: number;
}

export interface VesselPassport {
  name: string;
  imo: string;
  dwt: number;
  year: number;
  flag: string;
  fixtures: VesselFixture[];
}

export interface PassportOpts {
  fetcher?: (vesselId: string) => Promise<VesselPassport | null>;
}

const defaultFetcher = async (vesselId: string): Promise<VesselPassport | null> => {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch(`/vessel/${encodeURIComponent(vesselId)}`);
    if (!res.ok) return null;
    return (await res.json()) as VesselPassport;
  } catch {
    return null;
  }
};

export async function buildPassportInsert(
  vesselId: string,
  opts: PassportOpts = {},
): Promise<InsertResult> {
  const fetcher = opts.fetcher ?? defaultFetcher;
  const v = await fetcher(vesselId);

  if (!v) {
    const html = `<div>Vessel ${esc(vesselId)} — passport not found</div>`;
    const plain = `Vessel ${vesselId} — IMO n/a (not found)`;
    return { html, plain };
  }

  const fxRows = v.fixtures
    .slice(0, 3)
    .map(
      (f) =>
        `<tr><td>${esc(f.date)}</td><td>${esc(f.route)}</td><td>${fmtNum(
          f.rate,
        )}</td></tr>`,
    )
    .join('');

  const html =
    `<table border="1" cellpadding="4" cellspacing="0">` +
    `<tbody>` +
    `<tr><th>Vessel</th><td>${esc(v.name)}</td></tr>` +
    `<tr><th>IMO</th><td>${esc(v.imo)}</td></tr>` +
    `<tr><th>DWT</th><td>${fmtNum(v.dwt)}</td></tr>` +
    `<tr><th>Year</th><td>${v.year}</td></tr>` +
    `<tr><th>Flag</th><td>${esc(v.flag)}</td></tr>` +
    `</tbody></table>` +
    `<p><strong>Last fixtures</strong></p>` +
    `<table border="1" cellpadding="4" cellspacing="0">` +
    `<thead><tr><th>Date</th><th>Route</th><th>Rate</th></tr></thead>` +
    `<tbody>${fxRows}</tbody></table>`;

  const fxPlain = v.fixtures
    .slice(0, 3)
    .map((f) => `  ${f.date}\t${f.route}\t${f.rate}`)
    .join('\n');

  const plain =
    `Vessel: ${v.name}\n` +
    `IMO: ${v.imo}\n` +
    `DWT: ${v.dwt}\n` +
    `Year: ${v.year}\n` +
    `Flag: ${v.flag}\n` +
    `Last fixtures:\n${fxPlain}`;

  return { html, plain };
}

// BUG-β-13-PassportNaN: safely format a number (or any unknown), returning
// 'n/a' for null/undefined/NaN/non-finite values instead of throwing or
// printing literal 'NaN'.
function fmtNum(n: unknown): string {
  return typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-US')
    : 'n/a';
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
