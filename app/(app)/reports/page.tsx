import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireRole("manager");
  return (
    <section id="reports" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Reports" />
      <EmptyState title="Reports are coming soon" description="Daily sales, best sellers, staff totals and end-of-day cash-up will live here." />
    </section>
  );
}
