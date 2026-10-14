import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { REFUND_REASON_LABELS, type RefundReason } from "@/lib/orders/detail";

export const metadata: Metadata = { title: "Refund slip" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD_LABELS = { cash: "Cash", card: "Card", other: "Other" } as const;

type RefundSlip = {
  id: string;
  receipt_number: number;
  created_at: string;
  reason: RefundReason;
  note: string | null;
  tax_total: number;
  total: number;
  store: { name: string; address: string | null; currency: string; timezone: string; receipt_footer: string | null } | null;
  register: { name: string } | null;
  staff: { name: string } | null;
  approver: { name: string } | null;
  order: { receipt_number: number; customer: { name: string } | null } | null;
  refund_items: { id: string; quantity: number; restock: boolean; amount: number; order_item: { name: string; line_number: number | null } | null }[];
  refund_payments: { id: string; method: keyof typeof METHOD_LABELS; amount: number; reference: string | null }[];
};

type RefundSlipPageProps = { params: Promise<{ refundId: string }>; searchParams: Promise<{ print?: string }> };

export default async function RefundSlipPage({ params, searchParams }: RefundSlipPageProps) {
  await requireStaff();
  const { refundId } = await params;
  const { print } = await searchParams;
  if (!GUID.test(refundId)) notFound();

  const supabase = await createClient();
  const [{ data }, { data: business }] = await Promise.all([
    supabase
      .from("refunds")
      .select(
        "id, receipt_number, created_at, reason, note, tax_total, total, store:stores(name, address, currency, timezone, receipt_footer), register:registers(name), staff:staff!refunds_staff_id_fkey(name), approver:staff!refunds_approved_by_fkey(name), order:orders(receipt_number, customer:customers(name)), refund_items(id, quantity, restock, amount, order_item:order_items(name, line_number)), refund_payments(id, method, amount, reference)",
      )
      .eq("id", refundId)
      .maybeSingle(),
    supabase.from("business").select("name").maybeSingle(),
  ]);
  const slip = data as unknown as RefundSlip | null;
  if (!slip || !slip.store) notFound();

  const store = slip.store;
  const money = (minor: number) => formatMoney(minor, store.currency, "en-US");
  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: store.timezone }).format(new Date(slip.created_at));
  const items = [...slip.refund_items].sort((a, b) => (a.order_item?.line_number ?? 0) - (b.order_item?.line_number ?? 0));

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[12px] leading-snug">
        <header className="flex flex-col items-center gap-1 text-center">
          <h1>{business?.name ?? slip.store.name}</h1>
          <span>{slip.store.name}</span>
          {slip.store.address && <span>{slip.store.address}</span>}
        </header>
        <div className="flex flex-col gap-0.5 border-y border-dashed border-current py-2">
          <span className="font-bold">REFUND #{slip.receipt_number}</span>
          {slip.order && <span>For receipt #{slip.order.receipt_number}</span>}
          <span>{when}</span>
          {slip.register && <span>Register: {slip.register.name}</span>}
          {slip.staff && <span>Refunded by: {slip.staff.name}</span>}
          {slip.approver && slip.approver.name !== slip.staff?.name && <span>Approved by: {slip.approver.name}</span>}
          {slip.order?.customer && <span>Customer: {slip.order.customer.name}</span>}
          <span>Reason: {REFUND_REASON_LABELS[slip.reason]}{slip.note ? ` (${slip.note})` : ""}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col">
              <span>{item.order_item?.name ?? "Item"}</span>
              <span className="flex justify-between">
                <span>{item.quantity} · {item.restock ? "returned to stock" : "damaged"}</span>
                <span>{money(item.amount)}</span>
              </span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-0.5 border-t border-dashed border-current pt-2">
          <div className="flex justify-between"><dt>Tax refunded</dt><dd>{money(slip.tax_total)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Total refunded</dt><dd>{money(slip.total)}</dd></div>
        </dl>
        <dl className="flex flex-col gap-0.5 border-t border-dashed border-current pt-2">
          {slip.refund_payments.map((payment) => (
            <div key={payment.id} className="flex justify-between">
              <dt>{METHOD_LABELS[payment.method]}{payment.reference ? ` (${payment.reference})` : ""}</dt>
              <dd>{money(payment.amount)}</dd>
            </div>
          ))}
        </dl>
        {slip.store.receipt_footer && <span className="border-t border-dashed border-current pt-2 text-center">{slip.store.receipt_footer}</span>}
        <PrintButton />
      </article>
    </main>
  );
}
