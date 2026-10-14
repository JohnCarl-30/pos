import { describe, expect, it } from "vitest";
import { calculateLine, divRoundHalfEven, sumLines } from "./tax";

describe("divRoundHalfEven", () => {
  it("rounds halves to even", () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
  });
  it("rounds other fractions to nearest", () => {
    expect(divRoundHalfEven(1n, 3n)).toBe(0n);
    expect(divRoundHalfEven(2n, 3n)).toBe(1n);
  });
});

const base = { quantity: 1, discount: 0, pricesIncludeTax: false };

describe("calculateLine — tax added at checkout", () => {
  it("rounds a half cent to even", () => {
    expect(calculateLine({ ...base, unitPrice: 1000, rateBps: 825 })).toEqual({
      net: 1000,
      tax: 82,
      gross: 1082,
    });
  });
  it("rounds above half up", () => {
    expect(calculateLine({ ...base, unitPrice: 1100, rateBps: 825 })).toEqual({
      net: 1100,
      tax: 91,
      gross: 1191,
    });
  });
  it("applies quantity and discount before tax", () => {
    expect(
      calculateLine({ ...base, unitPrice: 500, quantity: 3, discount: 100, rateBps: 1000 }),
    ).toEqual({ net: 1400, tax: 140, gross: 1540 });
  });
  it("is zero for a zero rate", () => {
    expect(calculateLine({ ...base, unitPrice: 999, rateBps: 0 })).toEqual({
      net: 999,
      tax: 0,
      gross: 999,
    });
  });
});

describe("calculateLine — prices include tax", () => {
  const inclusive = { ...base, pricesIncludeTax: true };
  it("extracts tax from the price", () => {
    expect(calculateLine({ ...inclusive, unitPrice: 1120, rateBps: 1200 })).toEqual({
      net: 1000,
      tax: 120,
      gross: 1120,
    });
  });
  it("rounds the net amount", () => {
    expect(calculateLine({ ...inclusive, unitPrice: 1000, rateBps: 1200 })).toEqual({
      net: 893,
      tax: 107,
      gross: 1000,
    });
  });
});

describe("calculateLine — bad input", () => {
  it("rejects a discount larger than the line", () => {
    expect(() =>
      calculateLine({ ...base, unitPrice: 100, discount: 200, rateBps: 0 }),
    ).toThrow(RangeError);
  });
  it("rejects non-integer money", () => {
    expect(() => calculateLine({ ...base, unitPrice: 1.5, rateBps: 0 })).toThrow(
      RangeError,
    );
  });
  it("rejects zero quantity", () => {
    expect(() =>
      calculateLine({ ...base, unitPrice: 100, quantity: 0, rateBps: 0 }),
    ).toThrow(RangeError);
  });
});

describe("sumLines", () => {
  it("adds lines field by field", () => {
    expect(
      sumLines([
        { net: 1000, tax: 82, gross: 1082 },
        { net: 500, tax: 41, gross: 541 },
      ]),
    ).toEqual({ net: 1500, tax: 123, gross: 1623 });
  });
  it("is zero for no lines", () => {
    expect(sumLines([])).toEqual({ net: 0, tax: 0, gross: 0 });
  });
});
