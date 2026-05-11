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
});
