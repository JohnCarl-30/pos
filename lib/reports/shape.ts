import type { ProductReportRow, TrendPoint } from "./types";

export function categoryShares(rows: ProductReportRow[]): { category: string; netRevenue: number; share: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const category = row.category ?? "Uncategorised";
    totals.set(category, (totals.get(category) ?? 0) + row.net_revenue);
  }
  const positive = [...totals.values()].reduce((sum, value) => sum + Math.max(0, value), 0);
  return [...totals.entries()]
    .map(([category, netRevenue]) => ({ category, netRevenue, share: positive > 0 ? Math.round((Math.max(0, netRevenue) / positive) * 1000) / 10 : 0 }))
    .sort((a, b) => b.netRevenue - a.netRevenue || a.category.localeCompare(b.category));
}

export function sortProducts(rows: ProductReportRow[], sort: "revenue" | "units"): ProductReportRow[] {
  return [...rows].sort((a, b) =>
    sort === "units" ? b.net_units - a.net_units || b.net_revenue - a.net_revenue : b.net_revenue - a.net_revenue || b.net_units - a.net_units,
  );
}

export function trendBars(points: TrendPoint[]): { bucket: string; net: number; height: number; negative: boolean }[] {
  const max = Math.max(0, ...points.map((point) => Math.abs(point.net_sales)));
  return points.map((point) => ({
    bucket: point.bucket,
    net: point.net_sales,
    height: max === 0 ? 0 : Math.round((Math.abs(point.net_sales) / max) * 100),
    negative: point.net_sales < 0,
  }));
}

export function tickLabel(bucket: string, kind: "hour" | "day"): string {
  if (kind === "hour") return bucket.slice(11, 13);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${bucket}T00:00:00Z`));
}

export function differenceLabel(difference: number, money: (minor: number) => string): { text: string; tone: "short" | "over" | "balanced" } {
  if (difference < 0) return { text: `Short ${money(-difference)}`, tone: "short" };
  if (difference > 0) return { text: `Over ${money(difference)}`, tone: "over" };
  return { text: "Balanced", tone: "balanced" };
}
