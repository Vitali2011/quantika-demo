/* eslint-disable @typescript-eslint/no-explicit-any */
import { ParsedFixtureRecap, CommissionResult, CommissionSummary } from './types';

function safeStr(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && 'value' in v) return safeStr(v.value);
  return String(v);
}

function safeNum(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (typeof v === 'string') { const m = v.match(/([\d,]+(?:\.[\d]+)?)/); if (m) { const n = parseFloat(m[1].replace(/,/g, '')); return isNaN(n) ? null : n; } return null; }
  if (typeof v === 'object' && 'value' in v) return safeNum(v.value);
  return null;
}

/** Extract commission percent from raw commission text, e.g. "3.75% TTL on F/D/D" -> 3.75 */
function extractPercentFromText(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) {
    const n = parseFloat(m[1]);
    return isNaN(n) ? null : n;
  }
  return null;
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
  const commissionCurrency = recap.commissionCurrency || currency;

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
