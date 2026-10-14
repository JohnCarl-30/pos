import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import CustomerForm from "@/components/customers/customer-form";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireRole("cashier");
  return (
    <section id="new-customer" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="New customer" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <CustomerForm />
        </div>
      </ScrollArea>
    </section>
  );
}
