import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { toProductRows, type ProductQueryRow, type ProductRow } from "./list";
import type { ExportQueryRow } from "./export";

type Client = SupabaseClient<Database>;

export const PRODUCT_LIST_SELECT =
  "id, name, active, category:categories(id, name), product_variants(id, name, sku, barcode, price, active, stock_levels(store_id, quantity, track, low_stock_at))";

export const EXPORT_SELECT =
  "id, name, category:categories(name), tax_class:tax_classes(name), product_variants(name, sku, barcode, price, cost, active, sort_order, stock_levels(store_id, quantity, track))";

export async function loadProductRows(supabase: Client, storeId: string): Promise<ProductRow[]> {
  const data = await fetchAll((from, to) => supabase.from("products").select(PRODUCT_LIST_SELECT).order("name").order("id").range(from, to));
  return toProductRows(data as unknown as ProductQueryRow[], storeId);
}

export async function loadExportRows(supabase: Client): Promise<ExportQueryRow[]> {
  const data = await fetchAll((from, to) => supabase.from("products").select(EXPORT_SELECT).order("name").order("id").range(from, to));
  return data as unknown as ExportQueryRow[];
}

export async function loadCategories(supabase: Client) {
  return fetchAll((from, to) => supabase.from("categories").select("id, name, sort_order").order("sort_order").order("name").order("id").range(from, to));
}
