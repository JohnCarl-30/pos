import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff, getCurrentStore } from "@/lib/auth/staff";
import { roleAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { toCsv, type CsvCell } from "@/lib/csv";
import { resolveRange } from "@/lib/reports/range";
import { parseReportTab } from "@/lib/reports/params";
import { sortProducts } from "@/lib/reports/shape";
import { cashupsCsv, productsCsv, staffCsv, summaryCsv } from "@/lib/reports/csv";
import { loadCashups, loadProducts, loadStaff, loadSummary } from "@/lib/reports/queries";

export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || !roleAtLeast(staff.role, "manager")) return new NextResponse("Not found", { status: 404 });
  const store = await getCurrentStore(staff);
  if (!store) return new NextResponse("Not found", { status: 404 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const supabase = await createClient();
  const { data: storeRow } = await supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle();
  const timeZone = storeRow?.timezone ?? "UTC";
  const { range, error } = resolveRange(params, timeZone, new Date());
  if (error) return new NextResponse(error, { status: 400 });
  const tab = parseReportTab(params);

  let rows: CsvCell[][];
  if (tab === "products") rows = productsCsv(sortProducts(await loadProducts(supabase, store.id, range), "revenue"), store.currency);
  else if (tab === "staff") rows = staffCsv(await loadStaff(supabase, store.id, range), store.currency);
  else if (tab === "cashups") rows = cashupsCsv(await loadCashups(supabase, store.id, range), store.currency, timeZone);
  else rows = summaryCsv(await loadSummary(supabase, store.id, range), store.currency);

  return new NextResponse(`﻿${toCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tab}-${range.fromDate}-to-${range.toDate}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
