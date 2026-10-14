import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff, getCurrentStore } from "@/lib/auth/staff";
import { roleAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { buildExportRows, type ExportQueryRow } from "@/lib/catalog/export";
import { matchProductRows, parseProductFilters } from "@/lib/catalog/list";
import { EXPORT_SELECT, loadProductRows } from "@/lib/catalog/queries";

export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || !roleAtLeast(staff.role, "manager")) return new NextResponse("Not found", { status: 404 });
  const store = await getCurrentStore(staff);
  if (!store) return new NextResponse("Not found", { status: 404 });

  const filters = parseProductFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const rows = await loadProductRows(supabase, store.id);
  const productIds = new Set(matchProductRows(rows, filters).map((row) => row.id));
  const { data, error } = await supabase.from("products").select(EXPORT_SELECT).order("name");
  if (error) throw error;

  const csv = toCsv(buildExportRows((data ?? []) as unknown as ExportQueryRow[], store.id, store.currency, productIds));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
