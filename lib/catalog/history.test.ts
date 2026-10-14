import { describe, expect, it } from "vitest";
import { withRunningQuantity } from "./history";

describe("withRunningQuantity", () => {
  it("works out the quantity after each movement, newest first", () => {
    expect(withRunningQuantity([{ quantity_change: -3 }, { quantity_change: 10 }], 7)).toEqual([
      { quantity_change: -3, resulting: 7 },
      { quantity_change: 10, resulting: 10 },
    ]);
  });
  it("handles an empty history", () => {
    expect(withRunningQuantity([], 4)).toEqual([]);
  });
});
