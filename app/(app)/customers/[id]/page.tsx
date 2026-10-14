import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import CustomerForm from "@/components/customers/customer-form";
import DeleteCustomerButton from "@/components/customers/delete-customer-button";
import StatusTag from "@/components/orders/status-tag";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { loadCustomer } from "@/lib/customers/queries";

export const metadata: Metadata = { title: "Customer" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CustomerPageProps = { params: Promise<{ id: string }> };

export default async function CustomerPage({ params }: CustomerPageProps) {
  await requireRole("cashier");
  const { id } = await params;
  if (!GUID.test(id)) notFound();
  const supabase = await createClient();
  const customer = await loadCustomer(supabase, id);
  if (!customer) notFound();

  const date = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
  const refunds = customer.orders
    .flatMap((order) => order.refunds.map((refund) => ({ ...refund, orderId: order.id, orderReceipt: order.receipt_number, store: order.store })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section id="customer" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={customer.name} actions={<DeleteCustomerButton id={customer.id} name={customer.name} />} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[56em] flex-col gap-8 p-4">
          <CustomerForm key={customer.id} customer={customer} />
          <section aria-labelledby="sales-heading" className="flex flex-col gap-2">
            <h2 id="sales-heading">Sales</h2>
            {customer.orders.length === 0 ? (
              <p className="text-subtle">No sales yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell><Link href={`/orders/${order.id}`} className="hover:underline">#{order.receipt_number}</Link></TableCell>
                      <TableCell>{date(order.created_at, order.store?.timezone ?? "UTC")}</TableCell>
                      <TableCell>{order.store?.name ?? "—"}</TableCell>
                      <TableCell>{formatMoney(order.total, order.store?.currency ?? "USD", "en-US")}</TableCell>
                      <TableCell><StatusTag status={order.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          {refunds.length > 0 && (
            <section aria-labelledby="customer-refunds-heading" className="flex flex-col gap-2">
              <h2 id="customer-refunds-heading">Refunds</h2>
              <ul className="flex flex-col gap-1">
                {refunds.map((refund) => (
                  <li key={refund.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Refund #{refund.receipt_number} for <Link href={`/orders/${refund.orderId}`} className="hover:underline">receipt #{refund.orderReceipt}</Link> · {date(refund.created_at, refund.store?.timezone ?? "UTC")}
                    </span>
                    <span>{formatMoney(refund.total, refund.store?.currency ?? "USD", "en-US")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
