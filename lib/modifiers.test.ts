import { describe, expect, it } from "vitest";
import { checkSelection, groupRule, selectionDelta, selectionFromIds, selectionIds, selectionKey, selectionLabel, toggleOption, type ModifierGroup } from "./modifiers";

const milk: ModifierGroup = { id: "g1", name: "Milk", min: 1, max: 1, options: [{ id: "o1", name: "Whole", priceDelta: 0 }, { id: "o2", name: "Oat", priceDelta: 50 }] };
const extras: ModifierGroup = { id: "g2", name: "Extras", min: 0, max: 2, options: [{ id: "o3", name: "Shot", priceDelta: 80 }, { id: "o4", name: "Syrup", priceDelta: 40 }] };
const groups = [milk, extras];

describe("checkSelection", () => {
  it("asks for required groups and caps choices", () => {
    expect(checkSelection(groups, {}, "Latte")).toBe("Pick Milk for Latte");
    expect(checkSelection(groups, { g1: ["o2"], g2: ["o3", "o4"] }, "Latte")).toBeNull();
    expect(checkSelection([milk, { ...extras, max: 1 }], { g1: ["o1"], g2: ["o3", "o4"] }, "Latte")).toBe("Pick up to 1 Extras for Latte");
  });
  it("ignores ids that are no longer options", () => {
    expect(checkSelection(groups, { g1: ["o1"], g2: ["gone"] }, "Latte")).toBeNull();
  });
});

describe("selection helpers", () => {
  const selection = { g1: ["o2"], g2: ["o3"] };
  it("prices, labels and lists choices in group order", () => {
    expect(selectionDelta(groups, selection)).toBe(130);
    expect(selectionLabel(groups, selection)).toBe("Oat · Shot");
    expect(selectionIds(groups, selection)).toEqual(["o2", "o3"]);
    expect(selectionKey(["o3", "o2"])).toBe("o2,o3");
    expect(selectionFromIds(groups, ["o3", "o2"])).toEqual({ g1: ["o2"], g2: ["o3"] });
  });
  it("toggles like radio buttons for pick-one groups", () => {
    expect(toggleOption(milk, { g1: ["o1"] }, "o2")).toEqual({ g1: ["o2"] });
    expect(toggleOption(milk, { g1: ["o2"] }, "o2")).toEqual({ g1: [] });
    expect(toggleOption(extras, { g2: ["o3"] }, "o4")).toEqual({ g2: ["o3", "o4"] });
  });
  it("describes group rules", () => {
    expect(groupRule(1, 1)).toBe("Pick 1");
    expect(groupRule(0, 1)).toBe("Optional");
    expect(groupRule(0, 3)).toBe("Up to 3");
    expect(groupRule(1, 2)).toBe("Pick 1–2");
  });
});
