import { describe, expect, it } from "vitest";
import { filterProductRows, formatPriceRange, matchProductRows, parseProductFilters, toProductRows, type ProductQueryRow } from "./list";

const store = "s1";
const data: ProductQueryRow[] = [
  {
    id: "p1", name: "Latte", active: true, category: { id: "c1", name: "Coffee" },
    product_variants: [
      { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: 420, active: true, stock_levels: [{ store_id: "s1", quantity: 3, track: true, low_stock_at: 5 }] },
      { id: "v2", name: "Large", sku: "LAT-L", barcode: null, price: 520, active: true, stock_levels: [{ store_id: "s1", quantity: 10, track: true, low_stock_at: null }] },
    ],
  },
  {
    id: "p2", name: "Espresso", active: true, category: null,
    product_variants: [{ id: "v3", name: "Default", sku: "ESP", barcode: null, price: 300, active: true, stock_levels: [{ store_id: "s1", quantity: 0, track: false, low_stock_at: null }] }],
  },
  { id: "p3", name: "Old Muffin", active: false, category: null, product_variants: [] },
];

describe("toProductRows", () => {
  it("summarises variants, prices and tracked stock for the store", () => {
    const rows = toProductRows(data, store);
    expect(rows[0]).toMatchObject({ variantCount: 2, minPrice: 420, maxPrice: 520, trackedStock: 13, lowStock: true, categoryName: "Coffee" });
    expect(rows[1]).toMatchObject({ trackedStock: null, lowStock: false });
  });
});

describe("filterProductRows", () => {
  const rows = toProductRows(data, store);
  it("hides archived products by default", () => {
    expect(filterProductRows(rows, parseProductFilters({})).rows.map((row) => row.id)).toEqual(["p2", "p1"]);
  });
  it("searches name, SKU and barcode", () => {
    expect(filterProductRows(rows, parseProductFilters({ q: "111" })).rows.map((row) => row.id)).toEqual(["p1"]);
    expect(filterProductRows(rows, parseProductFilters({ q: "esp" })).rows.map((row) => row.id)).toEqual(["p2"]);
  });
  it("filters low stock, archived and category", () => {
    expect(filterProductRows(rows, parseProductFilters({ view: "low" })).rows.map((row) => row.id)).toEqual(["p1"]);
    expect(filterProductRows(rows, parseProductFilters({ view: "archived" })).rows.map((row) => row.id)).toEqual(["p3"]);
    expect(filterProductRows(rows, parseProductFilters({ category: "c1" })).rows.map((row) => row.id)).toEqual(["p1"]);
  });
  it("paginates 50 per page and clamps bad pages", () => {
    const many = Array.from({ length: 120 }, (_, index) => ({ ...rows[1], id: `x${index}`, name: `Item ${String(index).padStart(3, "0")}` }));
    const page3 = filterProductRows(many, parseProductFilters({ page: "3" }));
    expect(page3).toMatchObject({ total: 120, pages: 3 });
    expect(page3.rows).toHaveLength(20);
    expect(filterProductRows(many, parseProductFilters({ page: "99" })).rows).toHaveLength(20);
    expect(parseProductFilters({ page: "abc", view: "weird" })).toEqual({ q: "", category: "", view: "active", page: 1 });
  });
});

describe("formatPriceRange", () => {
  it("shows one price or a range", () => {
    const rows = toProductRows(data, store);
    expect(formatPriceRange(rows[0], "USD")).toBe("$4.20 – $5.20");
    expect(formatPriceRange(rows[1], "USD")).toBe("$3.00");
    expect(formatPriceRange(rows[2], "USD")).toBe("—");
  });
});

describe("matchProductRows", () => {
  it("returns every match without paging", () => {
    const rows = toProductRows(data, store);
    const many = Array.from({ length: 70 }, (_, index) => ({ ...rows[1], id: `m${index}`, name: `M ${String(index).padStart(2, "0")}` }));
    expect(matchProductRows(many, parseProductFilters({}))).toHaveLength(70);
  });
});
