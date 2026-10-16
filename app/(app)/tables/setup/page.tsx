import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { ScrollArea } from "@/components/_ui/scroll-area";
import Button from "@/components/_ui/button";
import AreasEditor from "@/components/tables/areas-editor";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadAreas } from "@/lib/tables/queries";

export const metadata: Metadata = { title: "Set up tables" };

export default async function TablesSetupPage() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="tables-setup" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Set up tables" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }
  const supabase = await createClient();
  const areas = await loadAreas(supabase, store.id);
  return (
    <section id="tables-setup" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={`Set up tables · ${store.name}`} actions={<Button href="/tables" variant="ghost" size="md">Back to tables</Button>} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[48em] flex-col gap-6 p-4">
          <AreasEditor areas={areas} />
        </div>
      </ScrollArea>
    </section>
  );
}
