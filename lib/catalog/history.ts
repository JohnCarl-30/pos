import type { Database } from "@/lib/supabase/database.types";

export type StockReason = Database["public"]["Enums"]["stock_reason"];

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  received: "Received",
  counted: "Counted",
  damaged: "Damaged",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  sold: "Sold",
  returned: "Returned",
  correction: "Correction",
};

export const HISTORY_PAGE_SIZE = 50;

export type HistoryFilters = { q: string; reason: StockReason | ""; from: string; to: string; page: number };

export function withRunningQuantity<T extends { quantity_change: number }>(newestFirst: T[], current: number): (T & { resulting: number })[] {
  let running = current;
  return newestFirst.map((movement) => {
    const entry = { ...movement, resulting: running };
    running -= movement.quantity_change;
    return entry;
  });
}

export function formatChange(change: number): string {
  return change > 0 ? `+${change}` : `\u2212${Math.abs(change)}`;
}

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function validDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : "";
}

export function parseHistoryFilters(params: Record<string, string | string[] | undefined>): HistoryFilters {
  const reason = single(params.reason);
  const page = Number.parseInt(single(params.page), 10);
  return {
    q: single(params.q).trim(),
    reason: reason in STOCK_REASON_LABELS ? (reason as StockReason) : "",
    from: validDate(single(params.from)),
    to: validDate(single(params.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function dayRange(from: string, to: string): { gte?: string; lt?: string } {
  const range: { gte?: string; lt?: string } = {};
  if (from) range.gte = new Date(`${from}T00:00:00Z`).toISOString();
  if (to) {
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end.toISOString();
  }
  return range;
}
