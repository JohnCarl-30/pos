import { describe, expect, it } from "vitest";
import { registerDbError, registerErrorKind } from "./errors";

describe("registerDbError", () => {
  it("explains checkout failures in plain words", () => {
    expect(registerDbError({ code: "P0001", message: "till is closed" })).toBe("This till is closed. Open it again to keep selling.");
    expect(registerDbError({ code: "P0001", message: "discount needs approval" })).toBe("This discount is over your limit. Ask a manager to approve it.");
    expect(registerDbError({ code: "P0002", message: "item not available" })).toBe("An item in the cart is no longer for sale. Remove it and try again.");
    expect(registerDbError({ code: "23505", message: "duplicate key value violates unique constraint \"register_sessions_one_open_idx\"" })).toBe("This till is already open.");
    expect(registerDbError({ code: "22023", message: "payments must add up to the total" })).toBe("Payments must add up to the total.");
    expect(registerDbError({ code: "42501", message: "not allowed" })).toBe("You don't have access to this.");
    expect(registerDbError(null)).toBe("Something went wrong. Try again.");
  });
});

describe("registerErrorKind", () => {
  it("tells an approval rejection and a closed till apart from other errors", () => {
    expect(registerErrorKind({ code: "P0001", message: "discount needs approval" })).toBe("approval");
    expect(registerErrorKind({ code: "P0001", message: "till is closed" })).toBe("closed");
    expect(registerErrorKind({ code: "22023", message: "payments must add up to the total" })).toBeNull();
    expect(registerErrorKind(null)).toBeNull();
  });
});
