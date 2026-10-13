import { describe, expect, it } from "vitest";
import { currencyDigits, formatMoney, parseMoney } from "./money";

describe("currencyDigits", () => {
  it("knows minor-unit digits per currency", () => {
    expect(currencyDigits("USD")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
  });
});

describe("formatMoney", () => {
  it("formats minor units in the store currency", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(1500, "JPY", "en-US")).toBe("¥1,500");
    expect(formatMoney(-250, "EUR", "de-DE")).toBe("-2,50 €");
  });
});

describe("parseMoney", () => {
  it("parses dot decimals", () => {
    expect(parseMoney("12.34", "USD")).toBe(1234);
    expect(parseMoney("12", "USD")).toBe(1200);
    expect(parseMoney("12.", "USD")).toBe(1200);
    expect(parseMoney("$1,234.50", "USD")).toBe(123450);
  });

  it("parses comma decimals and dot grouping", () => {
    expect(parseMoney("12,5", "EUR")).toBe(1250);
    expect(parseMoney("1.234,56", "EUR")).toBe(123456);
  });

  it("treats a 3-digit tail as grouping", () => {
    expect(parseMoney("1,234", "USD")).toBe(123400);
    expect(parseMoney("¥1,000", "JPY")).toBe(1000);
  });

  it("handles negatives", () => {
    expect(parseMoney("-3", "USD")).toBe(-300);
    expect(parseMoney("-0", "USD")).toBe(0);
  });

  it("rejects input that isn't an amount", () => {
    expect(parseMoney("", "USD")).toBeNull();
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(parseMoney("1.2.3", "USD")).toBeNull();
    expect(parseMoney("0.001", "USD")).toBeNull();
    expect(parseMoney("12,34", "JPY")).toBeNull();
  });
});
