import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StatusTag from "@/components/orders/status-tag";
import DetailSection from "@/components/_common/detail-section";
import Card from "@/components/_common/card";
import Stat from "@/components/_common/stat";
import Tag from "@/components/_ui/tag";
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
  const refundedTotal = order.refunds.reduce((sum, refund) => sum + refund.total, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section id="order" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={`Receipt #${order.receipt_number}`}
        actions={
          <OrderActions
            orderId={order.id}
            receiptNumber={order.receipt_number}
            total={order.total + order.tip}
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
        <div className="flex max-w-[64em] flex-col">
          <div className="flex flex-wrap items-end justify-between gap-6 p-5 shadow-[inset_0_-1px_0_var(--line-strong)]">
            <div className="flex flex-col items-start gap-3">
              <StatusTag status={order.status} />
              <span className="text-soft">
                {when(order.created_at)} · {order.register?.name ?? "—"} · {order.staff?.name ?? "—"}
                {order.order_name ? ` · for ${order.order_name}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-8">
              <Stat label="Total" value={money(order.total)} />
              {refundedTotal > 0 && <Stat label="Refunded" value={`−${money(refundedTotal)}`} />}
              <Stat label={itemCount === 1 ? "Item" : "Items"} value={itemCount} />
              <div className="flex min-w-[8em] flex-col gap-1.5">
                <span className="block text-[28px] leading-none font-semibold">
                  {order.customer ? (
                    <Link href={`/customers/${order.customer.id}`} className="hover:underline">{order.customer.name}</Link>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="caption-style text-soft block">Customer</span>
              </div>
            </div>
          </div>

          {order.status === "voided" && (
            <div className="p-5 shadow-[inset_0_-1px_0_var(--line-strong)]">
              <p role="status" className="bg-danger/10 text-danger rounded-lg px-3 py-2">
                Voided{order.voided_at ? ` ${when(order.voided_at)}` : ""}{order.voider ? ` by ${order.voider.name}` : ""}: {order.void_reason}
              </p>
            </div>
          )}

          <DetailSection title="Items">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.name}
                      {item.order_item_modifiers.length > 0 && (
                        <span className="caption-style text-soft mt-1 block">
                          {[...item.order_item_modifiers].sort((a, b) => a.sort_order - b.sort_order).map((modifier) => modifier.option_name).join(" · ")}
                        </span>
                      )}
                      <span className="caption-style text-subtle mt-1 block">{item.sku}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity} × {money(item.unit_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{refunded.get(item.id) ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.discount > 0 ? `−${money(item.discount)}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(item.tax)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(item.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <dl className="flex w-full max-w-[22em] flex-col gap-2 self-end tabular-nums">
              <div className="flex justify-between"><dt className="text-soft">Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
              {order.discount_total > 0 && (
                <div className="flex justify-between">
                  <dt className="text-soft">Discounts{order.discounter ? ` (by ${order.discounter.name})` : ""}</dt>
                  <dd>−{money(order.discount_total)}</dd>
                </div>
              )}
              <div className="flex justify-between"><dt className="text-soft">Tax</dt><dd>{money(order.tax_total)}</dd></div>
              <div className="flex justify-between border-t border-white/8 pt-2 font-semibold"><dt>Total</dt><dd>{money(order.total)}</dd></div>
              {order.tip > 0 && (
                <>
                  <div className="flex justify-between"><dt className="text-soft">Tip</dt><dd>{money(order.tip)}</dd></div>
                  <div className="flex justify-between font-semibold"><dt>Paid</dt><dd>{money(order.total + order.tip)}</dd></div>
                </>
              )}
            </dl>
          </DetailSection>

          <DetailSection title="Payments">
            <ul className="flex flex-col gap-2">
              {order.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-4">
                  <span>
                    {METHOD_LABELS[payment.method]}
                    {payment.reference ? <span className="text-soft"> · {payment.reference}</span> : null}
                    {payment.change !== null && payment.change > 0 ? <span className="text-soft"> · change {money(payment.change)}</span> : null}
                  </span>
                  <span className="tabular-nums">{money(payment.amount)}</span>
                </li>
              ))}
            </ul>
          </DetailSection>

          {order.refunds.length > 0 && (
            <DetailSection title="Refunds">
              <ul className="flex flex-col gap-3">
                {order.refunds.map((refund) => (
                  <li key={refund.id}>
                    <Card className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="lead-style font-medium">Refund #{refund.receipt_number}</span>
                        <span className="lead-style font-medium tabular-nums">−{money(refund.total)}</span>
                      </div>
                      <div className="caption-style text-soft flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Tag size="sm">{REFUND_REASON_LABELS[refund.reason]}</Tag>
                        <span>{when(refund.created_at)}</span>
                        <span>· by {refund.staff?.name ?? "—"}</span>
                        {refund.approver && refund.approver.name !== refund.staff?.name && <span>· approved by {refund.approver.name}</span>}
                      </div>
                      {refund.note && <p className="text-soft">{refund.note}</p>}
                      <ul className="flex flex-col gap-1">
                        {refund.refund_items.map((item) => (
                          <li key={item.order_item_id} className="tabular-nums">
                            {item.quantity} × {names.get(item.order_item_id) ?? "Item"} · {money(item.amount)} · {item.restock ? "back to stock" : "damaged"}
                          </li>
                        ))}
                      </ul>
                      <div className="caption-style text-soft flex flex-wrap items-center justify-between gap-2">
                        <span className="tabular-nums">{refund.refund_payments.map((payment) => `${METHOD_LABELS[payment.method]} ${money(payment.amount)}`).join(" · ")}</span>
                        <a href={`/receipts/refunds/${refund.id}?print=1`} target="_blank" rel="noreferrer" className="hover:text-foreground underline underline-offset-2">Print slip</a>
                      </div>
                    </Card>
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
