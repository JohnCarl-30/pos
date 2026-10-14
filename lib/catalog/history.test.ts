import { describe, expect, it } from "vitest";
import { STOCK_REASON_LABELS, dayRange, formatChange, parseHistoryFilters, withRunningQuantity } from "./history";

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

describe("formatChange", () => {
  it("signs changes with a real minus sign", () => {
    expect(formatChange(10)).toBe("+10");
    expect(formatChange(-3)).toBe("\u22123");
  });
});

describe("STOCK_REASON_LABELS", () => {
  it("has a label for every reason", () => {
    expect(Object.keys(STOCK_REASON_LABELS).sort()).toEqual(["correction", "counted", "damaged", "received", "returned", "sold", "transfer_in", "transfer_out"]);
  });
});

describe("parseHistoryFilters", () => {
  it("keeps valid values and drops bad ones", () => {
    expect(parseHistoryFilters({ q: " latte ", reason: "received", from: "2026-10-01", to: "2026-10-14", page: "2" })).toEqual({ q: "latte", reason: "received", from: "2026-10-01", to: "2026-10-14", page: 2 });
    expect(parseHistoryFilters({ reason: "stolen", from: "yesterday", page: "-1" })).toEqual({ q: "", reason: "", from: "", to: "", page: 1 });
  });
});

describe("dayRange", () => {
  it("makes the end date inclusive", () => {
    expect(dayRange("2026-10-01", "2026-10-14")).toEqual({ gte: "2026-10-01T00:00:00.000Z", lt: "2026-10-15T00:00:00.000Z" });
    expect(dayRange("", "")).toEqual({});
  });
});
