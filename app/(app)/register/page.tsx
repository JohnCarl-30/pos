import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  await requireRole("cashier");
  return (
    <section id="register" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Register" />
      <EmptyState title="Checkout is coming next" description="You'll ring up sales here: scan or search products, take cash or card, and print receipts." />
    </section>
  );
}
