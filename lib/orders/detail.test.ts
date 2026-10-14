import { describe, expect, it } from "vitest";
import { canVoid, pickReceiptMatch, refundAvailability, toRefundContext, unitsLeft, type OrderDetailRow } from "./detail";

const order: OrderDetailRow = {
  id: "o1",
  store_id: "s1",
  staff_id: "c3",
  receipt_number: 7,
  created_at: "2026-10-14T10:00:00Z",
  status: "partially_refunded",
  subtotal: 1200,
  discount_total: 0,
  tax_total: 120,
  total: 1320,
  void_reason: null,
  voided_at: null,
  register: { name: "Counter 1" },
  store: { timezone: "America/Chicago" },
  session: { closed_at: null },
  staff: { name: "Casey" },
  discounter: null,
  voider: null,
  customer: null,
  order_items: [
    { id: "i2", line_number: 2, name: "Mug", sku: "MUG", unit_price: 300, quantity: 1, discount: 0, tax: 30, line_total: 330 },
    { id: "i1", line_number: 1, name: "Tea", sku: "TEA", unit_price: 300, quantity: 3, discount: 0, tax: 90, line_total: 990 },
  ],
  payments: [
    { id: "p1", method: "card", amount: 500, tendered: null, change: null, reference: null },
    { id: "p2", method: "cash", amount: 820, tendered: 1000, change: 180, reference: null },
  ],
  refunds: [
    {
      id: "r1",
      receipt_number: 8,
      created_at: "2026-10-14T11:00:00Z",
      reason: "changed_mind",
      note: null,
      total: 330,
      staff: null,
      approver: null,
      refund_items: [{ order_item_id: "i1", quantity: 1, restock: true, amount: 330 }],
      refund_payments: [{ method: "card", amount: 330, reference: null }],
    },
  ],
};
const fresh: OrderDetailRow = { ...order, status: "completed", refunds: [] };
const till = { sessionId: "s", registerName: "Counter 1" };

describe("toRefundContext", () => {
  it("lists lines in order with what's already refunded and what's left on card", () => {
    const context = toRefundContext(order);
    expect(context.lines.map((line) => [line.name, line.refunded, line.unitPaid])).toEqual([
      ["Tea", 1, 330],
      ["Mug", 0, 330],
    ]);
    expect(context.room).toEqual({ card: 170, other: 0 });
    expect(context.timeZone).toBe("America/Chicago");
    expect(unitsLeft(context)).toBe(3);
  });
});

describe("canVoid", () => {
  it("allows a cashier's own fresh sale while the till is open", () => {
    expect(canVoid(fresh, { id: "c3", role: "cashier" })).toBe(true);
  });
  it("stops cashiers voiding other people's sales, but not managers", () => {
    expect(canVoid(fresh, { id: "c9", role: "cashier" })).toBe(false);
    expect(canVoid(fresh, { id: "c9", role: "manager" })).toBe(true);
  });
  it("stops voids after refunds, after close, and twice", () => {
    expect(canVoid(order, { id: "c3", role: "owner" })).toBe(false);
    expect(canVoid({ ...fresh, session: { closed_at: "2026-10-14T18:00:00Z" } }, { id: "c3", role: "owner" })).toBe(false);
    expect(canVoid({ ...fresh, status: "voided" }, { id: "c3", role: "owner" })).toBe(false);
  });
});

describe("refundAvailability", () => {
  it("needs a till on this device", () => {
    expect(refundAvailability(order, null)).toBe("no-till");
    expect(refundAvailability(order, till)).toBe("ok");
  });
  it("has nothing to refund on a voided or fully refunded sale", () => {
    expect(refundAvailability({ ...fresh, status: "voided" }, till)).toBe("nothing");
    const all = {
      ...order.refunds[0],
      refund_items: [
        { order_item_id: "i1", quantity: 3, restock: true, amount: 990 },
        { order_item_id: "i2", quantity: 1, restock: true, amount: 330 },
      ],
    };
    expect(refundAvailability({ ...order, status: "refunded", refunds: [all] }, till)).toBe("nothing");
  });
});

describe("pickReceiptMatch", () => {
  const matches = [
    { id: "other-new", register_id: "r2", created_at: "2026-10-14T12:00:00Z" },
    { id: "mine", register_id: "r1", created_at: "2026-10-14T09:00:00Z" },
  ];
  it("prefers the sale from this till's register", () => {
    expect(pickReceiptMatch(matches, "r1")).toBe("mine");
  });
  it("falls back to the newest sale", () => {
    expect(pickReceiptMatch(matches, "r9")).toBe("other-new");
    expect(pickReceiptMatch(matches, null)).toBe("other-new");
  });
  it("finds nothing in an empty list", () => {
    expect(pickReceiptMatch([], "r1")).toBeNull();
  });
});
