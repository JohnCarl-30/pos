import { describe, expect, it } from "vitest";
import vectors from "./checkout-vectors.json";
import { CartError, allocate, discountShareBps, priceCart, summarisePayments, type CheckoutVector, splitEvenly } from "./checkout";

describe("priceCart", () => {
  for (const vector of vectors as CheckoutVector[]) {
    it(vector.name, () => {
      expect(priceCart(vector.lines, vector.orderDiscount, vector.pricesIncludeTax)).toEqual(vector.expected);
    });
  }

  it("rejects a percentage and an amount on the same line", () => {
    expect(() => priceCart([{ price: 100, quantity: 1, rateBps: 0, discountBps: 100, discountAmount: 5 }], null, false)).toThrow(CartError);
  });
  it("rejects a discount bigger than the line", () => {
    expect(() => priceCart([{ price: 100, quantity: 1, rateBps: 0, discountAmount: 101 }], null, false)).toThrow(CartError);
  });
  it("rejects a whole-sale discount bigger than the sale", () => {
    expect(() => priceCart([{ price: 100, quantity: 1, rateBps: 0 }], { amount: 101 }, false)).toThrow(CartError);
  });
  it("rejects a bad quantity", () => {
    expect(() => priceCart([{ price: 100, quantity: 0, rateBps: 0 }], null, false)).toThrow(CartError);
    expect(() => priceCart([{ price: 100, quantity: 10000, rateBps: 0 }], null, false)).toThrow(CartError);
  });
});

describe("allocate", () => {
  it("splits exactly and breaks ties toward earlier lines", () => {
    expect(allocate(100, [300, 1250])).toEqual([19, 81]);
    expect(allocate(1, [100, 100])).toEqual([1, 0]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(3, [0, 0])).toEqual([0, 0]);
  });
});

describe("discountShareBps", () => {
  it("rounds the share up", () => {
    expect(discountShareBps(300, 90)).toBe(3000);
    expect(discountShareBps(999, 150)).toBe(1502);
    expect(discountShareBps(0, 0)).toBe(0);
  });
});

describe("summarisePayments", () => {
  it("works out change and completeness", () => {
    expect(summarisePayments(660, [{ method: "cash", amount: 660, tendered: 1000 }])).toEqual({ paid: 660, remaining: 0, change: 340, complete: true, error: null });
    expect(summarisePayments(1000, [{ method: "card", amount: 400 }])).toEqual({ paid: 400, remaining: 600, change: 0, complete: false, error: null });
    expect(summarisePayments(0, [])).toEqual({ paid: 0, remaining: 0, change: 0, complete: true, error: null });
  });
  it("explains invalid payments", () => {
    expect(summarisePayments(100, [{ method: "card", amount: 100, tendered: 200 }]).error).toBe("Only cash can have an amount received");
    expect(summarisePayments(100, [{ method: "cash", amount: 100, tendered: 50 }]).error).toBe("Cash received can't be less than the amount");
    expect(summarisePayments(100, [{ method: "card", amount: 150 }]).error).toBe("Payments add up to more than the total");
    expect(summarisePayments(100, [{ method: "card", amount: 0 }]).error).toBe("Each payment needs an amount above 0");
  });
});

describe("splitEvenly", () => {
  it("adds up exactly with extra cents first", () => {
    expect(splitEvenly(1001, 3)).toEqual([334, 334, 333]);
    expect(splitEvenly(1000, 2)).toEqual([500, 500]);
    expect(splitEvenly(2, 3)).toEqual([1, 1, 0]);
  });
  it("refuses fewer than 1 or more than 20 people", () => {
    expect(() => splitEvenly(100, 0)).toThrow(CartError);
    expect(() => splitEvenly(100, 21)).toThrow(CartError);
  });
});
