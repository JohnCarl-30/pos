import { describe, expect, it } from "vitest";
import type { RegisterProduct } from "@/lib/register/cart";
import { clampPick, leftToPay, lineChoices, lineUnitPrice, partsFrom, pickAll, setPick, tabCartLines, tabLabel, tabTotal, toTabLine, unsentCount, type TabLine } from "./lines";

const latte: RegisterProduct = {
  id: "p-latte",
  name: "Latte",
  categoryId: "c1",
  kitchen: true,
  modifierGroups: [{ id: "g-milk", name: "Milk", min: 1, max: 1, options: [{ id: "o-oat", name: "Oat", priceDelta: 50 }] }],
  variants: [{ id: "v-latte", name: "Default", sku: "LAT", barcode: null, price: 420, rateBps: 1000, track: false, quantity: 0 }],
};
const beer: RegisterProduct = {
  id: "p-beer",
  name: "Beer",
  categoryId: null,
  kitchen: false,
  modifierGroups: [],
  variants: [{ id: "v-beer", name: "Default", sku: "BEER", barcode: null, price: 600, rateBps: 1000, track: false, quantity: 0 }],
};

function line(patch: Partial<TabLine>): TabLine {
  return { id: "l1", variantId: "v-beer", optionIds: [], name: "Beer", quantity: 3, paidQuantity: 0, note: null, sentAt: "2026-10-16T10:00:00Z", voidedAt: null, voidReason: null, ...patch };
}

describe("tab lines", () => {
  it("maps a database row", () => {
    expect(
      toTabLine({ id: "l1", variant_id: "v-beer", option_ids: ["o"], name: "Beer", quantity: 2, paid_quantity: 1, note: "cold", sent_at: null, voided_at: null, void_reason: null }),
    ).toEqual({ id: "l1", variantId: "v-beer", optionIds: ["o"], name: "Beer", quantity: 2, paidQuantity: 1, note: "cold", sentAt: null, voidedAt: null, voidReason: null });
  });

  it("knows what's left to pay", () => {
    expect(leftToPay(line({ quantity: 3, paidQuantity: 1 }))).toBe(2);
    expect(leftToPay(line({ voidedAt: "2026-10-16T10:05:00Z" }))).toBe(0);
  });

  it("picks everything left and clamps a pick", () => {
    const lines = [line({ id: "a", paidQuantity: 1 }), line({ id: "b", voidedAt: "x", voidReason: "spilled" }), line({ id: "c", quantity: 1, paidQuantity: 1 })];
    expect(pickAll(lines)).toEqual({ a: 2 });
    expect(setPick({ a: 2 }, lines[0], 5)).toEqual({ a: 2 });
    expect(setPick({ a: 2 }, lines[0], 0)).toEqual({});
  });

  it("turns a pick into pay_tab parts with line discounts", () => {
    expect(partsFrom({ a: 2, b: 1 }, { b: { bps: 1000 } })).toEqual([
      { tabItemId: "a", quantity: 2, discountBps: null, discountAmount: null },
      { tabItemId: "b", quantity: 1, discountBps: 1000, discountAmount: null },
    ]);
  });

  it("builds cart lines from the current catalog price, keyed by tab line", () => {
    const lines = [line({ id: "a", variantId: "v-latte", optionIds: ["o-oat"], name: "Latte", quantity: 2 }), line({ id: "b" }), line({ id: "gone", variantId: null, name: "Old pie" })];
    const result = tabCartLines(lines, [latte, beer], { a: 1, b: 3, gone: 1 }, {});
    expect(result.lines.map((entry) => [entry.key, entry.price, entry.quantity, entry.modifierLabel])).toEqual([
      ["a", 470, 1, "Oat"],
      ["b", 600, 3, ""],
    ]);
    expect(result.missing).toEqual(["Old pie"]);
  });

  it("follows a price change", () => {
    const repriced = { ...beer, variants: [{ ...beer.variants[0], price: 650 }] };
    expect(tabCartLines([line({ id: "b", quantity: 1 })], [repriced], { b: 1 }, {}).lines[0].price).toBe(650);
  });

  it("totals what's left on the tab", () => {
    expect(tabTotal([line({ id: "b", quantity: 3, paidQuantity: 1 })], [beer], false)).toBe(1320);
    expect(tabTotal([], [beer], false)).toBe(0);
  });

  it("labels a tab", () => {
    expect(tabLabel("P1", null)).toBe("P1");
    expect(tabLabel(null, "Sam")).toBe("Sam");
    expect(tabLabel("P1", "Sam")).toBe("P1 · Sam");
  });
});

describe("showing a tab line", () => {
  it("names its choices and prices it from the catalog", () => {
    const latteLine = line({ id: "a", variantId: "v-latte", optionIds: ["o-oat"], name: "Latte", quantity: 2 });
    expect(lineChoices(latteLine, [latte, beer])).toBe("Oat");
    expect(lineUnitPrice(latteLine, [latte, beer])).toBe(470);
    expect(lineUnitPrice(line({ variantId: null }), [latte, beer])).toBeNull();
  });
  it("counts unsent lines", () => {
    expect(unsentCount([line({ sentAt: null, quantity: 2 }), line({ sentAt: null, quantity: 1 }), line({})])).toBe(3);
  });
});

describe("clampPick", () => {
  it("drops what was paid since the pick was made", () => {
    const lines = [line({ id: "a", quantity: 3, paidQuantity: 2 }), line({ id: "b", voidedAt: "x", voidReason: "spilled" })];
    expect(clampPick({ a: 3, b: 1, gone: 2 }, lines)).toEqual({ a: 1 });
  });
});
