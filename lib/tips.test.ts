import { describe, expect, it } from "vitest";
import { TIP_PRESETS, allocateTip, tipFor } from "./tips";

describe("tips", () => {
  it("works out percentage tips half-even", () => {
    expect(tipFor(1375, 1500)).toBe(206);
    expect(tipFor(509, 1500)).toBe(76);
    expect(tipFor(15, 1000)).toBe(2);
    expect(tipFor(5, 1000)).toBe(0);
    expect(TIP_PRESETS.map((preset) => preset.label)).toEqual(["No tip", "10%", "15%", "20%"]);
  });
  it("splits a tip across payments exactly, like the database", () => {
    expect(allocateTip(206, [1000, 581])).toEqual([130, 76]);
    expect(allocateTip(1, [100, 100])).toEqual([1, 0]);
    expect(allocateTip(0, [500])).toEqual([0]);
  });
});
