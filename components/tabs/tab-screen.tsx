"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button, { buttonVariants } from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/_ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/_ui/dropdown-menu";
import PageHeader from "@/components/_common/page-header";
import ProductGrid from "@/components/register/product-grid";
import VariantDialog from "@/components/register/variant-dialog";
import ModifierDialog, { type ModifierTarget } from "@/components/register/modifier-dialog";
import TabLines from "./tab-lines";
import TextDialog, { type TextRequest } from "./text-dialog";
import MoveDialog, { type FreeTable } from "./move-dialog";
import TabDetailsDialog from "./tab-details-dialog";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatMoney } from "@/lib/money";
import { selectionIds, type Selection } from "@/lib/modifiers";
import { searchProducts, type RegisterProduct, type RegisterVariant } from "@/lib/register/cart";
import { tabTotal, unsentCount, type TabLine } from "@/lib/tabs/lines";
import type { TabView } from "@/lib/tabs/queries";
import { addTabItems, cancelTab, changeTabItem, moveTab, noteTabItem, printBill, sendTab, updateTab, voidTabItem, type TabActionResult } from "@/lib/tabs/actions";
import { cn } from "@/lib/utils";

type TabScreenProps = {
  tab: TabView;
  currency: string;
  timeZone: string;
  pricesIncludeTax: boolean;
  products: RegisterProduct[];
  categories: { id: string; name: string }[];
  freeTables: FreeTable[];
};

export default function TabScreen({ tab, currency, timeZone, pricesIncludeTax, products, categories, freeTables }: TabScreenProps) {
  useLiveRefresh("tabs", tab.storeId);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const time = (iso: string) => new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone }).format(new Date(iso));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [variantProduct, setVariantProduct] = useState<RegisterProduct | null>(null);
  const [modifierTarget, setModifierTarget] = useState<ModifierTarget | null>(null);
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 64rem)");

  const editable = tab.status === "open";
  const categoryIndex = useMemo(() => new Map(categories.map((entry, index) => [entry.id, index])), [categories]);
  const visible = useMemo(() => searchProducts(products, query, category), [products, query, category]);
  const total = tabTotal(tab.lines, products, pricesIncludeTax);
  const waiting = unsentCount(tab.lines);
  const itemCount = tab.lines.reduce((sum, line) => sum + (line.voidedAt ? 0 : line.quantity - line.paidQuantity), 0);
  const cancellable = !tab.lines.some((line) => (line.sentAt !== null && line.voidedAt === null) || line.paidQuantity > 0);

  function run(action: () => Promise<TabActionResult>, after?: () => void) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  async function settle(action: () => Promise<TabActionResult>): Promise<string | null> {
    const result = await action();
    if (!result.ok) return result.error;
    router.refresh();
    return null;
  }

  function add(product: RegisterProduct, variant: RegisterVariant, selection: Selection = {}) {
    run(() => addTabItems(tab.id, [{ variantId: variant.id, optionIds: selectionIds(product.modifierGroups, selection), quantity: 1 }]));
  }

  function choose(product: RegisterProduct, variant: RegisterVariant) {
    if (product.modifierGroups.length > 0) setModifierTarget({ product, variant, selection: {}, editKey: null });
    else add(product, variant);
  }

  function pick(product: RegisterProduct) {
    if (product.variants.length === 1) choose(product, product.variants[0]);
    else setVariantProduct(product);
  }

  function askNote(line: TabLine) {
    setTextRequest({
      title: `Note for ${line.name}`,
      description: "The kitchen sees this under the item.",
      label: "Note",
      submit: "Save note",
      initial: line.note ?? "",
      maxLength: 100,
      onSubmit: (value) => settle(() => noteTabItem(tab.id, line.id, value)),
    });
  }

  function askVoid(line: TabLine) {
    setTextRequest({
      title: `Void ${line.name}`,
      description: "It's struck off the kitchen ticket and taken off the bill.",
      label: "Reason",
      submit: "Void item",
      initial: "",
      maxLength: 200,
      onSubmit: (value) => settle(() => voidTabItem(tab.id, line.id, value)),
    });
  }

  const linesPanel = (
    <TabLines
      lines={tab.lines}
      products={products}
      editable={editable}
      pending={pending}
      money={money}
      time={time}
      onQuantity={(line, quantity) => run(() => changeTabItem(tab.id, line.id, quantity))}
      onNote={askNote}
      onVoid={askVoid}
    />
  );

  const footer = editable ? (
    <div className="border-line-strong flex flex-col gap-3 border-t p-4">
      <div className="flex items-baseline justify-between tabular-nums">
        <span className="text-soft">To pay</span>
        <span className="text-[20px] leading-none font-semibold">{money(total)}</span>
      </div>
      {notice && <span role="alert" className="caption-style text-danger">{notice}</span>}
      <Button variant="primary" size="md" className="min-h-11" disabled={pending || waiting === 0} onClick={() => run(() => sendTab(tab.id))}>
        {waiting > 0 ? `Send ${waiting} to the kitchen` : "Everything's sent"}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`/bills/${tab.id}?print=1`}
          target="_blank"
          rel="noreferrer"
          aria-disabled={itemCount === 0}
          className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11", itemCount === 0 && "pointer-events-none opacity-50")}
          onClick={() => run(() => printBill(tab.id))}
        >
          Print bill
        </a>
        <Button href={`/register?tab=${tab.id}`} variant="secondary" size="md" className={cn("min-h-11", itemCount === 0 && "pointer-events-none opacity-50")}>
          Pay
        </Button>
      </div>
    </div>
  ) : (
    <div className="border-line-strong flex flex-col gap-2 border-t p-4">
      <span className="lead-style">{tab.status === "paid" ? "This tab is paid." : "This tab was cancelled."}</span>
      {tab.sales.map((sale) => (
        <a key={sale.id} href={`/orders/${sale.id}`} className="caption-style text-soft underline">
          Receipt #{sale.receiptNumber} · {money(sale.total + sale.tip)}
        </a>
      ))}
    </div>
  );

  return (
    <section id="tab" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={tab.label}
        actions={
          <>
            <Button href="/tables" variant="ghost" size="md">Tables</Button>
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="md" aria-label="Tab options">More</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setMoveOpen(true)}>Move table</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>Guests and name</DropdownMenuItem>
                  {cancellable && <DropdownMenuItem onSelect={() => run(() => cancelTab(tab.id), () => router.push("/tables"))}>Cancel tab</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {editable && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-line-strong flex flex-col gap-2 border-b p-3">
              <Input aria-label="Search products" placeholder="Search products" className="min-h-11" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div role="tablist" aria-label="Categories" className="flex gap-1 overflow-x-auto">
                {[{ id: "", name: "All" }, ...categories].map((entry) => (
                  <Button key={entry.id || "all"} role="tab" aria-selected={category === entry.id} variant="ghost" size="md" className="aria-selected:text-foreground min-h-11 shrink-0 aria-selected:bg-white/6" onClick={() => setCategory(entry.id)}>
                    {entry.name}
                  </Button>
                ))}
              </div>
              {notice && <span role="alert" className="caption-style text-danger lg:hidden">{notice}</span>}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ProductGrid products={visible} categoryIndex={categoryIndex} money={money} onPick={pick} />
            </ScrollArea>
            <Button variant="primary" size="none" className="m-3 flex min-h-12 items-center justify-between rounded-xl px-4 lg:hidden" onClick={() => setSheetOpen(true)}>
              <span>Tab · {itemCount} items</span>
              <span className="tabular-nums">{money(total)}</span>
            </Button>
          </div>
        )}
        <aside aria-label="Tab" className={cn("border-line-strong min-h-0 flex-col lg:w-[24rem] lg:border-l", editable ? "hidden lg:flex" : "flex flex-1")}>
          <ScrollArea className="min-h-0 flex-1">{linesPanel}</ScrollArea>
          {footer}
        </aside>
      </div>
      <Sheet open={sheetOpen && !wide} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="flex flex-col lg:hidden">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{tab.label}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">{linesPanel}</ScrollArea>
          {footer}
        </SheetContent>
      </Sheet>
      <VariantDialog product={variantProduct} money={money} onPick={(product, variant) => { setVariantProduct(null); choose(product, variant); }} onClose={() => setVariantProduct(null)} />
      <ModifierDialog
        target={modifierTarget}
        money={money}
        addLabel="Add to tab"
        onClose={() => setModifierTarget(null)}
        onDone={(target, selection) => {
          add(target.product, target.variant, selection);
          setModifierTarget(null);
        }}
      />
      <TextDialog request={textRequest} onClose={() => setTextRequest(null)} />
      <MoveDialog open={moveOpen} tables={freeTables} onOpenChange={setMoveOpen} onMove={(tableId) => settle(() => moveTab(tab.id, tableId))} />
      <TabDetailsDialog
        open={detailsOpen}
        initial={{ name: tab.name ?? "", guests: tab.guests ? String(tab.guests) : "" }}
        onOpenChange={setDetailsOpen}
        onSave={(details) => settle(() => updateTab(tab.id, details.name, details.guests))}
      />
    </section>
  );
}
