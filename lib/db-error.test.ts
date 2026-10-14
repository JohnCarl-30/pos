import { describe, expect, it } from "vitest";
import { friendlyDbError } from "./db-error";

describe("friendlyDbError", () => {
  it("explains duplicates", () => {
    expect(friendlyDbError({ code: "23505" })).toBe("That name is already in use. Pick another.");
  });
  it("explains permission denials", () => {
    expect(friendlyDbError({ code: "42501" })).toBe("You don't have access to this.");
  });
  it("falls back to a generic message", () => {
    expect(friendlyDbError({ code: "XX000" })).toBe("Something went wrong. Try again.");
    expect(friendlyDbError(null)).toBe("Something went wrong. Try again.");
  });
});
