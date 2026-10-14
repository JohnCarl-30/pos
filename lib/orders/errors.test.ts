import { describe, expect, it } from "vitest";
import { orderDbError, orderErrorKind } from "./errors";

describe("orderDbError", () => {
  it("explains refund and void failures in plain words", () => {
    expect(orderDbError({ code: "22023", message: "only 2 left to refund on Tea" }, "USD")).toBe("Only 2 left to refund on Tea.");
    expect(orderDbError({ code: "22023", message: "card refunds can't be more than 170" }, "USD")).toBe("Card refunds can't be more than $1.70. Use cash for the rest.");
    expect(orderDbError({ code: "P0001", message: "refund needs approval" }, "USD")).toBe("This refund needs a manager's approval.");
    expect(orderDbError({ code: "P0001", message: "till is closed" }, "USD")).toBe("Open a till to give refunds.");
    expect(orderDbError({ code: "P0001", message: "till is closed — refund it instead" }, "USD")).toBe("This sale can't be voided: its till has been closed. Refund it instead.");
    expect(orderDbError({ code: "P0001", message: "sale has refunds" }, "USD")).toBe("This sale has refunds and can't be voided.");
    expect(orderDbError({ code: "42501", message: "you can only void your own sales" }, "USD")).toBe("You can only void your own sales.");
    expect(orderDbError({ code: "22023", message: "payments must add up to the refund" }, "USD")).toBe("Payments must add up to the refund.");
    expect(orderDbError(null, "USD")).toBe("Something went wrong. Try again.");
  });
});

describe("orderErrorKind", () => {
  it("spots an approval rejection and a closed till", () => {
    expect(orderErrorKind({ message: "refund needs approval" })).toBe("approval");
    expect(orderErrorKind({ message: "till is closed" })).toBe("closed");
    expect(orderErrorKind({ message: "till is closed — refund it instead" })).toBeNull();
    expect(orderErrorKind(null)).toBeNull();
  });
});
