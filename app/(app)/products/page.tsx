import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ProductsToolbar from "@/components/products/products-toolbar";
import ProductsTable from "@/components/products/products-table";
import Pagination from "@/components/products/pagination";
import CategoriesDialog from "@/components/products/categories-dialog";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { filterProductRows, parseProductFilters } from "@/lib/catalog/list";
import { loadCategories, loadProductRows } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "Products" };

type ProductsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const params = await searchParams;
  const filters = parseProductFilters(params);
  const supabase = await createClient();
  const [rows, categories] = await Promise.all([store ? loadProductRows(supabase, store.id) : Promise.resolve([]), loadCategories(supabase)]);
  const result = filterProductRows(rows, filters);

  const hrefFor = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === "string" && value) next.set(key, value);
    next.set("page", String(page));
    return `/products?${next.toString()}`;
  };

  return (
    <section id="products" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Products"
        actions={
          <>
            <CategoriesDialog categories={categories} />
            <Button href="/products/modifiers" variant="ghost" size="md">Modifiers</Button>
            <Button href="/products/import" variant="ghost" size="md">Import CSV</Button>
            <Button href="/products/stock" variant="ghost" size="md">Stock history</Button>
            <Button href="/products/new" variant="primary" size="md">New product</Button>
          </>
        }
      />
      <ProductsToolbar filters={filters} categories={categories} />
      <ScrollArea className="min-h-0 flex-1">
        {result.total === 0 ? (
          <EmptyState title="No products match" description="Try a different search or filter, or add a new product." />
        ) : (
          <ProductsTable rows={result.rows} currency={store?.currency ?? "USD"} />
        )}
      </ScrollArea>
      <Pagination page={Math.min(filters.page, result.pages)} pages={result.pages} total={result.total} hrefFor={hrefFor} />
    </section>
  );
}
