import { describe, expect, it } from "vitest";
import { parseStockAction, parseStockSettings } from "./stock-form";

const variantId = "00000000-0000-4000-8000-000000000001";
const storeId = "00000000-0000-4000-8000-000000000002";

describe("parseStockAction", () => {
  it("parses receive, count, correction and transfer", () => {
    expect(parseStockAction({ kind: "received", variantId, quantity: "10", note: "" })).toEqual({ ok: true, action: { kind: "received", variantId, quantity: 10, note: null } });
    expect(parseStockAction({ kind: "counted", variantId, counted: "0", note: "Year end" })).toEqual({ ok: true, action: { kind: "counted", variantId, counted: 0, note: "Year end" } });
    expect(parseStockAction({ kind: "correction", variantId, change: "-2", note: "Typo" })).toEqual({ ok: true, action: { kind: "correction", variantId, change: -2, note: "Typo" } });
    expect(parseStockAction({ kind: "transfer", variantId, toStoreId: storeId, quantity: "3", note: "" })).toEqual({ ok: true, action: { kind: "transfer", variantId, toStoreId: storeId, quantity: 3, note: null } });
  });

  it("rejects bad quantities and a correction without a reason", () => {
    expect(parseStockAction({ kind: "received", variantId, quantity: "0", note: "" })).toEqual({ ok: false, fieldErrors: { quantity: "Enter a whole number above 0" } });
    expect(parseStockAction({ kind: "damaged", variantId, quantity: "1.5", note: "" })).toEqual({ ok: false, fieldErrors: { quantity: "Enter a whole number above 0" } });
    expect(parseStockAction({ kind: "counted", variantId, counted: "-1", note: "" })).toEqual({ ok: false, fieldErrors: { counted: "Enter a whole number of 0 or more" } });
    expect(parseStockAction({ kind: "correction", variantId, change: "0", note: "" })).toEqual({
      ok: false,
      fieldErrors: { change: "Enter a change like 3 or -2", note: "Say why you're correcting the count" },
    });
  });
});

describe("parseStockSettings", () => {
  it("parses tracking and an optional low-stock level", () => {
    expect(parseStockSettings({ variantId, track: "on", lowStockAt: "5" })).toEqual({ ok: true, variantId, track: true, lowStockAt: 5 });
    expect(parseStockSettings({ variantId, lowStockAt: "" })).toEqual({ ok: true, variantId, track: false, lowStockAt: null });
    expect(parseStockSettings({ variantId, track: "on", lowStockAt: "x" })).toEqual({ ok: false, fieldErrors: { lowStockAt: "Enter a whole number of 0 or more, or leave it empty" } });
  });
});
