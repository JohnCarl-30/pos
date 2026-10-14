import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { ReportRange } from "./range";
import type { CashupRow, ProductReportRow, StaffReportRow, SummaryReport, TrendPoint } from "./types";

type Client = SupabaseClient<Database>;

function args(storeId: string, range: ReportRange) {
  return { p_store_id: storeId, p_from: range.from.toISOString(), p_to: range.to.toISOString() };
}

export async function loadSummary(supabase: Client, storeId: string, range: ReportRange): Promise<SummaryReport> {
  const { data, error } = await supabase.rpc("report_summary", args(storeId, range));
  if (error) throw error;
  return data as unknown as SummaryReport;
}

export async function loadTrend(supabase: Client, storeId: string, range: ReportRange): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc("report_trend", { ...args(storeId, range), p_bucket: range.bucket });
  if (error) throw error;
  return (data ?? []) as unknown as TrendPoint[];
}

export async function loadProducts(supabase: Client, storeId: string, range: ReportRange): Promise<ProductReportRow[]> {
  return (await fetchAll((from, to) => supabase.rpc("report_products", args(storeId, range)).range(from, to))) as unknown as ProductReportRow[];
}

export async function loadStaff(supabase: Client, storeId: string, range: ReportRange): Promise<StaffReportRow[]> {
  const { data, error } = await supabase.rpc("report_staff", args(storeId, range));
  if (error) throw error;
  return (data ?? []) as unknown as StaffReportRow[];
}

export async function loadCashups(supabase: Client, storeId: string, range: ReportRange): Promise<CashupRow[]> {
  return (await fetchAll((from, to) => supabase.rpc("report_cashups", args(storeId, range)).range(from, to))) as unknown as CashupRow[];
}
