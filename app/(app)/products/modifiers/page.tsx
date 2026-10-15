import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ModifierGroupDialog, { type ModifierGroupRow } from "@/components/products/modifier-group-dialog";
import ModifierGroupsTable from "@/components/products/modifier-groups-table";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Modifiers" };

export default async function ModifiersPage() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const currency = store?.currency ?? "USD";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("modifier_groups")
    .select("id, name, min_choices, max_choices, active, sort_order, modifier_options(id, name, price_delta, active, sort_order), product_modifier_groups(product_id)")
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");
  if (error) throw error;
  const groups = (data ?? []) as unknown as ModifierGroupRow[];

  return (
    <section id="modifiers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Modifiers"
        actions={
          <>
            <Button href="/products" variant="ghost" size="md">Products</Button>
            <ModifierGroupDialog currency={currency} trigger={<Button variant="primary" size="md">New group</Button>} />
          </>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        {groups.length === 0 ? (
          <EmptyState title="No modifier groups yet" description="Create groups like Milk or Extras, then attach them to products on each product's page." />
        ) : (
          <ModifierGroupsTable groups={groups} currency={currency} />
        )}
      </ScrollArea>
    </section>
  );
}
