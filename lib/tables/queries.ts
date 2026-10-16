import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { RegisterProduct } from "@/lib/register/cart";
import { leftToPay, tabTotal, toTabLine, TAB_LINE_SELECT, type TabLineRow } from "@/lib/tabs/lines";

type Client = SupabaseClient<Database>;

export type DiningTable = { id: string; name: string; seats: number; active: boolean };
export type AreaWithTables = { id: string; name: string; active: boolean; tables: DiningTable[] };
export type FloorTab = {
  id: string;
  tableId: string | null;
  name: string | null;
  guests: number | null;
  openedAt: string;
  openedBy: string;
  billPrinted: boolean;
  total: number;
  itemCount: number;
};

export async function loadAreas(supabase: Client, storeId: string): Promise<AreaWithTables[]> {
  const [{ data: areas }, { data: tables }] = await Promise.all([
    supabase.from("dining_areas").select("id, name, active, sort_order").eq("store_id", storeId).order("sort_order").order("name"),
    supabase.from("dining_tables").select("id, area_id, name, seats, active, sort_order").eq("store_id", storeId).order("sort_order").order("name"),
  ]);
  return (areas ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    active: area.active,
    tables: (tables ?? [])
      .filter((table) => table.area_id === area.id)
      .map((table) => ({ id: table.id, name: table.name, seats: table.seats, active: table.active })),
  }));
}

type OpenTabRow = {
  id: string;
  table_id: string | null;
  name: string | null;
  guests: number | null;
  opened_at: string;
  bill_printed_at: string | null;
  opener: { name: string } | null;
  tab_items: TabLineRow[];
};

export async function loadOpenTabs(supabase: Client, storeId: string, products: RegisterProduct[], pricesIncludeTax: boolean): Promise<FloorTab[]> {
  const { data } = await supabase
    .from("tabs")
    .select(`id, table_id, name, guests, opened_at, bill_printed_at, opener:staff!tabs_opened_by_fkey(name), tab_items(${TAB_LINE_SELECT})`)
    .eq("store_id", storeId)
    .eq("status", "open")
    .order("opened_at");
  return ((data ?? []) as unknown as OpenTabRow[]).map((row) => {
    const lines = row.tab_items.map(toTabLine);
    return {
      id: row.id,
      tableId: row.table_id,
      name: row.name,
      guests: row.guests,
      openedAt: row.opened_at,
      openedBy: row.opener?.name ?? "",
      billPrinted: row.bill_printed_at !== null,
      total: tabTotal(lines, products, pricesIncludeTax),
      itemCount: lines.reduce((sum, line) => sum + leftToPay(line), 0),
    };
  });
}
