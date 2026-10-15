import { describe, expect, it } from "vitest";
import { saleSchema } from "./sale-schema";

const id = "00000000-0000-4000-8000-000000000001";

describe("saleSchema", () => {
  it("accepts a well-formed sale", () => {
    const sale = { sessionId: id, lines: [{ variantId: id, quantity: 2, discountBps: 1000 }], orderDiscount: null, approvalId: null, customerId: null, payments: [{ method: "cash", amount: 660, tendered: 1000 }] };
    expect(saleSchema.safeParse(sale).success).toBe(true);
  });
  it("rejects malformed sales", () => {
    expect(saleSchema.safeParse({ sessionId: "x", lines: [], payments: [] }).success).toBe(false);
    expect(saleSchema.safeParse({ sessionId: id, lines: [{ variantId: id, quantity: 1.5 }], orderDiscount: null, approvalId: null, customerId: null, payments: [] }).success).toBe(false);
    expect(saleSchema.safeParse({ sessionId: id, lines: [{ variantId: id, quantity: 1 }], orderDiscount: null, approvalId: null, customerId: null, payments: [{ method: "cheque", amount: 1 }] }).success).toBe(false);
  });
  it("checks choices, tips and the order name", () => {
    const sale = { sessionId: id, lines: [{ variantId: id, quantity: 1, optionIds: [id] }], orderDiscount: null, approvalId: null, customerId: null, payments: [{ method: "card", amount: 100 }], tip: 10, orderName: "Sam" };
    expect(saleSchema.safeParse(sale).success).toBe(true);
    expect(saleSchema.safeParse({ ...sale, tip: -1 }).success).toBe(false);
    expect(saleSchema.safeParse({ ...sale, orderName: "x".repeat(41) }).success).toBe(false);
    expect(saleSchema.safeParse({ ...sale, lines: [{ variantId: id, quantity: 1, optionIds: ["nope"] }] }).success).toBe(false);
  });
});
