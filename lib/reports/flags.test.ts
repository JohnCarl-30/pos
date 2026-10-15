import { describe, expect, it } from "vitest";
import { staffFlags } from "./flags";
import type { StaffReportRow } from "./types";

const base: StaffReportRow = {
  staff_id: "s",
  name: "Casey",
  sales_count: 64,
  sales_total: 100_000,
  refund_count: 0,
  refunds_total: 0,
  void_count: 0,
  void_total: 0,
  cash_void_count: 0,
  discounts: 0,
  tips: 0,
};

describe("staffFlags", () => {
  it("flags voids just over 3%, with at least 2", () => {
    expect(staffFlags({ ...base, void_count: 2 })).toEqual([{ rule: "voids", label: "Voids 2 (3.0%)" }]);
    expect(staffFlags({ ...base, sales_count: 65, void_count: 2 })).toEqual([]);
    expect(staffFlags({ ...base, sales_count: 9, void_count: 1 })).toEqual([]);
  });
  it("flags refunds over 5% of sales value, with at least 2", () => {
    expect(staffFlags({ ...base, refund_count: 2, refunds_total: 5_100 })).toEqual([{ rule: "refunds", label: "Refunds 5.1% of sales" }]);
    expect(staffFlags({ ...base, refund_count: 2, refunds_total: 5_000 })).toEqual([]);
    expect(staffFlags({ ...base, refund_count: 1, refunds_total: 50_000 })).toEqual([]);
    expect(staffFlags({ ...base, sales_count: 0, sales_total: 0, refund_count: 2, refunds_total: 500 })).toEqual([{ rule: "refunds", label: "Refunds with no sales" }]);
  });
  it("flags any voided cash sale", () => {
    expect(staffFlags({ ...base, void_count: 1, cash_void_count: 1 })).toEqual([{ rule: "cash-void", label: "Voided a cash sale" }]);
    expect(staffFlags({ ...base, sales_count: 200, void_count: 2, cash_void_count: 2 })).toEqual([{ rule: "cash-void", label: "Voided 2 cash sales" }]);
  });
});
