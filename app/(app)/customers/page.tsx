import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireRole("cashier");
  return (
    <section id="customers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Customers" />
      <EmptyState title="Customer profiles are coming soon" description="You'll look up customers, see what they've bought and attach them to sales here." />
    </section>
  );
}
