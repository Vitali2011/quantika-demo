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

/**
 * Extract commission percent from raw commission text.
 * The total commission is the sum of its components (address + brokerage), e.g.
 * "addcom 1.25% + 2.5% bkge ttl" -> 3.75. A "% ttl/total" label marks the final
 * figure directly, e.g. "3.75% TTL on F/D/D" -> 3.75.
 */
function extractPercentFromText(text: string): number | null {
  const all = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*%/g))
    .map((m) => parseFloat(m[1]))
    .filter((n) => !isNaN(n));
  if (all.length === 0) return null;

  // Single percentage → it is the commission (e.g. "3.75% TTL on F/D/D", "5%").
  if (all.length === 1) return all[0];

  // Multiple components (address + brokerage) → the total is their sum. A "ttl"
  // label in the text marks the sum as the final figure, not the last component.
  const sum = all.reduce((a, b) => a + b, 0);
  return Math.round(sum * 100) / 100;
}

export function calculateCommission(recap: ParsedFixtureRecap): CommissionResult | null {
  // Get commission percent — from parsed field or fallback to raw commission text
  let percent = safeNum(recap.commissionPercent);
  if (!percent && recap.commission) {
    percent = extractPercentFromText(safeStr(recap.commission));
  }
  if (!percent) return null;

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
