"use client";

import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { formatBpsAsPercent } from "@/lib/percent";
import { isOverStock, type CartLine, type Discount } from "@/lib/register/cart";
import type { PricedCart } from "@/lib/checkout";

type CartPanelProps = {
  lines: CartLine[];
  priced: PricedCart | null;
  error: string | null;
  orderDiscount: Discount;
  customer: { id: string; name: string } | null;
  pricesIncludeTax: boolean;
  needsApproval: boolean;
  approved: boolean;
  canPay: boolean;
  money: (minor: number) => string;
  onQuantity: (variantId: string, quantity: number) => void;
  onLineDiscount: (line: CartLine) => void;
  onOrderDiscount: () => void;
  onCustomer: () => void;
  onClearCustomer: () => void;
  onApprove: () => void;
  onPay: () => void;
  onClear: () => void;
};

export default function CartPanel(props: CartPanelProps) {
  const { lines, priced, money } = props;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line-strong flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2>Sale</h2>
        {lines.length > 0 && (
          <Button variant="ghost" size="md" className="min-h-11" onClick={props.onClear}>Clear</Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {lines.length === 0 ? (
          <span className="caption-style text-subtle block p-4">Tap a product or scan a barcode to start a sale.</span>
        ) : (
          <ul className="divide-line-strong divide-y">
            {lines.map((line, index) => (
              <li key={line.variantId} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate">{line.label}</span>
                    <span className="caption-style text-subtle">
                      {money(line.price)} each
                      {line.discountBps !== null ? ` · ${formatBpsAsPercent(line.discountBps)}% off` : ""}
                      {line.discountAmount !== null ? ` · ${money(line.discountAmount)} off` : ""}
                    </span>
                    {isOverStock(line) && <span className="caption-style text-warning">Only {Math.max(0, line.stock)} in stock</span>}
                  </div>
                  <span>{priced ? money(priced.lines[index].lineTotal) : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`One less ${line.label}`} onClick={() => props.onQuantity(line.variantId, line.quantity - 1)}>−</Button>
                  <span className="min-w-8 text-center" aria-label={`Quantity of ${line.label}`}>{line.quantity}</span>
                  <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`One more ${line.label}`} onClick={() => props.onQuantity(line.variantId, line.quantity + 1)}>+</Button>
                  <Button variant="ghost" size="md" className="ml-auto min-h-11" aria-label={`Discount ${line.label}`} onClick={() => props.onLineDiscount(line)}>Discount</Button>
                  <Button variant="ghost" size="md" className="min-h-11" aria-label={`Remove ${line.label}`} onClick={() => props.onQuantity(line.variantId, 0)}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <div className="border-line-strong flex flex-col gap-3 border-t p-4">
        <div className="flex gap-2">
          <Button variant="secondary" size="md" className="min-h-11 flex-1" disabled={lines.length === 0} onClick={props.onOrderDiscount}>
            {props.orderDiscount ? "Edit sale discount" : "Discount sale"}
          </Button>
          {props.customer ? (
            <Button variant="secondary" size="md" className="min-h-11 flex-1" aria-label={`Remove customer ${props.customer.name}`} onClick={props.onClearCustomer}>
              {props.customer.name} ✕
            </Button>
          ) : (
            <Button variant="secondary" size="md" className="min-h-11 flex-1" onClick={props.onCustomer}>+ Customer</Button>
          )}
        </div>
        {props.error && <span role="alert" className="caption-style text-danger">{props.error}</span>}
        {priced && (
          <dl className="flex flex-col gap-1">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(priced.subtotal)}</dd></div>
            {priced.discountTotal > 0 && <div className="flex justify-between"><dt>Discounts</dt><dd>−{money(priced.discountTotal)}</dd></div>}
            <div className="flex justify-between"><dt>{props.pricesIncludeTax ? "Tax included" : "Tax"}</dt><dd>{money(priced.taxTotal)}</dd></div>
            <div className="lead-style flex justify-between"><dt>Total</dt><dd>{money(priced.total)}</dd></div>
          </dl>
        )}
        {props.approved && <span role="status" className="caption-style text-success">Discount approved</span>}
        {props.needsApproval ? (
          <Button variant="primary" size="md" className="min-h-11" onClick={props.onApprove}>Get approval</Button>
        ) : (
          <Button variant="primary" size="md" className="min-h-11" disabled={!props.canPay} onClick={props.onPay}>
            {priced && lines.length > 0 ? `Pay ${money(priced.total)}` : "Pay"}
          </Button>
        )}
      </div>
    </div>
  );
}
