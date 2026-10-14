import type { ReportRange } from "./range";

export type ReportTab = "summary" | "products" | "staff" | "cashups";

const TABS: ReportTab[] = ["summary", "products", "staff", "cashups"];

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseReportTab(params: Record<string, string | string[] | undefined>): ReportTab {
  const tab = first(params.tab);
  return (TABS as string[]).includes(tab) ? (tab as ReportTab) : "summary";
}

export function parseProductSort(params: Record<string, string | string[] | undefined>): "revenue" | "units" {
  return first(params.sort) === "units" ? "units" : "revenue";
}

export function parseOnlyOff(params: Record<string, string | string[] | undefined>): boolean {
  return first(params.only) === "off";
}

function rangeParams(range: ReportRange): Record<string, string> {
  return range.preset === "custom" ? { range: "custom", from: range.fromDate, to: range.toDate } : { range: range.preset };
}

export function reportHref(tab: ReportTab, range: ReportRange, extra: Record<string, string> = {}): string {
  return `/reports?${new URLSearchParams({ tab, ...rangeParams(range), ...extra }).toString()}`;
}

export function exportHref(tab: ReportTab, range: ReportRange): string {
  return `/reports/export?${new URLSearchParams({ tab, ...rangeParams(range) }).toString()}`;
}
