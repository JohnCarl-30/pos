import { describe, expect, it } from "vitest";
import { areaSchema, openTabSchema, payTabSchema, reasonSchema, tableSchema } from "./schemas";

const ID = "00000000-0000-0000-0000-000000000001";

describe("tab schemas", () => {
  it("checks areas and tables", () => {
    expect(areaSchema.safeParse({ id: "", name: " Patio " }).data).toEqual({ id: undefined, name: "Patio" });
    expect(areaSchema.safeParse({ name: "" }).success).toBe(false);
    expect(tableSchema.safeParse({ areaId: ID, name: "P1", seats: "4" }).data).toEqual({ id: undefined, areaId: ID, name: "P1", seats: 4 });
    expect(tableSchema.safeParse({ areaId: ID, name: "P1", seats: "0" }).error?.issues[0].message).toBe("Seats must be between 1 and 50");
  });

  it("opens a table tab or a named bar tab", () => {
    expect(openTabSchema.safeParse({ tableId: ID, name: "", guests: "3" }).data).toEqual({ tableId: ID, name: "", guests: 3 });
    expect(openTabSchema.safeParse({ tableId: "", name: "Sam", guests: "" }).data).toEqual({ tableId: null, name: "Sam", guests: null });
    expect(openTabSchema.safeParse({ tableId: "", name: " ", guests: "" }).error?.issues[0].message).toBe("Name the bar tab");
  });

  it("needs a reason", () => {
    expect(reasonSchema.safeParse({ reason: "  " }).error?.issues[0].message).toBe("Give a reason");
  });

  it("allows up to 20 payments on a tab part", () => {
    const payments = Array.from({ length: 20 }, () => ({ method: "cash" as const, amount: 1 }));
    const input = { tabId: ID, sessionId: ID, parts: [{ tabItemId: ID, quantity: 1 }], orderDiscount: null, approvalId: null, customerId: null, payments, tip: 0 };
    expect(payTabSchema.safeParse(input).success).toBe(true);
    expect(payTabSchema.safeParse({ ...input, parts: [] }).success).toBe(false);
  });
});
