import { ParsedFixtureRecap, CommissionResult, CommissionSummary } from './types';

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'value' in v) return safeStr((v as { value: unknown }).value);
  return String(v);
}

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') { const m = v.match(/([\d,]+(?:\.[\d]+)?)/); if (m) { const n = parseFloat(m[1].replace(/,/g, '')); return isNaN(n) ? null : n; } return null; }
  if (typeof v === 'object' && 'value' in v) return safeNum((v as { value: unknown }).value);
  return null;
}

// Commission may not exceed a sane ceiling — figures above this are parse noise
// (freight%, demurrage%, double-counted totals) and are treated as unreliable.
const MAX_COMMISSION_PCT = 15;

/**
 * Tier-3 fallback: extract commission percent from free commission text.
 *
 * This is only a last resort when both the AI total and the structural
 * components are absent. It is keyword-anchored — NOT a blind sum of every "%"
 * in the text — to avoid swallowing freight/demurrage/despatch percentages that
 * frequently share the same field (e.g. "comm 2.5% on freight, dem 50% of
 * demurrage" must read 2.5, not 52.5).
 *
 * Rules:
 *  - A token labelled "ttl"/"total" marks the final figure directly and wins
 *    (e.g. "3.75% total (1.25% address, 2.5% bkge)" -> 3.75, no double count).
 *  - Otherwise sum only tokens anchored to a commission keyword
 *    (addcom/address/bkge/brokerage/comm), ignoring freight/dem/despatch tokens.
 */
function extractPercentFromText(text: string): number | null {
  // 1) Explicit total marker wins outright (avoids double-counting breakdowns,
  //    e.g. "3.75% total (1.25% address, 2.5% bkge)" -> 3.75). The number must
  //    be directly bound to ttl/total — a bare "X% ttl" trailing a list of
  //    components (e.g. "...brokerage 1.25% ttl") is NOT a standalone total, so
  //    we only treat number-before-marker as a total when no component keywords
  //    are anchored (handled by falling through to tier 2 below).
  const totalLed = text.match(/(?:ttl|total)\s*(?:[:=]\s*|\s+)?(\d+(?:\.\d+)?)\s*%/i);
  if (totalLed) {
    const n = parseFloat(totalLed[1]);
    if (!isNaN(n)) return Math.round(n * 100) / 100;
  }
  const totalTrail = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:ttl|total)\b/i);

  // 2) Sum only commission-keyword-anchored percentages. The keyword may precede
  //    the number ("addcom 1.25%") or directly follow it ("2.5% bkge"), within a
  //    tight window that does NOT cross a clause boundary (comma/`;`/`+`). The
  //    boundary guard excludes freight/demurrage percentages that share the
  //    field ("comm 2.5% on freight, dem 50%..." -> 2.5; "freight 25%, addcom
  //    1.25% + bkge 2.5%" -> 3.75, freight's 25% is comma-separated). Matches are
  //    deduped by the percentage token's position so a single number anchored on
  //    both sides is not counted twice.
  const COMMISSION_KW = '(?:addcom|add\\.?\\s*comm|address|bkge|brokerage|broker|comm(?:ission)?)';
  const seen = new Set<number>();
  const anchored: number[] = [];
  for (const re of [
    new RegExp(`${COMMISSION_KW}[^%\\d,;+]{0,8}(\\d+(?:\\.\\d+)?)\\s*%`, 'gi'),
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%[^%\\d,;+]{0,6}${COMMISSION_KW}`, 'gi'),
  ]) {
    for (const m of text.matchAll(re)) {
      const pos = m.index! + m[0].indexOf(m[1]);
      if (seen.has(pos)) continue;
      const n = parseFloat(m[1]);
      if (!isNaN(n)) { seen.add(pos); anchored.push(n); }
    }
  }

  if (anchored.length > 0) {
    const sum = anchored.reduce((a, b) => a + b, 0);
    return Math.round(sum * 100) / 100;
  }

  // 2b) A standalone "X% ttl/total" (no component keywords found) is the total.
  if (totalTrail) {
    const n = parseFloat(totalTrail[1]);
    if (!isNaN(n)) return Math.round(n * 100) / 100;
  }

  // 3) No keyword context at all → only trust a lone percentage (e.g. "5%").
  //    Multiple unanchored tokens are ambiguous; bail rather than guess.
  const all = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%/g))
    .map((m) => parseFloat(m[1]))
    .filter((n) => !isNaN(n));
  if (all.length === 1) return all[0];
  return null;
}

export function calculateCommission(recap: ParsedFixtureRecap): CommissionResult | null {
  // Resolve commission percent by priority:
  //  (1) AI-parsed total (commissionPercent),
  //  (2) sum of structural components (address + broker) if either is present,
  //  (3) keyword-anchored text fallback (last resort).
  let percent = safeNum(recap.commissionPercent);
  if (!percent) {
    const addr = safeNum(recap.commissionAddressPct);
    const brk = safeNum(recap.commissionBrokerPct);
    if (addr != null || brk != null) {
      percent = Math.round(((addr ?? 0) + (brk ?? 0)) * 100) / 100;
    }
  }
  if (!percent && recap.commission) {
    percent = extractPercentFromText(safeStr(recap.commission));
  }
  if (!percent) return null;
  // Sanity clamp: a commission above the ceiling is parse noise, not a real rate.
  if (percent > MAX_COMMISSION_PCT) return null;

  // Detect currency from freight rate
  const rateStr = safeStr(recap.freightRate);
  const basisStr = safeStr(recap.freightBasis);
  const fullFreightStr = `${rateStr} ${basisStr}`.trim();
  const currency = /EUR|\u20ac/i.test(fullFreightStr) ? 'EUR' : 'USD';

  // If AI already computed commissionAmount, use it directly
  const precomputedAmount = safeNum(recap.commissionAmount);
  const commissionCurrency = (typeof recap.commissionCurrency === 'string' && recap.commissionCurrency) || currency;

  if (precomputedAmount && precomputedAmount > 0) {
    const totalFreight = Math.round((precomputedAmount / percent) * 100 * 100) / 100;
    return {
      recapEmailId: recap.emailId,
      vesselName: safeStr(recap.vesselName) || 'Unknown Vessel',
      route: `${safeStr(recap.loadPort) || '?'} \u2192 ${safeStr(recap.dischPort) || '?'}`,
      commissionPercent: percent,
      freightAmount: totalFreight,
      freightCurrency: commissionCurrency,
      commissionAmount: Math.round(precomputedAmount * 100) / 100,
      commissionCurrency,
    };
  }

  // Extract numeric freight amount
  const rateNum = safeNum(recap.freightRate);
  if (!rateNum) return null;

  // Determine if per-MT or lumpsum
  const isPerMt = /\/mt|per.?mt|pmt|fiost|fio\b/i.test(fullFreightStr) || (rateNum < 1000 && !(/lump/i.test(fullFreightStr)));
  
  let totalFreight = rateNum;
  if (isPerMt) {
    const qty = safeNum(recap.cargoQuantityMax) || safeNum(recap.cargoQuantityMin);
    if (qty) {
      totalFreight = rateNum * qty;
    } else {
      // Can't calculate without quantity
      return null;
    }
  }

  const commissionAmount = (totalFreight * percent) / 100;

  return {
    recapEmailId: recap.emailId,
    vesselName: safeStr(recap.vesselName) || 'Unknown Vessel',
    route: `${safeStr(recap.loadPort) || '?'} \u2192 ${safeStr(recap.dischPort) || '?'}`,
    commissionPercent: percent,
    freightAmount: Math.round(totalFreight * 100) / 100,
    freightCurrency: currency,
    commissionAmount: Math.round(commissionAmount * 100) / 100,
    commissionCurrency: currency,
  };
}

export function summarizeCommissions(recaps: ParsedFixtureRecap[]): CommissionSummary {
  const details: CommissionResult[] = [];
  for (const recap of recaps) {
    const result = calculateCommission(recap);
    if (result) details.push(result);
  }

  const byCurrency = new Map<string, number>();
  for (const d of details) {
    byCurrency.set(d.commissionCurrency, (byCurrency.get(d.commissionCurrency) || 0) + d.commissionAmount);
  }

  const totalByCurrency = Array.from(byCurrency.entries()).map(([currency, amount]) => ({
    currency,
    amount: Math.round(amount * 100) / 100,
  }));

  return { totalByCurrency, details };
}
