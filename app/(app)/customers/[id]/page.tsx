import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import CustomerForm from "@/components/customers/customer-form";
import DeleteCustomerButton from "@/components/customers/delete-customer-button";
import StatusTag from "@/components/orders/status-tag";
import DetailSection from "@/components/_common/detail-section";
import Stat from "@/components/_common/stat";
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
  const counted = customer.orders.filter((order) => order.status !== "voided");
  const spent = counted.reduce((sum, order) => sum + order.total - order.refunds.reduce((total, refund) => total + refund.total, 0), 0);
  const visits = counted.length;
  const lastVisit = counted[0] ?? null;
  const currency = lastVisit?.store?.currency ?? customer.orders[0]?.store?.currency ?? "USD";

  return (
    <section id="customer" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={customer.name} actions={<DeleteCustomerButton id={customer.id} name={customer.name} />} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[64em] flex-col">
          <div className="flex flex-wrap items-end justify-between gap-6 p-5 shadow-[inset_0_-1px_0_var(--line-strong)]">
            <span className="text-soft">{[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details yet"}</span>
            <div className="flex flex-wrap gap-8">
              <Stat label="Total spent" value={formatMoney(spent, currency, "en-US")} />
              <Stat label={visits === 1 ? "Visit" : "Visits"} value={visits} />
              <Stat label="Last visit" value={lastVisit ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: lastVisit.store?.timezone ?? "UTC" }).format(new Date(lastVisit.created_at)) : "—"} />
              {refunds.length > 0 && <Stat label={refunds.length === 1 ? "Refund" : "Refunds"} value={refunds.length} />}
            </div>
          </div>

          <DetailSection title="Details">
            <CustomerForm key={customer.id} customer={customer} />
          </DetailSection>

          <DetailSection title="Sales">
            {customer.orders.length === 0 ? (
              <p className="text-subtle">No sales yet. Attach this customer from the register with + Customer.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden md:table-cell">Store</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customer.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell><Link href={`/orders/${order.id}`} className="hover:underline">#{order.receipt_number}</Link></TableCell>
                      <TableCell>{date(order.created_at, order.store?.timezone ?? "UTC")}</TableCell>
                      <TableCell className="hidden md:table-cell">{order.store?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(order.total, order.store?.currency ?? "USD", "en-US")}</TableCell>
                      <TableCell><StatusTag status={order.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DetailSection>

          {refunds.length > 0 && (
            <DetailSection title="Refunds">
              <ul className="flex flex-col gap-2">
                {refunds.map((refund) => (
                  <li key={refund.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Refund #{refund.receipt_number} for <Link href={`/orders/${refund.orderId}`} className="hover:underline">receipt #{refund.orderReceipt}</Link>
                      <span className="text-soft"> · {date(refund.created_at, refund.store?.timezone ?? "UTC")}</span>
                    </span>
                    <span className="tabular-nums">−{formatMoney(refund.total, refund.store?.currency ?? "USD", "en-US")}</span>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
