import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Floor from "@/components/tables/floor";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { roleAtLeast } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { loadAreas, loadOpenTabs } from "@/lib/tables/queries";

export const metadata: Metadata = { title: "Tables" };

export default async function TablesPage() {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="tables" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Tables" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }
  const supabase = await createClient();
  const products = await loadRegisterCatalog(supabase, store.id);
  const [areas, tabs] = await Promise.all([loadAreas(supabase, store.id), loadOpenTabs(supabase, store.id, products, store.pricesIncludeTax)]);
  return (
    <Floor
      storeId={store.id}
      currency={store.currency}
      canSetUp={roleAtLeast(staff.role, "manager")}
      areas={areas.filter((area) => area.active).map((area) => ({ ...area, tables: area.tables.filter((table) => table.active) }))}
      tabs={tabs}
    />
  );
}
