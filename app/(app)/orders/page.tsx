import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import OrdersToolbar from "@/components/orders/orders-toolbar";
import OrdersTable from "@/components/orders/orders-table";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { ORDER_PAGE_SIZE, parseOrderFilters } from "@/lib/orders/list";
import { loadOrders } from "@/lib/orders/queries";

export const metadata: Metadata = { title: "Orders" };

type OrdersPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const staff = await requireRole("cashier");
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="orders" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Orders" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }

  const params = await searchParams;
  const filters = parseOrderFilters(params);
  const supabase = await createClient();
  const [{ data: storeRow }, { data: registers }, { data: cashiers }] = await Promise.all([
    supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle(),
    supabase.from("registers").select("id, name").eq("store_id", store.id).order("name"),
    supabase.from("staff").select("id, name").order("name"),
  ]);
  const timeZone = storeRow?.timezone ?? "UTC";
  const { rows, total } = await loadOrders(supabase, store.id, filters, timeZone);
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const filtered = Boolean(filters.q || filters.status || filters.register || filters.cashier || filters.from || filters.to);

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value) next.set(key, value);
    next.set("page", String(page));
    return `/orders?${next.toString()}`;
  };

  return (
    <section id="orders" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Orders" />
      <OrdersToolbar filters={filters} registers={registers ?? []} cashiers={cashiers ?? []} />
      <ScrollArea className="min-h-0 flex-1">
        {total === 0 ? (
          filtered ? (
            <EmptyState title="No sales match" description="Try another receipt number, date or filter." action={<Button href="/orders" variant="secondary" size="md">Clear filters</Button>} />
          ) : (
            <EmptyState title="No sales yet" description="Sales from the register show up here, with their receipts, refunds and voids." action={<Button href="/register" variant="primary" size="md">Open the register</Button>} />
          )
        ) : (
          <OrdersTable rows={rows} currency={store.currency} timeZone={timeZone} />
        )}
      </ScrollArea>
      <Pagination page={Math.min(filters.page, pages)} pages={pages} total={total} hrefFor={hrefFor} />
    </section>
  );
}
