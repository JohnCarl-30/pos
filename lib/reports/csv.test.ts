import { describe, expect, it } from "vitest";
import { cashupsCsv, localDateTime, productsCsv, staffCsv, summaryCsv } from "./csv";

describe("report CSVs", () => {
  it("writes the summary as metric,value rows with decimal amounts", () => {
    const rows = summaryCsv(
      {
        sales_count: 2, gross: 1850, discounts: 125, tax: 172, sales_total: 1897, tips: 76, refund_count: 1, refunds_total: 330, refund_tax: 30,
        net_sales: 1567, net_tax: 142, average_sale: 948, void_count: 1, void_total: 330, methods: { cash: 1567, card: 0, other: 0 },
      },
      "USD",
    );
    expect(rows[0]).toEqual(["metric", "value"]);
    expect(rows).toContainEqual(["net_sales", "15.67"]);
    expect(rows).toContainEqual(["tips", "0.76"]);
    expect(rows).toContainEqual(["sales_count", 2]);
    expect(rows).toContainEqual(["cash", "15.67"]);
  });
  it("writes products, staff and cash-ups with fixed headers", () => {
    expect(productsCsv([{ variant_id: null, name: "Tea", category: null, units_sold: 2, units_refunded: 1, net_units: 1, revenue: 660, refunded: 330, net_revenue: 330 }], "USD")).toEqual([
      ["item", "category", "units_sold", "units_refunded", "net_units", "revenue", "refunded", "net_revenue"],
      ["Tea", "", 2, 1, 1, "6.60", "3.30", "3.30"],
    ]);
    expect(
      staffCsv([{ staff_id: "s", name: "Casey", sales_count: 1, sales_total: 1237, refund_count: 0, refunds_total: 0, void_count: 1, void_total: 330, cash_void_count: 1, discounts: 125, tips: 76 }], "USD")[1],
    ).toEqual(["Casey", 1, "12.37", 0, "0.00", 1, "3.30", 1, "1.25", "0.76", "Voided a cash sale"]);
    expect(
      cashupsCsv(
        [{ session_id: "x", register: "Till 2", opened_at: "2026-10-14T01:00:00Z", closed_at: "2026-10-14T13:00:00Z", opened_by: "Manager", closed_by: null, opening_cash: 5000, cash_sales: 660, cash_tips: 76, cash_refunds: 330, expected_cash: 5330, counted_cash: 4900, difference: -430, close_note: null }],
        "USD",
        "Asia/Manila",
      )[1],
    ).toEqual(["Till 2", "2026-10-14 09:00", "2026-10-14 21:00", "Manager", "", "50.00", "6.60", "0.76", "3.30", "53.30", "49.00", "-4.30", ""]);
  });
  it("formats local date-times", () => {
    expect(localDateTime("2026-10-14T16:30:00Z", "Asia/Manila")).toBe("2026-10-15 00:30");
  });
});
