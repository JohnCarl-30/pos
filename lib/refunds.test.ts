import { describe, expect, it } from "vitest";
import vectors from "./refund-vectors.json";
import { RefundError, checkPayout, methodRoom, priceRefund, refundLine, suggestPayout, type RefundVector } from "./refunds";

describe("refundLine", () => {
  for (const vector of vectors as RefundVector[]) {
    it(vector.name, () => {
      expect(refundLine(vector.line)).toEqual(vector.expected);
    });
  }

  it("adds up exactly to the line when refunded one at a time", () => {
    let amount = 0;
    let tax = 0;
    for (let refunded = 0; refunded < 7; refunded += 1) {
      const part = refundLine({ lineTotal: 1003, tax: 77, quantity: 7, refunded, units: 1 });
      amount += part.amount;
      tax += part.tax;
    }
    expect({ amount, tax }).toEqual({ amount: 1003, tax: 77 });
  });

  it("refuses more than is left", () => {
    expect(() => refundLine({ lineTotal: 650, tax: 50, quantity: 2, refunded: 1, units: 2 })).toThrow(new RefundError("Only 1 left to refund"));
  });

  it("refuses zero units", () => {
    expect(() => refundLine({ lineTotal: 650, tax: 50, quantity: 2, refunded: 0, units: 0 })).toThrow(RefundError);
  });
});

describe("priceRefund", () => {
  it("totals the lines and splits out tax", () => {
    expect(
      priceRefund([
        { lineTotal: 650, tax: 50, quantity: 2, refunded: 0, units: 1 },
        { lineTotal: 1624, tax: 124, quantity: 1, refunded: 0, units: 1 },
      ]),
    ).toEqual({ subtotal: 1800, taxTotal: 149, total: 1949, lines: [{ amount: 325, tax: 25 }, { amount: 1624, tax: 124 }] });
  });
});

describe("methodRoom", () => {
  it("subtracts earlier refunds per method", () => {
    expect(
      methodRoom(
        [{ method: "card", amount: 500 }, { method: "cash", amount: 490 }, { method: "other", amount: 100 }],
        [{ method: "card", amount: 330 }],
      ),
    ).toEqual({ card: 170, other: 100 });
  });
});

describe("suggestPayout", () => {
  it("fills card first, then other, then cash", () => {
    expect(suggestPayout(660, { card: 170, other: 100 })).toEqual([
      { method: "card", amount: 170 },
      { method: "other", amount: 100 },
      { method: "cash", amount: 390 },
    ]);
  });
  it("uses cash when nothing was paid by card", () => {
    expect(suggestPayout(379, { card: 0, other: 0 })).toEqual([{ method: "cash", amount: 379 }]);
  });
  it("suggests nothing for a free item", () => {
    expect(suggestPayout(0, { card: 100, other: 0 })).toEqual([]);
  });
});

describe("checkPayout", () => {
  const room = { card: 170, other: 0 };
  it("accepts payments that add up within the limits", () => {
    expect(checkPayout(660, [{ method: "card", amount: 170 }, { method: "cash", amount: 490 }], room)).toBeNull();
  });
  it("rejects too much on card", () => {
    expect(checkPayout(660, [{ method: "card", amount: 660 }], room)).toBe("Card refunds can't be more than was paid by card");
  });
  it("rejects too much on other", () => {
    expect(checkPayout(10, [{ method: "other", amount: 10 }], room)).toBe("Other refunds can't be more than was paid by other methods");
  });
  it("rejects payments that don't add up", () => {
    expect(checkPayout(660, [{ method: "cash", amount: 100 }], room)).toBe("Refund payments must add up to the refund");
  });
  it("rejects a zero amount", () => {
    expect(checkPayout(0, [{ method: "cash", amount: 0 }], room)).toBe("Each refund payment needs an amount above 0");
  });
  it("rejects a reference on cash", () => {
    expect(checkPayout(10, [{ method: "cash", amount: 10, reference: "x" }], room)).toBe("Only card and other refunds can have a reference");
  });
  it("rejects a long reference", () => {
    expect(checkPayout(10, [{ method: "card", amount: 10, reference: "x".repeat(101) }], { card: 10, other: 0 })).toBe("Keep the reference under 100 characters");
  });
});
