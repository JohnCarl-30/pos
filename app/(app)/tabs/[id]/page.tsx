import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TabScreen from "@/components/tabs/tab-screen";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { loadAreas, loadOpenTabs } from "@/lib/tables/queries";
import { loadTab } from "@/lib/tabs/queries";

export const metadata: Metadata = { title: "Tab" };

export default async function TabPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  const { id } = await params;
  const supabase = await createClient();
  const tab = await loadTab(supabase, id);
  if (!tab || !store || tab.storeId !== store.id) notFound();

  const [products, categories, areas, { data: storeRow }] = await Promise.all([
    loadRegisterCatalog(supabase, store.id),
    loadCategories(supabase),
    loadAreas(supabase, store.id),
    supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle(),
  ]);
  const open = await loadOpenTabs(supabase, store.id, [], store.pricesIncludeTax);
  const taken = new Set(open.map((entry) => entry.tableId));
  const freeTables = areas
    .filter((area) => area.active)
    .flatMap((area) => area.tables.filter((table) => table.active && !taken.has(table.id)).map((table) => ({ id: table.id, name: table.name, areaName: area.name })));

  return (
    <TabScreen
      tab={tab}
      currency={store.currency}
      timeZone={storeRow?.timezone ?? "UTC"}
      pricesIncludeTax={store.pricesIncludeTax}
      products={products}
      categories={categories.map((entry) => ({ id: entry.id, name: entry.name }))}
      freeTables={freeTables}
    />
  );
}
