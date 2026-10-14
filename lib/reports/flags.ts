import type { StaffReportRow } from "./types";

export type StaffFlag = { rule: "voids" | "refunds" | "cash-void"; label: string };

function percent(value: number): string {
  return (value * 100).toFixed(1);
}

export function staffFlags(row: StaffReportRow): StaffFlag[] {
  const flags: StaffFlag[] = [];
  const voidShare = row.void_count / Math.max(1, row.sales_count + row.void_count);
  if (row.void_count >= 2 && voidShare > 0.03) flags.push({ rule: "voids", label: `Voids ${row.void_count} (${percent(voidShare)}%)` });
  if (row.refund_count >= 2) {
    if (row.sales_total <= 0 && row.refunds_total > 0) flags.push({ rule: "refunds", label: "Refunds with no sales" });
    else if (row.sales_total > 0 && row.refunds_total / row.sales_total > 0.05) {
      flags.push({ rule: "refunds", label: `Refunds ${percent(row.refunds_total / row.sales_total)}% of sales` });
    }
  }
  if (row.cash_void_count >= 1) {
    flags.push({ rule: "cash-void", label: row.cash_void_count === 1 ? "Voided a cash sale" : `Voided ${row.cash_void_count} cash sales` });
  }
  return flags;
}
