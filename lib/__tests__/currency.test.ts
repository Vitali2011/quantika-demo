import Database from 'better-sqlite3';
import { convertCurrency, formatCurrencyAmount, currencySymbol, clearCurrencyCache } from "../currency";
import { upsertFxRate } from "../market/fx-rates-repository";

function buildTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE fx_rates (
      base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL,
      rate REAL NOT NULL, rate_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'frankfurter', fetched_at TEXT NOT NULL,
      PRIMARY KEY (base_currency, quote_currency, rate_date)
    );
  `);
  return db;
}

beforeEach(() => {
  clearCurrencyCache();
});

describe("convertCurrency", () => {
  it("same currency returns identity", async () => {
    const result = await convertCurrency(1000, "USD", "USD");
    expect(result.exchangeRate).toBe(1);
    expect(result.targetAmount).toBe(1000);
    expect(result.source).toBe("manual");
  });

  it("EUR to USD uses fallback rate when network fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));

    const result = await convertCurrency(1000, "EUR", "USD");
    expect(result.exchangeRate).toBe(1.08);
    expect(result.targetAmount).toBe(1080);
    expect(result.source).toBe("manual");
    expect(result.originalCurrency).toBe("EUR");
    expect(result.targetCurrency).toBe("USD");

    global.fetch = originalFetch;
  });

  it("NOK to USD uses fallback rate when network fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));

    const result = await convertCurrency(1000, "NOK", "USD");
    expect(result.exchangeRate).toBeCloseTo(0.092);
    expect(result.targetAmount).toBeCloseTo(92);
    expect(result.source).toBe("manual");

    global.fetch = originalFetch;
  });

  it("AED to USD uses fallback rate when network fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));

    const result = await convertCurrency(1000, "AED", "USD");
    expect(result.exchangeRate).toBeCloseTo(0.272);
    expect(result.targetAmount).toBeCloseTo(272);
    expect(result.source).toBe("manual");

    global.fetch = originalFetch;
  });

  it("Frankfurter API success returns 'frankfurter' source", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        amount: 1,
        base: "EUR",
        date: "2026-05-11",
        rates: { USD: 1.1218 },
      }),
    } as Response);

    const result = await convertCurrency(1000, "EUR", "USD");
    expect(result.source).toBe("frankfurter");
    expect(result.exchangeRate).toBeCloseTo(1.1218);
    expect(result.targetAmount).toBeCloseTo(1121.8);

    global.fetch = originalFetch;
  });

  it("Frankfurter URL is used (not exchangerate.host)", async () => {
    const originalFetch = global.fetch;
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: "EUR", date: "2026-05-11", rates: { USD: 1.09 } }),
    } as Response);
    global.fetch = mockFetch;

    await convertCurrency(100, "EUR", "USD");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("frankfurter.app")
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("exchangerate.host")
    );

    global.fetch = originalFetch;
  });

  it("caches exchange rate in memory", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));

    await convertCurrency(100, "EUR", "USD");
    const result = await convertCurrency(200, "EUR", "USD");
    expect(result.targetAmount).toBe(216);

    global.fetch = originalFetch;
  });

  it("unknown currency pair defaults to rate 1", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));

    const result = await convertCurrency(500, "JPY", "CHF");
    expect(result.exchangeRate).toBe(1);
    expect(result.source).toBe("manual");

    global.fetch = originalFetch;
  });

  it("uses DB tier (Tier 2) when db provided and rate exists", async () => {
    const db = buildTestDb();
    upsertFxRate(db, {
      base_currency: 'NOK', quote_currency: 'USD',
      rate: 0.095, rate_date: '2026-05-11',
      source: 'frankfurter', fetched_at: new Date().toISOString(),
    });

    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    const result = await convertCurrency(1000, 'NOK', 'USD', db);
    expect(result.exchangeRate).toBeCloseTo(0.095);
    expect(result.source).toBe('frankfurter');
    // Frankfurter API should NOT be called (DB hit)
    expect(fetchSpy).not.toHaveBeenCalled();

    global.fetch = jest.fn();
    db.close();
  });

  it("falls through to Frankfurter when db has no row for pair", async () => {
    const db = buildTestDb();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: 'AED', date: '2026-05-11', rates: { USD: 0.272 } }),
    } as Response);

    const result = await convertCurrency(100, 'AED', 'USD', db);
    expect(result.source).toBe('frankfurter');
    expect(result.exchangeRate).toBeCloseTo(0.272);

    global.fetch = originalFetch;
    db.close();
  });
});

describe("formatCurrencyAmount", () => {
  it("USD format with dollar sign", () => {
    expect(formatCurrencyAmount(1234.5, "USD")).toBe("$1,234.50");
  });

  it("EUR format with currency prefix", () => {
    expect(formatCurrencyAmount(1234.5, "EUR")).toBe("EUR 1,234.50");
  });

  it("GBP format with currency prefix", () => {
    expect(formatCurrencyAmount(999, "GBP")).toBe("GBP 999.00");
  });

  it("large number formatting", () => {
    expect(formatCurrencyAmount(139500, "USD")).toBe("$139,500.00");
  });

  it("NOK format with currency prefix", () => {
    expect(formatCurrencyAmount(10000, "NOK")).toBe("NOK 10,000.00");
  });

  it("AED format with currency prefix", () => {
    expect(formatCurrencyAmount(5000, "AED")).toBe("AED 5,000.00");
  });

  it("negative USD: minus precedes dollar sign", () => {
    expect(formatCurrencyAmount(-1100, "USD")).toBe("-$1,100.00");
  });

  it("negative EUR: minus precedes currency prefix", () => {
    expect(formatCurrencyAmount(-1100, "EUR")).toBe("-EUR 1,100.00");
  });

  it("negative NOK: minus precedes currency prefix", () => {
    expect(formatCurrencyAmount(-500.5, "NOK")).toBe("-NOK 500.50");
  });
});

describe("currencySymbol", () => {
  it("USD maps to dollar sign", () => {
    expect(currencySymbol("USD")).toBe("$");
  });

  it("EUR maps to euro sign (NOT the text EUR)", () => {
    expect(currencySymbol("EUR")).toBe("€");
  });

  it("GBP maps to pound sign", () => {
    expect(currencySymbol("GBP")).toBe("£");
  });

  it("JPY maps to yen sign", () => {
    expect(currencySymbol("JPY")).toBe("¥");
  });

  it("NOK maps to kr", () => {
    expect(currencySymbol("NOK")).toBe("kr");
  });

  it("unknown currency falls back to the code itself", () => {
    expect(currencySymbol("AED")).toBe("AED");
    expect(currencySymbol("ZZZ")).toBe("ZZZ");
  });
});
