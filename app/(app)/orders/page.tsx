import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  await requireRole("cashier");
  return (
    <section id="orders" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Orders" />
      <EmptyState title="No orders yet" description="Sales from the register will show up here, with receipts, refunds and voids." />
    </section>
  );
}
