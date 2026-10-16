import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { tabLabel, toTabLine, TAB_LINE_SELECT, type TabLine, type TabLineRow } from "./lines";

export type TabView = {
  id: string;
  storeId: string;
  status: "open" | "paid" | "cancelled";
  tableId: string | null;
  name: string | null;
  guests: number | null;
  label: string;
  openedAt: string;
  billPrintedAt: string | null;
  lines: TabLine[];
  sales: { id: string; receiptNumber: number; total: number; tip: number; status: string }[];
};

type TabRow = {
  id: string;
  store_id: string;
  status: TabView["status"];
  table_id: string | null;
  name: string | null;
  guests: number | null;
  opened_at: string;
  bill_printed_at: string | null;
  table: { name: string } | null;
  tab_items: TabLineRow[];
  orders: { id: string; receipt_number: number; total: number; tip: number; status: string }[];
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadTab(supabase: SupabaseClient<Database>, tabId: string): Promise<TabView | null> {
  if (!GUID.test(tabId)) return null;
  const { data } = await supabase
    .from("tabs")
    .select(`id, store_id, status, table_id, name, guests, opened_at, bill_printed_at, table:dining_tables(name), tab_items(${TAB_LINE_SELECT}), orders(id, receipt_number, total, tip, status)`)
    .eq("id", tabId)
    .order("added_at", { referencedTable: "tab_items" })
    .order("receipt_number", { referencedTable: "orders" })
    .maybeSingle();
  const row = data as unknown as TabRow | null;
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    status: row.status,
    tableId: row.table_id,
    name: row.name,
    guests: row.guests,
    label: tabLabel(row.table?.name ?? null, row.name),
    openedAt: row.opened_at,
    billPrintedAt: row.bill_printed_at,
    lines: row.tab_items.map(toTabLine),
    sales: row.orders.map((order) => ({ id: order.id, receiptNumber: order.receipt_number, total: order.total, tip: order.tip, status: order.status })),
  };
}
