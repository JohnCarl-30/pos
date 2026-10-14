import { describe, expect, it } from "vitest";
import { buildExportRows, type ExportQueryRow } from "./export";

const data: ExportQueryRow[] = [
  {
    id: "p1", name: "Latte", category: { name: "Coffee" }, tax_class: { name: "Standard" },
    product_variants: [
      { name: "Small", sku: "LAT-S", barcode: "111", price: 420, cost: 110, active: true, sort_order: 0, stock_levels: [{ store_id: "s1", quantity: 7, track: true }, { store_id: "s2", quantity: 1, track: true }] },
      { name: "Old", sku: "LAT-O", barcode: null, price: 400, cost: null, active: false, sort_order: 2, stock_levels: [] },
      { name: "Large", sku: "LAT-L", barcode: null, price: 520, cost: null, active: true, sort_order: 1, stock_levels: [{ store_id: "s1", quantity: 0, track: false }] },
    ],
  },
  { id: "p2", name: "=Hack", category: null, tax_class: { name: "Exempt" }, product_variants: [{ name: "Default", sku: "H", barcode: null, price: 100, cost: null, active: true, sort_order: 0, stock_levels: [] }] },
];

describe("buildExportRows", () => {
  it("writes one row per active variant in import column order", () => {
    expect(buildExportRows(data, "s1", "USD", new Set(["p1"]))).toEqual([
      ["product", "category", "variant", "sku", "barcode", "price", "cost", "tax_class", "track", "stock"],
      ["Latte", "Coffee", "Small", "LAT-S", "111", "4.20", "1.10", "Standard", "yes", 7],
      ["Latte", "Coffee", "Large", "LAT-L", "", "5.20", "", "Standard", "no", ""],
    ]);
  });
  it("keeps only the requested products", () => {
    expect(buildExportRows(data, "s1", "USD", new Set(["p2"]))).toHaveLength(2);
  });
});
