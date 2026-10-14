import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import CustomersToolbar from "@/components/customers/customers-toolbar";
import CustomersTable from "@/components/customers/customers-table";
import Pagination from "@/components/products/pagination";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_PAGE_SIZE, matchCustomers, pageOf, parseCustomerFilters } from "@/lib/customers/list";
import { loadCustomerRows } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Customers" };

type CustomersPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const staff = await requireRole("cashier");
  const store = await getCurrentStore(staff);
  const filters = parseCustomerFilters(await searchParams);
  const supabase = await createClient();
  const [rows, { data: storeRow }] = await Promise.all([
    loadCustomerRows(supabase),
    store ? supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const result = pageOf(matchCustomers(rows, filters.q), filters.page, CUSTOMER_PAGE_SIZE);
  const hrefFor = (page: number) => `/customers?${new URLSearchParams({ ...(filters.q ? { q: filters.q } : {}), page: String(page) }).toString()}`;

  return (
    <section id="customers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Customers" actions={<Button href="/customers/new" variant="primary" size="md">New customer</Button>} />
      <CustomersToolbar q={filters.q} />
      <ScrollArea className="min-h-0 flex-1">
        {result.total === 0 ? (
          filters.q ? (
            <EmptyState title="No customers match" description="Try another name, email or phone, or add a new customer." action={<Button href="/customers" variant="secondary" size="md">Clear search</Button>} />
          ) : (
            <EmptyState title="No customers yet" description="Add customers here or from the register, then see what they've bought." action={<Button href="/customers/new" variant="primary" size="md">New customer</Button>} />
          )
        ) : (
          <CustomersTable rows={result.rows} currency={store?.currency ?? "USD"} timeZone={storeRow?.timezone ?? "UTC"} />
        )}
      </ScrollArea>
      <Pagination page={result.page} pages={result.pages} total={result.total} hrefFor={hrefFor} />
    </section>
  );
}
