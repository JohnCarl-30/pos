import { describe, expect, it } from "vitest";
import { refundSchema } from "./refund-schema";

const valid = {
  orderId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  lines: [{ orderItemId: "00000000-0000-4000-8000-000000000003", quantity: 1, restock: true }],
  payments: [{ method: "card" as const, amount: 325, reference: null }],
  approvalId: null,
  reason: "changed_mind" as const,
  note: "",
};

describe("refundSchema", () => {
  it("accepts a normal refund", () => {
    expect(refundSchema.safeParse(valid).success).toBe(true);
  });
  it("needs a note when the reason is other", () => {
    const result = refundSchema.safeParse({ ...valid, reason: "other", note: "  " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["note"]);
  });
  it("rejects a zero payment and a zero quantity", () => {
    expect(refundSchema.safeParse({ ...valid, payments: [{ method: "cash", amount: 0 }] }).success).toBe(false);
    expect(refundSchema.safeParse({ ...valid, lines: [{ ...valid.lines[0], quantity: 0 }] }).success).toBe(false);
  });
});
