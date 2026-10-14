import { describe, expect, it } from "vitest";
import { categoryShares, differenceLabel, sortProducts, tickLabel, trendBars } from "./shape";
import type { ProductReportRow } from "./types";

const product = (name: string, category: string | null, units: number, revenue: number): ProductReportRow => ({
  variant_id: null,
  name,
  category,
  units_sold: units,
  units_refunded: 0,
  net_units: units,
  revenue,
  refunded: 0,
  net_revenue: revenue,
});

describe("categoryShares", () => {
  it("adds up net revenue per category and shares it out", () => {
    expect(categoryShares([product("Tea", "Drinks", 3, 300), product("Latte", "Drinks", 1, 450), product("Mug", null, 1, 250)])).toEqual([
      { category: "Drinks", netRevenue: 750, share: 75 },
      { category: "Uncategorised", netRevenue: 250, share: 25 },
    ]);
    expect(categoryShares([])).toEqual([]);
  });
});

describe("sortProducts", () => {
  it("sorts by net revenue or by net units", () => {
    const rows = [product("A", null, 5, 100), product("B", null, 1, 900)];
    expect(sortProducts(rows, "revenue").map((row) => row.name)).toEqual(["B", "A"]);
    expect(sortProducts(rows, "units").map((row) => row.name)).toEqual(["A", "B"]);
  });
});

describe("trendBars", () => {
  it("scales bars to the largest day, keeping refunds-only days below the line", () => {
    expect(
      trendBars([
        { bucket: "2026-10-13", sales_count: 1, sales_total: 1000, refunds_total: 0, net_sales: 1000 },
        { bucket: "2026-10-14", sales_count: 0, sales_total: 0, refunds_total: 250, net_sales: -250 },
        { bucket: "2026-10-15", sales_count: 0, sales_total: 0, refunds_total: 0, net_sales: 0 },
      ]),
    ).toEqual([
      { bucket: "2026-10-13", net: 1000, height: 100, negative: false },
      { bucket: "2026-10-14", net: -250, height: 25, negative: true },
      { bucket: "2026-10-15", net: 0, height: 0, negative: false },
    ]);
  });
});

describe("tickLabel", () => {
  it("shortens days and hours", () => {
    expect(tickLabel("2026-10-14", "day")).toBe("Oct 14");
    expect(tickLabel("2026-10-14 09:00", "hour")).toBe("09");
  });
});

describe("differenceLabel", () => {
  it("reads short, over or balanced", () => {
    const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
    expect(differenceLabel(-430, money)).toEqual({ text: "Short $4.30", tone: "short" });
    expect(differenceLabel(710, money)).toEqual({ text: "Over $7.10", tone: "over" });
    expect(differenceLabel(0, money)).toEqual({ text: "Balanced", tone: "balanced" });
  });
});
