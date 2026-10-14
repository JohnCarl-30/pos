import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StatusTag from "@/components/orders/status-tag";
import OrderActions from "@/components/orders/order-actions";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { loadDeviceSession, loadOrder } from "@/lib/orders/queries";
import { REFUND_REASON_LABELS, canVoid, refundAvailability, refundedByItem, toRefundContext } from "@/lib/orders/detail";

export const metadata: Metadata = { title: "Sale" };

const METHOD_LABELS = { cash: "Cash", card: "Card", other: "Other" } as const;

type OrderPageProps = { params: Promise<{ id: string }> };

export default async function OrderPage({ params }: OrderPageProps) {
  const staff = await requireRole("cashier");
  const { id } = await params;
  const supabase = await createClient();
  const order = await loadOrder(supabase, id);
  if (!order) notFound();

  const [{ data: store }, session] = await Promise.all([
    supabase.from("stores").select("currency, timezone").eq("id", order.store_id).maybeSingle(),
    loadDeviceSession(supabase, order.store_id),
  ]);
  const currency = store?.currency ?? "USD";
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const formatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: store?.timezone ?? "UTC" });
  const when = (iso: string) => formatter.format(new Date(iso));
  const refunded = refundedByItem(order);
  const items = [...order.order_items].sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));
  const names = new Map(items.map((item) => [item.id, item.name]));

  return (
    <section id="order" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={`Receipt #${order.receipt_number}`}
        actions={
          <OrderActions
            orderId={order.id}
            receiptNumber={order.receipt_number}
            total={order.total}
            context={toRefundContext(order)}
            availability={refundAvailability(order, session)}
            sessionId={session?.sessionId ?? null}
            voidable={canVoid(order, staff)}
            role={staff.role}
            currency={currency}
          />
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex max-w-[56em] flex-col gap-6 p-4">
          <dl className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Status</dt><dd><StatusTag status={order.status} /></dd></div>
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Date</dt><dd>{when(order.created_at)}</dd></div>
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Register</dt><dd>{order.register?.name ?? "—"}</dd></div>
            <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Cashier</dt><dd>{order.staff?.name ?? "—"}</dd></div>
            <div className="flex flex-col gap-1">
              <dt className="caption-style text-subtle">Customer</dt>
              <dd>{order.customer ? <Link href={`/customers/${order.customer.id}`} className="hover:underline">{order.customer.name}</Link> : "—"}</dd>
            </div>
            {order.discount_total > 0 && <div className="flex flex-col gap-1"><dt className="caption-style text-subtle">Discount by</dt><dd>{order.discounter?.name ?? "—"}</dd></div>}
          </dl>

          {order.status === "voided" && (
            <p role="status" className="bg-danger/10 text-danger rounded-lg px-3 py-2">
              Voided{order.voided_at ? ` ${when(order.voided_at)}` : ""}{order.voider ? ` by ${order.voider.name}` : ""}: {order.void_reason}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Refunded</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}<span className="caption-style text-subtle block">{item.sku}</span></TableCell>
                  <TableCell>{item.quantity} × {money(item.unit_price)}</TableCell>
                  <TableCell>{refunded.get(item.id) ?? 0}</TableCell>
                  <TableCell>{item.discount > 0 ? `−${money(item.discount)}` : "—"}</TableCell>
                  <TableCell>{money(item.tax)}</TableCell>
                  <TableCell>{money(item.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <dl className="flex w-full max-w-[22em] flex-col gap-1 self-end">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
            {order.discount_total > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{money(order.discount_total)}</dd></div>}
            <div className="flex justify-between"><dt>Tax</dt><dd>{money(order.tax_total)}</dd></div>
            <div className="flex justify-between font-medium"><dt>Total</dt><dd>{money(order.total)}</dd></div>
          </dl>

          <section aria-labelledby="payments-heading" className="flex flex-col gap-2">
            <h2 id="payments-heading">Payments</h2>
            <ul className="flex flex-col gap-1">
              {order.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-4">
                  <span>
                    {METHOD_LABELS[payment.method]}
                    {payment.reference ? ` (${payment.reference})` : ""}
                    {payment.change !== null && payment.change > 0 ? ` · change ${money(payment.change)}` : ""}
                  </span>
                  <span>{money(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          {order.refunds.length > 0 && (
            <section aria-labelledby="refunds-heading" className="flex flex-col gap-2">
              <h2 id="refunds-heading">Refunds</h2>
              <ul className="flex flex-col gap-4">
                {order.refunds.map((refund) => (
                  <li key={refund.id} className="border-line-strong flex flex-col gap-1 border-t pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">Refund #{refund.receipt_number} · {money(refund.total)}</span>
                      <a href={`/receipts/refunds/${refund.id}?print=1`} target="_blank" rel="noreferrer" className="caption-style hover:underline">Print slip</a>
                    </div>
                    <span className="caption-style text-subtle">
                      {when(refund.created_at)} · by {refund.staff?.name ?? "—"}
                      {refund.approver && refund.approver.name !== refund.staff?.name ? ` · approved by ${refund.approver.name}` : ""}
                    </span>
                    <span>{REFUND_REASON_LABELS[refund.reason]}{refund.note ? `: ${refund.note}` : ""}</span>
                    <ul className="caption-style flex flex-col">
                      {refund.refund_items.map((item) => (
                        <li key={item.order_item_id}>
                          {item.quantity} × {names.get(item.order_item_id) ?? "Item"} · {money(item.amount)} · {item.restock ? "back to stock" : "damaged"}
                        </li>
                      ))}
                    </ul>
                    <span className="caption-style text-subtle">
                      {refund.refund_payments.map((payment) => `${METHOD_LABELS[payment.method]} ${money(payment.amount)}`).join(" · ")}
                    </span>
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
