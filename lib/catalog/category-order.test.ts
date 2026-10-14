import { describe, expect, it } from "vitest";
import { moveInOrder } from "./category-order";

describe("moveInOrder", () => {
  it("moves an item up or down", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("leaves the order alone at the edges or for unknown ids", () => {
    expect(moveInOrder(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
});
