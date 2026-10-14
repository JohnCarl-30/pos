import type { CsvCell } from "@/lib/csv";
import { formatAmount } from "@/lib/money";
import { staffFlags } from "./flags";
import type { CashupRow, ProductReportRow, StaffReportRow, SummaryReport } from "./types";

export function localDateTime(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function summaryCsv(summary: SummaryReport, currency: string): CsvCell[][] {
  const amount = (minor: number) => formatAmount(minor, currency);
  return [
    ["metric", "value"],
    ["sales_count", summary.sales_count],
    ["gross", amount(summary.gross)],
    ["discounts", amount(summary.discounts)],
    ["tax", amount(summary.tax)],
    ["sales_total", amount(summary.sales_total)],
    ["refund_count", summary.refund_count],
    ["refunds_total", amount(summary.refunds_total)],
    ["refund_tax", amount(summary.refund_tax)],
    ["net_sales", amount(summary.net_sales)],
    ["net_tax", amount(summary.net_tax)],
    ["average_sale", amount(summary.average_sale)],
    ["void_count", summary.void_count],
    ["void_total", amount(summary.void_total)],
    ["cash", amount(summary.methods.cash)],
    ["card", amount(summary.methods.card)],
    ["other", amount(summary.methods.other)],
  ];
}

export function productsCsv(rows: ProductReportRow[], currency: string): CsvCell[][] {
  const amount = (minor: number) => formatAmount(minor, currency);
  return [
    ["item", "category", "units_sold", "units_refunded", "net_units", "revenue", "refunded", "net_revenue"],
    ...rows.map((row) => [row.name, row.category ?? "", row.units_sold, row.units_refunded, row.net_units, amount(row.revenue), amount(row.refunded), amount(row.net_revenue)]),
  ];
}

export function staffCsv(rows: StaffReportRow[], currency: string): CsvCell[][] {
  const amount = (minor: number) => formatAmount(minor, currency);
  return [
    ["staff", "sales", "sales_value", "refunds", "refunds_value", "voids", "voids_value", "cash_voids", "discounts", "flags"],
    ...rows.map((row) => [
      row.name,
      row.sales_count,
      amount(row.sales_total),
      row.refund_count,
      amount(row.refunds_total),
      row.void_count,
      amount(row.void_total),
      row.cash_void_count,
      amount(row.discounts),
      staffFlags(row).map((flag) => flag.label).join("; "),
    ]),
  ];
}

export function cashupsCsv(rows: CashupRow[], currency: string, timeZone: string): CsvCell[][] {
  const amount = (minor: number) => formatAmount(minor, currency);
  return [
    ["register", "opened_at", "closed_at", "opened_by", "closed_by", "float", "cash_sales", "cash_refunds", "expected", "counted", "difference", "note"],
    ...rows.map((row) => [
      row.register,
      localDateTime(row.opened_at, timeZone),
      localDateTime(row.closed_at, timeZone),
      row.opened_by ?? "",
      row.closed_by ?? "",
      amount(row.opening_cash),
      amount(row.cash_sales),
      amount(row.cash_refunds),
      amount(row.expected_cash),
      row.counted_cash === null ? "" : amount(row.counted_cash),
      amount(row.difference),
      row.close_note ?? "",
    ]),
  ];
}
