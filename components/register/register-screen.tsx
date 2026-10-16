"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/_ui/button";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { ScrollArea } from "@/components/_ui/scroll-area";
import PageHeader from "@/components/_common/page-header";
import ProductGrid from "./product-grid";
import CartPanel from "./cart-panel";
import VariantDialog from "./variant-dialog";
import DiscountDialog from "./discount-dialog";
import PayDialog from "./pay-dialog";
import ApprovalDialog from "./approval-dialog";
import CustomerDialog from "./customer-dialog";
import CloseTillDialog from "./close-till-dialog";
import ChangeRegisterButton from "./change-register-button";
import SaleDone from "./sale-done";
import ModifierDialog, { type ModifierTarget } from "./modifier-dialog";
import { selectionFromIds, type Selection } from "@/lib/modifiers";
import ReturnDialog from "./return-dialog";
import TabPayPicker from "./tab-pay-picker";
import { payTab } from "@/lib/tabs/actions";
import { clampPick, partsFrom, pickAll, setPick, tabCartLines, type PayPick } from "@/lib/tabs/lines";
import type { TabView } from "@/lib/tabs/queries";
import VoidDialog from "@/components/refunds/void-dialog";
import { useOnline } from "@/hooks/use-online";
import { CartError, discountShareBps, priceCart, type PaymentInput } from "@/lib/checkout";
import { formatMoney } from "@/lib/money";
import { completeSale } from "@/lib/register/actions";
import {
  addToCart,
  cartInputs,
  changeSelection,
  discountInput,
  findByCode,
  searchProducts,
  setLineDiscount,
  setQuantity,
  type CartLine,
  type Discount,
  type RegisterProduct,
  type RegisterVariant,
} from "@/lib/register/cart";
import type { StaffRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type RegisterScreenProps = {
  sessionId: string;
  registerName: string;
  role: StaffRole;
  currency: string;
  pricesIncludeTax: boolean;
  maxCashierDiscountBps: number;
  products: RegisterProduct[];
  categories: { id: string; name: string }[];
  lastOrderId: string | null;
  tab: TabView | null;
};

type DiscountTarget = { kind: "line"; line: CartLine } | { kind: "order" } | null;
type Done = { orderId: string; receiptNumber: number; change: number; total: number; tip: number; kitchen: boolean; tabPaid: boolean | null };

export default function RegisterScreen(props: RegisterScreenProps) {
  const online = useOnline();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const money = (minor: number) => formatMoney(minor, props.currency, "en-US");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tabPick, setPickState] = useState<PayPick>(() => (props.tab ? pickAll(props.tab.lines) : {}));
  const [tabDiscounts, setTabDiscounts] = useState<Record<string, Discount>>({});
  const livePick = useMemo(() => (props.tab ? clampPick(tabPick, props.tab.lines) : {}), [props.tab, tabPick]);
  const tabCart = useMemo(() => (props.tab ? tabCartLines(props.tab.lines, props.products, livePick, tabDiscounts) : null), [props.tab, props.products, livePick, tabDiscounts]);
  const saleLines = tabCart ? tabCart.lines : lines;
  const [orderDiscount, setOrderDiscount] = useState<Discount>(null);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [approval, setApproval] = useState<{ id: string; maxBps: number; maxDiscount: number } | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [variantProduct, setVariantProduct] = useState<RegisterProduct | null>(null);
  const [discountTarget, setDiscountTarget] = useState<DiscountTarget>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [modifierTarget, setModifierTarget] = useState<ModifierTarget | null>(null);
  const [orderName, setOrderName] = useState("");
  const [voidOpen, setVoidOpen] = useState(false);
  const [lastOrderId, setLastOrderId] = useState(props.lastOrderId);

  const categoryIndex = useMemo(() => new Map(props.categories.map((entry, index) => [entry.id, index])), [props.categories]);
  const visible = useMemo(() => searchProducts(props.products, query, category), [props.products, query, category]);
  const pricing = useMemo(() => {
    try {
      return { priced: priceCart(cartInputs(saleLines), discountInput(orderDiscount), props.pricesIncludeTax), error: null };
    } catch (error) {
      return { priced: null, error: error instanceof CartError ? error.message : "Something in this sale isn't valid." };
    }
  }, [saleLines, orderDiscount, props.pricesIncludeTax]);

  const shareBps = pricing.priced ? discountShareBps(pricing.priced.subtotal, pricing.priced.discountTotal) : 0;
  const overLimit = props.role === "cashier" && shareBps > props.maxCashierDiscountBps;
  const discountTotal = pricing.priced?.discountTotal ?? 0;
  const approved = overLimit && approval !== null && approval.maxBps >= shareBps && approval.maxDiscount >= discountTotal;
  const needsApproval = overLimit && !approved;
  const canPay = saleLines.length > 0 && pricing.priced !== null && !needsApproval && online;

  function add(product: RegisterProduct, variant: RegisterVariant, selection: Selection = {}) {
    setLines((current) => addToCart(current, product, variant, selection));
    setNotice(null);
    searchRef.current?.focus();
  }

  function choose(product: RegisterProduct, variant: RegisterVariant) {
    if (product.modifierGroups.length > 0) setModifierTarget({ product, variant, selection: {}, editKey: null });
    else add(product, variant);
  }

  function editChoices(line: CartLine) {
    const product = props.products.find((entry) => entry.variants.some((variant) => variant.id === line.variantId));
    const variant = product?.variants.find((entry) => entry.id === line.variantId);
    if (!product || !variant) return;
    setModifierTarget({ product, variant, selection: selectionFromIds(product.modifierGroups, line.optionIds), editKey: line.key });
  }


  function refocusSearch(event: Event) {
    event.preventDefault();
    searchRef.current?.focus();
  }

  function pick(product: RegisterProduct) {
    if (product.variants.length === 1) choose(product, product.variants[0]);
    else setVariantProduct(product);
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const match = findByCode(props.products, query);
    if (match) {
      choose(match.product, match.variant);
      setQuery("");
    } else if (visible.length === 1 && visible[0].variants.length === 1) {
      choose(visible[0], visible[0].variants[0]);
      setQuery("");
    } else if (visible.length === 0) {
      setNotice(`Nothing matches "${query}".`);
    }
  }

  function reset() {
    setLines([]);
    setOrderDiscount(null);
    setCustomer(null);
    setApproval(null);
    setQuery("");
    setNotice(null);
    setOrderName("");
    setPickState({});
    setTabDiscounts({});
  }

  function changeQuantity(key: string, quantity: number) {
    if (!props.tab) {
      setLines((current) => setQuantity(current, key, quantity));
      return;
    }
    const line = props.tab.lines.find((entry) => entry.id === key);
    if (line) setPickState((current) => setPick(clampPick(current, props.tab!.lines), line, quantity));
  }

  function changeLineDiscount(key: string, discount: Discount) {
    if (props.tab) setTabDiscounts((current) => ({ ...current, [key]: discount }));
    else setLines((current) => setLineDiscount(current, key, discount));
  }

  async function complete(payments: PaymentInput[], tip: number): Promise<string | null> {
    const common = {
      orderDiscount: discountInput(orderDiscount),
      approvalId: approved && approval ? approval.id : null,
      customerId: customer?.id ?? null,
      payments,
      tip,
    };
    const result = props.tab
      ? await payTab({ tabId: props.tab.id, sessionId: props.sessionId, parts: partsFrom(livePick, tabDiscounts), ...common })
      : await completeSale({
          sessionId: props.sessionId,
          lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, discountBps: line.discountBps, discountAmount: line.discountAmount, optionIds: line.optionIds })),
          ...common,
          orderName: orderName.trim() || undefined,
        });
    if (!result.ok) {
      if (result.kind === "approval") {
        setApproval(null);
        setPayOpen(false);
        setNotice(result.error);
      }
      if (result.kind === "closed") router.refresh();
      return result.error;
    }
    setPayOpen(false);
    setDone({ orderId: result.orderId, receiptNumber: result.receiptNumber, change: result.change, total: result.total, tip, kitchen: !props.tab && saleLines.some((line) => line.kitchen), tabPaid: "tabPaid" in result ? result.tabPaid === true : null });
    setLastOrderId(result.orderId);
    reset();
    if (props.tab) router.refresh();
    return null;
  }

  return (
    <section id="register" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={props.tab ? `Register · ${props.registerName} · ${props.tab.label}` : `Register · ${props.registerName}`}
        actions={
          <>
            {props.tab && (
              <Button href={`/tabs/${props.tab.id}`} variant="ghost" size="md" className="min-h-11">
                Back to tab
              </Button>
            )}
            {lastOrderId && (
              <a href={`/receipts/${lastOrderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "md" }), "min-h-11")}>
                Reprint last receipt
              </a>
            )}
            <ReturnDialog sessionId={props.sessionId} role={props.role} currency={props.currency} />
            <CloseTillDialog sessionId={props.sessionId} currency={props.currency} money={money} />
            <ChangeRegisterButton />
          </>
        }
      />
      {done ? (
        <SaleDone
          orderId={done.orderId}
          receiptNumber={done.receiptNumber}
          total={done.total}
          tip={done.tip}
          kitchen={done.kitchen}
          change={done.change}
          money={money}
          tab={done.tabPaid === null ? null : { paid: done.tabPaid }}
          onNewSale={() => {
            setDone(null);
            if (props.tab) setPickState(pickAll(props.tab.lines));
          }}
          onVoid={() => setVoidOpen(true)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {props.tab ? (
            <ScrollArea className="min-h-0 flex-1">
              <TabPayPicker
                label={props.tab.label}
                lines={props.tab.lines}
                products={props.products}
                pick={livePick}
                missing={tabCart?.missing ?? []}
                onPick={(line, quantity) => setPickState((current) => setPick(clampPick(current, props.tab!.lines), line, quantity))}
                onAll={() => setPickState(pickAll(props.tab!.lines))}
                onNone={() => setPickState({})}
              />
            </ScrollArea>
            ) : (
              <>
              <div className="border-line-strong flex flex-col gap-2 border-b p-3">
                <Input
                  ref={searchRef}
                  aria-label="Search or scan a barcode"
                  placeholder="Search or scan a barcode"
                  className="min-h-11"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onSearchKey}
                  autoFocus
                />
                {notice && <span role="status" className="caption-style text-warning">{notice}</span>}
                <div role="tablist" aria-label="Categories" className="flex gap-1 overflow-x-auto">
                  {[{ id: "", name: "All" }, ...props.categories].map((entry) => (
                    <Button
                      key={entry.id || "all"}
                      role="tab"
                      aria-selected={category === entry.id}
                      variant="ghost"
                      size="md"
                      className="aria-selected:text-foreground min-h-11 shrink-0 aria-selected:bg-white/6"
                      onClick={() => setCategory(entry.id)}
                    >
                      {entry.name}
                    </Button>
                  ))}
                </div>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <ProductGrid products={visible} categoryIndex={categoryIndex} money={money} onPick={pick} />
              </ScrollArea>
              </>
            )}
          </div>
          <aside aria-label="Current sale" className="border-line-strong flex min-h-[22rem] flex-col border-t lg:w-[24rem] lg:border-t-0 lg:border-l">
            <CartPanel
              lines={saleLines}
              priced={pricing.priced}
              error={pricing.error}
              orderDiscount={orderDiscount}
              customer={customer}
              pricesIncludeTax={props.pricesIncludeTax}
              needsApproval={needsApproval}
              approved={approved}
              canPay={canPay}
              money={money}
              onQuantity={changeQuantity}
              showOrderName={!props.tab}
              orderName={orderName}
              onOrderName={setOrderName}
              canEdit={(line) => !props.tab && props.products.some((product) => product.modifierGroups.length > 0 && product.variants.some((variant) => variant.id === line.variantId))}
              onEditChoices={editChoices}
              onLineDiscount={(line) => setDiscountTarget({ kind: "line", line })}
              onOrderDiscount={() => setDiscountTarget({ kind: "order" })}
              onCustomer={() => setCustomerOpen(true)}
              onClearCustomer={() => setCustomer(null)}
              onApprove={() => setApprovalOpen(true)}
              onPay={() => setPayOpen(true)}
              onClear={reset}
            />
          </aside>
        </div>
      )}
      <VariantDialog
        product={variantProduct}
        money={money}
        onPick={(product, variant) => {
          setVariantProduct(null);
          choose(product, variant);
        }}
        onClose={() => setVariantProduct(null)}
        onCloseAutoFocus={refocusSearch}
      />
      <ModifierDialog
        target={modifierTarget}
        money={money}
        onClose={() => setModifierTarget(null)}
        onDone={(target, selection) => {
          if (target.editKey) {
            const key = target.editKey;
            setLines((current) => changeSelection(current, key, target.product, selection));
          } else {
            add(target.product, target.variant, selection);
          }
          setModifierTarget(null);
        }}
      />
      <DiscountDialog
        open={discountTarget !== null}
        onOpenChange={(open) => !open && setDiscountTarget(null)}
        title={discountTarget?.kind === "line" ? `Discount ${discountTarget.line.label}` : "Discount the whole sale"}
        current={
          discountTarget?.kind === "line"
            ? discountTarget.line.discountBps !== null
              ? { bps: discountTarget.line.discountBps }
              : discountTarget.line.discountAmount !== null
                ? { amount: discountTarget.line.discountAmount }
                : null
            : orderDiscount
        }
        currency={props.currency}
        onApply={(discount) => {
          if (discountTarget?.kind === "line") changeLineDiscount(discountTarget.line.key, discount);
          else setOrderDiscount(discount);
          setDiscountTarget(null);
        }}
      />
      <PayDialog open={payOpen} onOpenChange={setPayOpen} total={pricing.priced?.total ?? 0} currency={props.currency} offline={!online} money={money} onComplete={complete} />
      <ApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        shareBps={shareBps}
        discountTotal={discountTotal}
        money={money}
        onApproved={(granted) => {
          setApproval(granted);
          setApprovalOpen(false);
        }}
      />
      <CustomerDialog
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        onPick={(picked) => {
          setCustomer(picked);
          setCustomerOpen(false);
        }}
      />
      {done && (
        <VoidDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          orderId={done.orderId}
          receiptNumber={done.receiptNumber}
          total={done.total + done.tip}
          money={money}
          onVoided={() => {
            setVoidOpen(false);
            setNotice(`Receipt #${done.receiptNumber} voided.`);
            setLastOrderId(null);
            setDone(null);
          }}
        />
      )}
    </section>
  );
}
