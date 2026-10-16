import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PrintOnLoad from "@/components/register/print-on-load";
import PrintButton from "@/components/register/print-button";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { priceCart } from "@/lib/checkout";
import { formatMoney } from "@/lib/money";
import { cartInputs } from "@/lib/register/cart";
import { loadRegisterCatalog } from "@/lib/register/queries";
import { pickAll, tabCartLines } from "@/lib/tabs/lines";
import { loadTab } from "@/lib/tabs/queries";

export const metadata: Metadata = { title: "Bill" };

export default async function BillPage({ params, searchParams }: { params: Promise<{ tabId: string }>; searchParams: Promise<{ print?: string }> }) {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  const { tabId } = await params;
  const { print } = await searchParams;
  const supabase = await createClient();
  const tab = await loadTab(supabase, tabId);
  if (!tab || !store || tab.storeId !== store.id) notFound();

  const [products, { data: storeRow }] = await Promise.all([
    loadRegisterCatalog(supabase, store.id),
    supabase.from("stores").select("name, timezone, receipt_footer").eq("id", store.id).maybeSingle(),
  ]);
  const money = (minor: number) => formatMoney(minor, store.currency, "en-US");
  const { lines } = tabCartLines(tab.lines, products, pickAll(tab.lines), {});
  const priced = lines.length > 0 ? priceCart(cartInputs(lines), null, store.pricesIncludeTax) : null;
  const paid = tab.sales.filter((sale) => sale.status !== "voided").reduce((sum, sale) => sum + sale.total, 0);
  const now = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: storeRow?.timezone ?? "UTC" }).format(new Date());

  return (
    <main className="bg-background flex min-h-dvh justify-center p-4 print:bg-white print:p-0 print:text-black">
      {print === "1" && <PrintOnLoad />}
      <article className="flex w-full max-w-[80mm] flex-col gap-3 font-mono text-[13px] leading-snug">
        <header className="flex flex-col items-center gap-1 border-b border-dashed border-current pb-2 text-center">
          <span className="text-[16px] font-bold">{storeRow?.name ?? store.name}</span>
          <span className="text-[20px] font-bold">{tab.label}</span>
          <span>{[tab.guests ? `${tab.guests} guests` : null, now].filter(Boolean).join(" · ")}</span>
        </header>
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li key={line.key} className="flex flex-col">
              <span className="flex justify-between gap-2">
                <span>{line.quantity} × {line.label}</span>
                <span className="tabular-nums">{money(line.price * line.quantity)}</span>
              </span>
              {line.modifierLabel && <span className="pl-4">{line.modifierLabel}</span>}
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1 border-t border-dashed border-current pt-2 tabular-nums">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(priced?.subtotal ?? 0)}</dd></div>
          <div className="flex justify-between"><dt>{store.pricesIncludeTax ? "Includes tax" : "Tax"}</dt><dd>{money(priced?.taxTotal ?? 0)}</dd></div>
          <div className="flex justify-between text-[16px] font-bold"><dt>Total</dt><dd>{money(priced?.total ?? 0)}</dd></div>
          {paid > 0 && <div className="flex justify-between"><dt>Already paid</dt><dd>{money(paid)}</dd></div>}
        </dl>
        {storeRow?.receipt_footer && <p className="text-center">{storeRow.receipt_footer}</p>}
        <PrintButton label="Print bill" />
      </article>
    </main>
  );
}
