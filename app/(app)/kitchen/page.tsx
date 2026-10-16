import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import KitchenScreen from "@/components/kitchen/kitchen-screen";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadTickets } from "@/lib/kitchen/queries";

export const metadata: Metadata = { title: "Kitchen" };

export default async function KitchenPage() {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="kitchen" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Kitchen" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }
  const supabase = await createClient();
  const [tickets, { data: storeRow }] = await Promise.all([
    loadTickets(supabase, store.id),
    supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle(),
  ]);
  return <KitchenScreen storeId={store.id} storeName={store.name} timeZone={storeRow?.timezone ?? "UTC"} tickets={tickets} />;
}
