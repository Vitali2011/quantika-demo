import { calculateCommission, summarizeCommissions } from '../commission';
import type { ParsedFixtureRecap } from '../types';

function baseRecap(overrides: Partial<ParsedFixtureRecap> = {}): ParsedFixtureRecap {
  return {
    emailId: 'email-1',
    vesselName: { value: 'MV Test', confidence: 'confirmed' },
    owners: null,
    charterers: null,
    account: null,
    broker: null,
    loadPort: { value: 'Rotterdam', confidence: 'confirmed' },
    dischPort: { value: 'Hamburg', confidence: 'confirmed' },
    cargoDescription: null,
    cargoQuantityMin: null,
    cargoQuantityMax: null,
    cargoPackaging: null,
    laycan: null,
    transitTime: null,
    freightRate: null,
    freightBasis: null,
    freightPayment: null,
    loadingRate: null,
    loadingTerms: null,
    loadingWorkingHours: null,
    dischargingRate: null,
    dischargingTerms: null,
    dischargingWorkingHours: null,
    demurrageRate: null,
    demurragePayment: null,
    loadPortAgent: null,
    dischPortAgent: null,
    vesselDwt: null,
    vesselDraft: null,
    vesselGeared: null,
    cpForm: null,
    arbitration: null,
    law: null,
    commission: null,
    commissionPercent: null,
    commissionBase: null,
    commissionAmount: null,
    commissionCurrency: null,
    subs: [],
    confidentiality: false,
    additionalTerms: [],
    unknownTerms: [],
    // PR #231: surfaced 5 new schema fields
    commissionAddressPct: null,
    commissionAddressAmount: null,
    commissionBrokerPct: null,
    commissionBrokerAmount: null,
    despatchRate: null,
    acknowledgementDeadline: null,
    ...overrides,
  };
}

describe('calculateCommission', () => {
  it('returns null when no commission percent and no commission text', () => {
    const recap = baseRecap({ freightRate: { value: '25', confidence: 'confirmed' } });
    expect(calculateCommission(recap)).toBeNull();
  });

  it('calculates commission for lumpsum freight', () => {
    const recap = baseRecap({
      freightRate: { value: '500000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commissionPercent: 3.75,
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionPercent).toBe(3.75);
    expect(result!.commissionAmount).toBe(18750);
    expect(result!.freightAmount).toBe(500000);
    expect(result!.freightCurrency).toBe('USD');
  });

  it('calculates commission for per-MT freight with quantity', () => {
    const recap = baseRecap({
      freightRate: { value: '25', confidence: 'confirmed' },
      freightBasis: '/MT',
      commissionPercent: 5,
      cargoQuantityMax: 10000,
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionAmount).toBe(12500); // 25 * 10000 * 5%
  });

  it('uses EUR currency when EUR symbol present in freight', () => {
    const recap = baseRecap({
      freightRate: { value: '200000', confidence: 'confirmed' },
      freightBasis: 'lumpsum EUR',
      commissionPercent: 2,
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.freightCurrency).toBe('EUR');
  });

  it('extracts commission percent from raw commission text', () => {
    const recap = baseRecap({
      freightRate: { value: '300000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commission: '3.75% TTL on F/D/D',
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionPercent).toBe(3.75);
  });

  it('sums multiple commission components instead of taking the first (W1-7)', () => {
    // "addcom 1.25% + 2.5% bkge ttl" — first % is address/rebate, total is 3.75
    const recap = baseRecap({
      freightRate: { value: '300000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commission: 'addcom 1.25% + 2.5% bkge ttl',
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionPercent).toBe(3.75);
  });

  it('sums commission components regardless of order (W1-7)', () => {
    const recap = baseRecap({
      freightRate: { value: '300000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commission: 'address 2.5% + brokerage 1.25% ttl',
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionPercent).toBe(3.75);
  });

  it('keeps single-percent commission text unchanged (W1-7)', () => {
    const recap = baseRecap({
      freightRate: { value: '300000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commission: '5% commission',
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionPercent).toBe(5);
  });

  it('uses precomputed commissionAmount when provided', () => {
    const recap = baseRecap({
      commissionPercent: 5,
      commissionAmount: 15000,
      commissionCurrency: 'USD',
    });
    const result = calculateCommission(recap);
    expect(result).not.toBeNull();
    expect(result!.commissionAmount).toBe(15000);
    expect(result!.commissionCurrency).toBe('USD');
  });

  it('returns null for per-MT freight with no quantity', () => {
    const recap = baseRecap({
      freightRate: { value: '20', confidence: 'confirmed' },
      freightBasis: '/MT',
      commissionPercent: 3,
      cargoQuantityMin: null,
      cargoQuantityMax: null,
    });
    expect(calculateCommission(recap)).toBeNull();
  });
});

describe('summarizeCommissions', () => {
  it('returns empty summary for empty input', () => {
    const summary = summarizeCommissions([]);
    expect(summary.details).toHaveLength(0);
    expect(summary.totalByCurrency).toHaveLength(0);
  });

  it('aggregates commissions by currency', () => {
    const recap1 = baseRecap({
      emailId: 'e1',
      freightRate: { value: '100000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commissionPercent: 5,
    });
    const recap2 = baseRecap({
      emailId: 'e2',
      freightRate: { value: '200000', confidence: 'confirmed' },
      freightBasis: 'lumpsum',
      commissionPercent: 5,
    });
    const summary = summarizeCommissions([recap1, recap2]);
    expect(summary.details).toHaveLength(2);
    const usdTotal = summary.totalByCurrency.find(t => t.currency === 'USD');
    expect(usdTotal?.amount).toBe(15000); // 5000 + 10000
  });
});
