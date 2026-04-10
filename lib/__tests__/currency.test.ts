import { convertCurrency, formatCurrencyAmount, clearCurrencyCache } from "../currency";

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

  it("EUR to USD uses fallback rate", async () => {
    // Mock fetch to fail so we hit fallback
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

  it("caches exchange rate", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("network"));
    
    await convertCurrency(100, "EUR", "USD");
    // Second call should use cache
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
});
