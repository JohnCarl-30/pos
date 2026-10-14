import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { toRegisterCatalog, type RegisterCatalogRow, type RegisterProduct } from "./cart";

export async function loadRegisterCatalog(supabase: SupabaseClient<Database>, storeId: string): Promise<RegisterProduct[]> {
  const [rows, rates] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("products")
        .select("id, name, active, category_id, tax_class_id, product_variants(id, name, sku, barcode, price, active, sort_order, stock_levels(store_id, quantity, track))")
        .eq("active", true)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("tax_rates").select("tax_class_id, rate_bps").eq("store_id", storeId).order("id").range(from, to)),
  ]);
  return toRegisterCatalog(rows as unknown as RegisterCatalogRow[], storeId, rates);
}
