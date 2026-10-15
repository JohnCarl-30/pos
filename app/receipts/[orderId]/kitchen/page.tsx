import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kitchen ticket" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type KitchenOrder = {
  receipt_number: number;
  created_at: string;
  status: string;
  order_name: string | null;
  store: { timezone: string } | null;
  order_items: {
    id: string;
    line_number: number | null;
    name: string;
    quantity: number;
    variant: { product: { category: { kitchen: boolean } | null } | null } | null;
    order_item_modifiers: { option_name: string; sort_order: number }[];
  }[];
};

type KitchenPageProps = { params: Promise<{ orderId: string }>; searchParams: Promise<{ print?: string }> };

export default async function KitchenTicketPage({ params, searchParams }: KitchenPageProps) {
  await requireStaff();
  const { orderId } = await params;
  const { print } = await searchParams;
  if (!GUID.test(orderId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      "receipt_number, created_at, status, order_name, store:stores(timezone), order_items(id, line_number, name, quantity, variant:product_variants(product:products(category:categories(kitchen))), order_item_modifiers(option_name, sort_order))",
    )
    .eq("id", orderId)
    .maybeSingle();
  const order = data as unknown as KitchenOrder | null;
  if (!order) notFound();

  const time = new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: order.store?.timezone ?? "UTC" }).format(new Date(order.created_at));
  const lines = [...order.order_items]
    .filter((item) => item.variant === null || item.variant.product?.category?.kitchen === true)
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0));

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[14px] leading-snug">
        {order.status === "voided" && <p className="border-2 border-current py-1 text-center text-[24px] font-bold">VOID</p>}
        <header className="flex flex-col items-center gap-1 border-b border-dashed border-current pb-2 text-center">
          <span className="text-[40px] leading-none font-bold">#{order.receipt_number}</span>
          <span>{time}</span>
          {order.order_name && <span className="text-[20px] font-bold">For {order.order_name}</span>}
        </header>
        {lines.length === 0 ? (
          <p className="text-center">Nothing for the kitchen on this sale.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((item) => (
              <li key={item.id} className="flex flex-col">
                <span className="text-[18px]">
                  {item.quantity} × {item.name}
                </span>
                {[...item.order_item_modifiers]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((modifier) => (
                    <span key={`${item.id}-${modifier.sort_order}`} className="pl-4 font-bold">
                      {modifier.option_name}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        )}
        <PrintButton label="Print ticket" />
      </article>
    </main>
  );
}
