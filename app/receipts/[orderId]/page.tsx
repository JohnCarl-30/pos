import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatBpsAsPercent } from "@/lib/percent";

export const metadata: Metadata = { title: "Receipt" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD_LABELS = { cash: "Cash", card: "Card", other: "Other" } as const;

type ReceiptOrder = {
  id: string;
  receipt_number: number;
  created_at: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  tip: number;
  order_name: string | null;
  store: { name: string; address: string | null; currency: string; timezone: string; receipt_footer: string | null; prices_include_tax: boolean } | null;
  register: { name: string } | null;
  staff: { name: string } | null;
  customer: { name: string } | null;
  order_items: { id: string; line_number: number | null; name: string; unit_price: number; quantity: number; discount: number; tax_rate_bps: number; tax: number; line_total: number; order_item_modifiers: { option_name: string; sort_order: number }[] }[];
  payments: { id: string; method: keyof typeof METHOD_LABELS; amount: number; tendered: number | null; change: number | null; reference: string | null }[];
};

type ReceiptPageProps = { params: Promise<{ orderId: string }>; searchParams: Promise<{ print?: string }> };

export default async function ReceiptPage({ params, searchParams }: ReceiptPageProps) {
  await requireStaff();
  const { orderId } = await params;
  const { print } = await searchParams;
  if (!GUID.test(orderId)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: business }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, receipt_number, created_at, subtotal, discount_total, tax_total, total, tip, order_name, store:stores(name, address, currency, timezone, receipt_footer, prices_include_tax), register:registers(name), staff:staff!orders_staff_id_fkey(name), customer:customers(name), order_items(id, line_number, name, unit_price, quantity, discount, tax_rate_bps, tax, line_total, order_item_modifiers(option_name, sort_order)), payments(id, method, amount, tendered, change, reference)",
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabase.from("business").select("name").maybeSingle(),
  ]);
  const order = data as unknown as ReceiptOrder | null;
  if (!order || !order.store) notFound();

  const currency = order.store.currency;
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: order.store.timezone }).format(new Date(order.created_at));
  const items = [...order.order_items].sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));
  const taxByRate = new Map<number, number>();
  for (const item of items) taxByRate.set(item.tax_rate_bps, (taxByRate.get(item.tax_rate_bps) ?? 0) + item.tax);

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[12px] leading-snug">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1>{business?.name ?? order.store.name}</h1>
          <span>{order.store.name}</span>
          {order.store.address && <span>{order.store.address}</span>}
        </header>
        <div className="flex flex-col gap-0.5 border-y border-dashed border-current py-2">
          <span>Receipt #{order.receipt_number}</span>
          <span>{when}</span>
          {order.register && <span>Register: {order.register.name}</span>}
          {order.staff && <span>Served by: {order.staff.name}</span>}
          {order.customer && <span>Customer: {order.customer.name}</span>}
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col">
              <span>{item.name}</span>
              {item.order_item_modifiers.length > 0 && (
                <span className="pl-2">{[...item.order_item_modifiers].sort((a, b) => a.sort_order - b.sort_order).map((modifier) => modifier.option_name).join(", ")}</span>
              )}
              <span className="flex justify-between">
                <span>
                  {item.quantity} × {money(item.unit_price)}
                </span>
                <span>{money(item.line_total)}</span>
              </span>
              {item.discount > 0 && <span>Discount −{money(item.discount)}</span>}
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-0.5 border-t border-dashed border-current pt-2">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
          {order.discount_total > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{money(order.discount_total)}</dd></div>}
          {[...taxByRate.entries()].map(([rate, tax]) => (
            <div key={rate} className="flex justify-between">
              <dt>{order.store?.prices_include_tax ? "Incl. tax" : "Tax"} {formatBpsAsPercent(rate)}%</dt>
              <dd>{money(tax)}</dd>
            </div>
          ))}
          <div className="flex justify-between font-bold"><dt>Total</dt><dd>{money(order.total)}</dd></div>
          {order.tip > 0 && (
            <>
              <div className="flex justify-between"><dt>Tip</dt><dd>{money(order.tip)}</dd></div>
              <div className="flex justify-between font-bold"><dt>Paid</dt><dd>{money(order.total + order.tip)}</dd></div>
            </>
          )}
        </dl>
        <dl className="flex flex-col gap-0.5 border-t border-dashed border-current pt-2">
          {order.payments.map((payment) => (
            <div key={payment.id} className="flex flex-col">
              <div className="flex justify-between"><dt>{METHOD_LABELS[payment.method]}{payment.reference ? ` (${payment.reference})` : ""}</dt><dd>{money(payment.amount)}</dd></div>
              {payment.tendered !== null && <div className="flex justify-between"><dt>Received</dt><dd>{money(payment.tendered)}</dd></div>}
              {payment.change !== null && payment.change > 0 && <div className="flex justify-between"><dt>Change</dt><dd>{money(payment.change)}</dd></div>}
            </div>
          ))}
        </dl>
        {order.store.receipt_footer && <span className="border-t border-dashed border-current pt-2 text-center">{order.store.receipt_footer}</span>}
        <PrintButton />
      </article>
    </main>
  );
}
