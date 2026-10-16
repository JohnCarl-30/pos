import { describe, expect, it } from "vitest";
import { tabDbError } from "./errors";

describe("tabDbError", () => {
  it("writes database messages as sentences", () => {
    expect(tabDbError({ code: "22023", message: "Beer has already been sent; void it instead" })).toBe("Beer has already been sent. Void it instead.");
    expect(tabDbError({ code: "22023", message: "only 2 of Beer are left to pay" })).toBe("Only 2 of Beer are left to pay.");
    expect(tabDbError({ code: "22023", message: "this tab is closed" })).toBe("This tab is closed.");
  });
  it("explains a lost race for a table", () => {
    expect(tabDbError({ code: "23505", message: 'duplicate key value violates unique constraint "tabs_one_open_per_table_idx"' })).toBe("That table already has an open tab.");
  });
});
