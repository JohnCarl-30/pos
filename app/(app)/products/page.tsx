import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireRole("manager");
  return (
    <section id="products" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Products" />
      <EmptyState title="Product editing is coming next" description="You'll add products, variants, barcodes and stock here. The demo catalog is already in the database." />
    </section>
  );
}
